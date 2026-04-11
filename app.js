import { loadState, saveState } from "./db.js";
/* ---------------- utils ---------------- */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
function uid(prefix="id"){ return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }
function pad(n){ return String(n).padStart(2,"0"); }
function formatDateISO(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function formatDateBR(iso){ if(!iso) return ""; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; }
function nowLocalISODateTime(){
  const d=new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDateTimeBR(isoDT){
  if(!isoDT) return "";
  const [date,time]=String(isoDT).split("T");
  return `${formatDateBR(date)} ${String(time||"").slice(0,5)}`;
}
function formatTimeBR(isoDT){
  if(!isoDT) return "";
  const [,time=""] = String(isoDT).split("T");
  return String(time).slice(0,5);
}
function toLocalISODateTimeFromTimestamp(ts){
  if(!ts) return "";
  const d = new Date(ts);
  if(Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function onlyDigits(s=""){ return String(s).replace(/\D+/g,""); }
function sanitizeInteger(value="", maxLen=30){
  return onlyDigits(value).slice(0, maxLen);
}
function sanitizeDecimal(value="", maxLen=6){
  let cleaned = String(value||"").replace(/[^\d.,]/g, "");
  const match = cleaned.match(/[.,]/);
  if(match){
    const idx = match.index;
    cleaned = cleaned.slice(0, idx + 1) + cleaned.slice(idx + 1).replace(/[.,]/g, "");
  }
  return cleaned.slice(0, maxLen);
}
function parseNascimentoDigitado(raw=""){
  const digits = onlyDigits(raw).slice(0,8);
  if(!(digits.length===6 || digits.length===8)) return null;
  const dia = Number(digits.slice(0,2));
  const mes = Number(digits.slice(2,4));
  let ano;
  if(digits.length===8){
    ano = Number(digits.slice(4,8));
  }else{
    const yy = Number(digits.slice(4,6));
    const currentYY = new Date().getFullYear() % 100;
    ano = yy <= currentYY ? (2000 + yy) : (1900 + yy);
  }
  const dt = new Date(ano, mes - 1, dia);
  if(
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== ano ||
    dt.getMonth() !== mes - 1 ||
    dt.getDate() !== dia
  ) return null;
  return {
    iso: `${ano}-${pad(mes)}-${pad(dia)}`,
    display: `${pad(dia)}/${pad(mes)}/${ano}`
  };
}
function formatNascimentoInput(raw=""){
  const value = String(raw || "").trim();
  if(!value) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const [y,m,d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const parsed = parseNascimentoDigitado(value);
  if(parsed) return parsed.display;
  const digits = onlyDigits(value).slice(0,8);
  if(digits.length<=2) return digits;
  if(digits.length<=4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}
function normalizeForSearch(s=""){
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
function debounce(fn, ms=450){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}
function safeClone(obj){
  try{ return structuredClone(obj); }catch{ return JSON.parse(JSON.stringify(obj)); }
}
// CPF validation + mask
function isValidCPF(input){
  const cpf = onlyDigits(input);
  if(cpf.length!==11) return false;
  if(/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base)=>{
    let sum=0;
    for(let i=0;i<base;i++) sum += Number(cpf[i])*(base+1-i);
    const mod = sum%11;
    return mod<2?0:11-mod;
  };
  const d1 = calc(9);
  let sum=0; for(let i=0;i<10;i++) sum += Number(cpf[i])*(11-i);
  const mod=sum%11; const d2=mod<2?0:11-mod;
  return Number(cpf[9])===d1 && Number(cpf[10])===d2;
}
function maskCPF(input){
  const cpf = onlyDigits(input).slice(0,11);
  if(cpf.length<=3) return cpf;
  if(cpf.length<=6) return `${cpf.slice(0,3)}.${cpf.slice(3)}`;
  if(cpf.length<=9) return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6)}`;
  return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9,11)}`;
}
/* ---------------- state ---------------- */
const defaultState = () => ({
  version: 14,
  lastSavedAt: null,
  days: [],
  favorites: { reguladores: [], unidades: [] }
});
const PROCEDIMENTO_LABELS = {
  abordagem: "Abordagem",
  avaliacao: "Avaliação",
  curativo: "Curativo",
  examePrimario: "Exame primário",
  exameSecundario: "Exame secundário",
  imobilizacao: "Imobilização",
  colarCervical: "Imobilização com colar cervical",
  transporte: "Transporte",
  rcp: "RCP"
};
const PUPILA_LABELS = {
  isocorica: "Isocórica",
  miotica: "Miotica",
  midriatica: "Midriatica",
  anisocorica: "Anisocórica"
};
const QTO_VIATURA_PREFIXES = ["ABR", "ABS", "ABT"];
function isQtoViatura(viatura=""){
  const v = String(viatura || "").trim().toUpperCase();
  return QTO_VIATURA_PREFIXES.some(prefix => (
    v === prefix ||
    v.startsWith(prefix + "-") ||
    v.startsWith(prefix + " ") ||
    v.startsWith(prefix + "_") ||
    new RegExp(`^${prefix}\\d`).test(v)
  ));
}
function ensureQtoShape(qto={}){
  return {
    ...qto,
    startedAt: qto.startedAt || toLocalISODateTimeFromTimestamp(qto.createdAt) || nowLocalISODateTime(),
    status: qto.status || "draft",
    observacoes: qto.observacoes || ""
  };
}
function getProcedimentosSelecionados(procedimentos={}){
  return Object.entries(PROCEDIMENTO_LABELS)
    .filter(([key]) => !!procedimentos?.[key])
    .map(([,label]) => label);
}
function formatPupilaResumo(pupila={}){
  const tipo = PUPILA_LABELS[pupila?.tipo] || "";
  const lados = [];
  if(pupila?.esquerda) lados.push("esquerda");
  if(pupila?.direita) lados.push("direita");
  if(!tipo && !pupila?.reagente) return "";
  let resumo = tipo || "Sem tipo informado";
  if(pupila?.reagente){
    resumo += lados.length ? ` • reagente (${lados.join(" e ")})` : " • reagente";
  }
  return resumo;
}
function ensureEvaluationShape(ev={}){
  const vitais = ev.vitais || {};
  return {
    ...ev,
    startedAt: ev.startedAt || toLocalISODateTimeFromTimestamp(ev.createdAt) || nowLocalISODateTime(),
    pessoa: {
      nome: "",
      documento: "",
      nascimento: "",
      idade: "",
      ...(ev.pessoa || {})
    },
    vitais: {
      pa: { prejudicada:false, pas:"", pad:"", ...(vitais.pa || {}) },
      fc: { prejudicada:false, valor:"", ...(vitais.fc || {}) },
      spo2: { prejudicada:false, valor:"", ...(vitais.spo2 || {}) },
      mr: { prejudicada:false, valor:"", ...(vitais.mr || {}) },
      temperatura: vitais.temperatura || "",
      glasgow: vitais.glasgow || "",
      pupila: {
        tipo: "",
        reagente: false,
        esquerda: false,
        direita: false,
        ...(vitais.pupila || {})
      }
    },
    procedimentos: {
      abordagem: false,
      avaliacao: false,
      curativo: false,
      examePrimario: false,
      exameSecundario: false,
      imobilizacao: false,
      colarCervical: false,
      transporte: false,
      rcp: false,
      ...(ev.procedimentos || {})
    },
    regulacao: {
      regulador: "",
      senha: "",
      unidade: "",
      ...(ev.regulacao || {})
    },
    admissao: {
      tipo: "",
      genero: "",
      nome: "",
      macaRetida: false,
      dataHora: "",
      ...(ev.admissao || {})
    }
  };
}
function normalizeState(state){
  const base = defaultState();
  const next = {
    ...base,
    ...(state || {}),
    favorites: {
      reguladores: state?.favorites?.reguladores || [],
      unidades: state?.favorites?.unidades || []
    }
  };
  next.version = 14;
  next.days = (state?.days || []).map(day => ({
    ...day,
    evaluations: (day.evaluations || []).map(ensureEvaluationShape),
    qtos: (day.qtos || []).map(ensureQtoShape)
  }));
  return next;
}
let STATE = defaultState();
let HYDRATED = false;
const persist = debounce(async ()=>{
  STATE.lastSavedAt = Date.now();
  await saveState(STATE);
}, 450);
async function init(){
  const loaded = await loadState();
  if(loaded){
    STATE = normalizeState(loaded);
    if((loaded.version || 0) < 14) saveState(STATE).catch(()=>{});
  }else{
    STATE = defaultState();
  }
  HYDRATED = true;
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
  window.addEventListener("hashchange", ()=>{ saveState(STATE).catch(()=>{}); render(); });
  document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") saveState(STATE).catch(()=>{}); });
  window.addEventListener("pagehide", ()=>{ saveState(STATE).catch(()=>{}); });
  if(!location.hash) location.hash = "#/";
  render();
}
function setState(mutator, opts={ render:true }){
  mutator(STATE);
  persist();
  if(opts.render) render();
}
function getDay(dayId){ return (STATE.days||[]).find(d=>d.id===dayId); }
function getEval(day, evId){ return (day?.evaluations||[]).find(e=>e.id===evId); }
function getQto(day, qtoId){ return (day?.qtos||[]).find(q=>q.id===qtoId); }
function displayName(ev){
  const nome = (ev?.pessoa?.nome||"").trim();
  return nome ? nome : "Não identificado";
}
/* ---------------- actions ---------------- */
function createDay({viatura, integrantesText, dateISO}){
  const day = {
    id: uid("day"),
    dateISO: dateISO || formatDateISO(new Date()),
    viatura: viatura || "",
    integrantesText: integrantesText || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    evaluations: [],
    qtos: []
  };
  setState(s => { s.days = [day, ...(s.days||[])]; });
  return day.id;
}
function deleteDay(dayId){
  setState(s => { s.days = (s.days||[]).filter(d=>d.id!==dayId); });
}
function createEvaluation(dayId){
  const ev = ensureEvaluationShape({
    id: uid("ev"),
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: nowLocalISODateTime(),
    protocolo: "",
    pessoa: { nome:"", documento:"", nascimento:"", idade:"" },
    docTipo: "documento",
    endereco: "",
    gps: "",
    vitais: {
      pa: { prejudicada:false, pas:"", pad:"" },
      fc: { prejudicada:false, valor:"" },
      spo2:{ prejudicada:false, valor:"" },
      mr: { prejudicada:false, valor:"" },
      temperatura: "",
      glasgow: "",
      pupila: { tipo:"", reagente:false, esquerda:false, direita:false }
    },
    procedimentos: {
      abordagem:false,
      avaliacao:false,
      curativo:false,
      examePrimario:false,
      exameSecundario:false,
      imobilizacao:false,
      colarCervical:false,
      transporte:false,
      rcp:false
    },
    casoClinico: "",
    regulacao: { regulador:"", senha:"", unidade:"" },
    admissao: {
      tipo:"",
      genero:"",
      nome:"",
      macaRetida:false,
      dataHora:""
    }
  });
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    d.evaluations = [ev, ...(d.evaluations||[])];
    d.updatedAt = Date.now();
  });
  return ev.id;
}
function createQto(dayId){
  const qto = ensureQtoShape({
    id: uid("qto"),
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: nowLocalISODateTime(),
    observacoes: ""
  });
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    d.qtos = [qto, ...(d.qtos||[])];
    d.updatedAt = Date.now();
  });
  return qto.id;
}
function updateEvaluation(dayId, evId, nextEv, opts={ render:true }){
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    nextEv.updatedAt = Date.now();
    d.evaluations = (d.evaluations||[]).map(e=> e.id===evId ? nextEv : e);
    d.updatedAt = Date.now();
  }, opts);
}
function deleteEvaluation(dayId, evId){
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    d.evaluations = (d.evaluations||[]).filter(e=>e.id!==evId);
    d.updatedAt = Date.now();
  });
}
function updateQto(dayId, qtoId, nextQto, opts={ render:true }){
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    nextQto.updatedAt = Date.now();
    d.qtos = (d.qtos||[]).map(q=> q.id===qtoId ? nextQto : q);
    d.updatedAt = Date.now();
  }, opts);
}
function deleteQto(dayId, qtoId){
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    d.qtos = (d.qtos||[]).filter(q=>q.id!==qtoId);
    d.updatedAt = Date.now();
  });
}
function toggleFavorite(kind, value){
  const v = String(value||"").trim();
  if(!v) return;
  const key = kind==="regulador" ? "reguladores" : "unidades";
  setState(s=>{
    const arr = s.favorites?.[key] || [];
    const exists = arr.some(x=>x.toLowerCase()===v.toLowerCase());
    s.favorites = s.favorites || { reguladores:[], unidades:[] };
    s.favorites[key] = exists ? arr.filter(x=>x.toLowerCase()!==v.toLowerCase()) : [v, ...arr];
    s.favorites[key] = s.favorites[key].slice(0, 30);
  });
}
/* ---------------- UI helpers ---------------- */
function topbar({left="", title="", right=""}){
  return `
  <header class="topbar">
    <div class="topbar__left">${left}</div>
    <div class="topbar__title">${escapeHTML(title)}</div>
    <div class="topbar__right">${right}</div>
  </header>`;
}
function btn(label, cls="", attrs=""){ return `<button class="btn ${cls}" ${attrs}>${label}</button>`; }
function card(inner, clickable=false, attrs=""){ return `<div class="card ${clickable?'clickable':''}" ${attrs}>${inner}</div>`; }
function field(label, control, hint=""){ return `
  <div class="field">
    <div class="label">${label}</div>
    ${control}
    ${hint?`<div class="hint">${hint}</div>`:""}
  </div>
  `; 
}
function section(title, body){
  return `<details class="section" open>
    <summary>${escapeHTML(title)}</summary>
    <div class="section-body">${body}</div>
  </details>`;
}
function pill(text, kind){ return `<span class="pill ${kind}">${text}</span>`; }
function toast(text){
  if(!text) return "";
  return `<div class="toast">${escapeHTML(text)}</div>`;
}
function escapeHTML(s=""){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
let TOAST = "";
function setToast(msg){
  TOAST = msg;
  render();
  setTimeout(()=>{ TOAST=""; render(); }, 1800);
}
function openModal(html){
  const el = document.createElement("div");
  el.className = "modal-backdrop";
  el.innerHTML = html;
  document.body.appendChild(el);
  el.addEventListener("click", (e)=>{
    if(e.target===el) closeModal(el);
  });
  return el;
}
function closeModal(el){ if(el && el.parentNode) el.parentNode.removeChild(el); }
/* ---------------- routing/render ---------------- */
function parseRoute(){
  const h = location.hash.replace(/^#/, "");
  const parts = h.split("/").filter(Boolean);
  if(parts.length===0) return { name:"days" };
  if(parts[0]==="day" && parts[1] && parts.length===2) return { name:"day", dayId:parts[1] };
  if(parts[0]==="day" && parts[1] && parts[2]==="ev" && parts[3]) return { name:"eval", dayId:parts[1], evId:parts[3] };
  if(parts[0]==="day" && parts[1] && parts[2]==="qto" && parts[3]) return { name:"qto", dayId:parts[1], qtoId:parts[3] };
  return { name:"days" };
}
function render(){
  const app = $("#app");
  if(!HYDRATED){
    app.innerHTML = topbar({title:"Triagem GU"}) + `<main class="content"><div class="muted">Carregando dados locais...</div></main>`;
    return;
  }
  const route = parseRoute();
  if(route.name==="days") renderDays(app);
  else if(route.name==="day") renderDay(app, route.dayId);
  else if(route.name==="eval") renderEval(app, route.dayId, route.evId);
  else if(route.name==="qto") renderQto(app, route.dayId, route.qtoId);
}
function renderDays(app){
  const right = btn("+ Novo dia","primary",`id="newDayBtn" type="button"`);
  app.innerHTML = topbar({title:"Triagem GU", right}) + `
    <main class="content">
      ${(STATE.days||[]).length===0 ? `
        <div class="card"><div class="title">Nenhum dia cadastrado</div>
        <div class="muted">Toque em <b>+ Novo dia</b> para começar.</div></div>
      ` : `
        <div class="list">
          ${(STATE.days||[]).map(d=>{
            const count = (d.integrantesText||"").split("\n").map(x=>x.trim()).filter(Boolean).length;
            return card(`
              <div class="row space">
                <div>
                  <div class="title">${escapeHTML(formatDateBR(d.dateISO))} — ${escapeHTML(d.viatura||"Sem viatura")}</div>
                  <div class="muted">${count} integrante(s) • ${isQtoViatura(d.viatura||"") ? ((d.qtos||[]).length + ' QTO(s)') : ((d.evaluations||[]).length + ' avaliação(ões)')}</div>
                </div>
                ${btn("🗑","ghost",`data-del-day="${d.id}" aria-label="Excluir dia" type="button"`)}
              </div>
            `, true, `data-open-day="${d.id}"`);
          }).join("")}
        </div>
      `}
    </main>
    ${toast(TOAST)}
  `;
  $("#newDayBtn").onclick = () => showNewDayModal();
  $$("[data-open-day]").forEach(el=>{ el.onclick = ()=>{ location.hash = `#/day/${el.getAttribute("data-open-day")}`; }; });
  $$("[data-del-day]").forEach(b=>{
    b.onclick = (e)=>{
      e.stopPropagation();
      const id = b.getAttribute("data-del-day");
      const ok = confirm("Excluir este dia e todas as avaliações? Esta ação não pode ser desfeita.");
      if(ok) deleteDay(id);
    };
  });
}
function showNewDayModal(){
  const today = formatDateISO(new Date());
  const modal = openModal(`
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Novo dia de serviço</div>
        ${btn("✕","ghost",`id="closeModalBtn" type="button"`)}
      </div>
      <div class="modal-body">
        ${field("Viatura", `<input class="input" id="viatura" placeholder="Ex.: UR-12 / ASU-01" />`)}
        ${field("Integrantes (1 por linha)",
          `<textarea class="textarea" id="integrantes" rows="5" placeholder="Digite um nome por linha..."></textarea>`,
          `Ex.: Rodrigo Dias Batista ↵ Lidiane Batista Sousa ↵ Américo Gonçalves`
        )}
        ${field("Data", `<input class="input" type="date" id="dateISO" value="${today}" />`)}
      </div>
      <div class="modal-footer">
        ${btn("Cancelar","ghost",`id="cancelBtn" type="button"`)}
        ${btn("Salvar dia","primary",`id="saveDayBtn" type="button"`)}
      </div>
    </div>
  `);
  $("#closeModalBtn", modal).onclick = ()=>closeModal(modal);
  $("#cancelBtn", modal).onclick = ()=>closeModal(modal);
  $("#saveDayBtn", modal).onclick = ()=>{
    const viatura = $("#viatura", modal).value;
    const integrantesText = $("#integrantes", modal).value;
    const dateISO = $("#dateISO", modal).value || today;
    const id = createDay({viatura, integrantesText, dateISO});
    closeModal(modal);
    location.hash = `#/day/${id}`;
  };
}
function renderDay(app, dayId){
  const day = getDay(dayId);
  if(!day){
    app.innerHTML = topbar({title:"Dia não encontrado", left:btn("←","ghost",`type="button" id="backBtn"`)}) +
      `<main class="content"><div class="muted">Este dia não existe (ou foi excluído).</div></main>`;
    $("#backBtn").onclick = ()=>location.hash="#/";
    return;
  }
  const qtoMode = isQtoViatura(day.viatura || "");
  const right = btn(qtoMode ? "+ QTO" : "+ Avaliação","primary",`type="button" id="newRecordBtn"`);
  const left = btn("←","ghost",`type="button" id="backBtn"`);
  const countIntegrantes = (day.integrantesText||"").split("\n").map(x=>x.trim()).filter(Boolean).length;
  app.innerHTML = topbar({title:`${formatDateBR(day.dateISO)} — ${day.viatura||"Sem viatura"}`, left, right}) + `
    <main class="content">
      <div class="muted">${countIntegrantes} integrante(s)</div>
      ${qtoMode ? `<div class="hint" style="margin-top:8px">Viatura identificada como ${escapeHTML(day.viatura||"")}. Neste dia, o fluxo seguirá por <b>QTO</b>.</div>` : ``}
      <div class="searchbar">
        <input class="input" id="q" placeholder="${qtoMode ? 'Buscar QTO…' : 'Buscar por protocolo, nome ou documento…'}" />
        ${btn("Limpar","ghost",`type="button" id="clearQBtn"`)}
      </div>
      <div class="list" id="evalList"></div>
      ${qtoMode ? `` : `
        <div style="margin-top:12px">
          ${btn("Copiar todos protocolos","ghost",`type="button" id="copyProtocolsBtn"`)}
        </div>
      `}
    </main>
    ${toast(TOAST)}
  `;
  $("#backBtn").onclick = ()=>location.hash="#/";
  $("#newRecordBtn").onclick = ()=>{
    if(qtoMode){
      const qtoId = createQto(day.id);
      location.hash = `#/day/${day.id}/qto/${qtoId}`;
      return;
    }
    const evId = createEvaluation(day.id);
    location.hash = `#/day/${day.id}/ev/${evId}`;
  };
  const listEl = $("#evalList");
  const renderList = ()=>{
    const q = normalizeForSearch($("#q").value);
    if(qtoMode){
      const list = (day.qtos||[]).filter((qto, index)=>{
        if(!q) return true;
        const label = normalizeForSearch(`QTO ${index+1}`);
        const obs = normalizeForSearch(qto.observacoes || "");
        return label.includes(q) || obs.includes(q);
      });
      if(list.length===0){
        listEl.innerHTML = card(`<div class="title">Nenhum QTO</div><div class="muted">Toque em <b>+ QTO</b> para validar o novo fluxo.</div>`);
        return;
      }
      listEl.innerHTML = list.map((qto, index)=>{
        const st = qto.status==="saved" ? pill("FINAL","ok") : pill("DRAFT","draft");
        const created = formatTimeBR(qto.startedAt || toLocalISODateTimeFromTimestamp(qto.createdAt)) || "--:--";
        return card(`
          <div class="row space">
            <div>
              <div class="title">${escapeHTML(`QTO ${index+1}`)}</div>
              <div class="muted">${qto.status==="saved"?"✅ Salvo":"📝 Rascunho"} • iniciado às ${escapeHTML(created)}</div>
            </div>
            ${st}
          </div>
        `, true, `data-open-qto="${qto.id}"`);
      }).join("");
      $$('[data-open-qto]').forEach(el=>{
        el.onclick = ()=> location.hash = `#/day/${day.id}/qto/${el.getAttribute("data-open-qto")}`;
      });
      return;
    }
    const list = (day.evaluations||[]).filter(ev=>{
      if(!q) return true;
      const protocolo = normalizeForSearch(ev.protocolo||"");
      const nome = normalizeForSearch(displayName(ev));
      const doc = normalizeForSearch(ev.pessoa?.documento||"");
      return protocolo.includes(q) || nome.includes(q) || doc.includes(q);
    });
    if(list.length===0){
      listEl.innerHTML = card(`<div class="title">Nenhuma avaliação</div><div class="muted">Toque em <b>+ Avaliação</b> para iniciar (salva automaticamente).</div>`);
      return;
    }
    listEl.innerHTML = list.map(ev=>{
      const st = ev.status==="saved" ? pill("FINAL","ok") : pill("DRAFT","draft");
      return card(`
        <div class="row space">
          <div>
            <div class="title">${escapeHTML(ev.protocolo||"Sem protocolo")} — ${escapeHTML(displayName(ev))}</div>
            <div class="muted">${ev.status==="saved"?"✅ Salva":"📝 Rascunho"}${ev.regulacao?.unidade?` • ${escapeHTML(ev.regulacao.unidade)}`:""}</div>
          </div>
          ${st}
        </div>
      `, true, `data-open-ev="${ev.id}"`);
    }).join("");
    $$('[data-open-ev]').forEach(el=>{
      el.onclick = ()=> location.hash = `#/day/${day.id}/ev/${el.getAttribute("data-open-ev")}`;
    });
  };
  $("#q").addEventListener("input", renderList);
  $("#clearQBtn").onclick = ()=>{ $("#q").value=""; renderList(); };
  if(!qtoMode && $("#copyProtocolsBtn")) $("#copyProtocolsBtn").onclick = ()=>showCopyProtocolsModal(day);
  renderList();
}
function generateResumo(day, ev){
  const linhas=[];
  const inicioAvaliacao = ev.startedAt || toLocalISODateTimeFromTimestamp(ev.createdAt);
  linhas.push(`Protocolo: ${ev.protocolo||"-"}`);
  if(ev.endereco) linhas.push(`Endereço: ${ev.endereco}`);
  linhas.push(`Data: ${day?.dateISO ? formatDateBR(day.dateISO) : "-"}`);
  linhas.push(`Hora de início: ${inicioAvaliacao ? formatTimeBR(inicioAvaliacao) : "-"}`);
  linhas.push("");
  linhas.push(`Vítima: ${displayName(ev)}`);
  linhas.push(`Documento: ${ev.pessoa?.documento||"-"}`);
  if(ev.pessoa?.nascimento) linhas.push(`Data de nascimento: ${formatNascimentoInput(ev.pessoa.nascimento)}`);
  const idadeTxt = (ev.pessoa?.idade||"").trim();
  if(idadeTxt) linhas.push(`Idade: ${idadeTxt} ano(s)`);
  if(ev.gps) linhas.push(`GPS: ${ev.gps}`);
  const v=ev.vitais||{};
  const pa=v.pa||{};
  const paFilled = !!(String(pa.pas||"").trim() && String(pa.pad||"").trim());
  const paTxt = (pa.prejudicada || !paFilled) ? "Prejudicada" : `${pa.pas}x${pa.pad} mmHg`;
  const fcObj = v.fc||{};
  const fcFilled = !!String(fcObj.valor||"").trim();
  const fcTxt = (fcObj.prejudicada || !fcFilled) ? "Prejudicada" : (fcObj.valor||"-");
  const spo2Obj = v.spo2||{};
  const spo2Filled = !!String(spo2Obj.valor||"").trim();
  const spo2Txt = (spo2Obj.prejudicada || !spo2Filled) ? "Prejudicada" : `${spo2Obj.valor}%`;
  const mrObj = v.mr||{};
  const mrFilled = !!String(mrObj.valor||"").trim();
  const mrTxt = (mrObj.prejudicada || !mrFilled) ? "Prejudicada" : (mrObj.valor||"-");
  const tempTxt = String(v.temperatura||"").trim() ? `${v.temperatura} °C` : "-";
  const gcsFilled = !!String(v.glasgow||"").trim();
  const gcsTxt = gcsFilled ? v.glasgow : "Prejudicada";
  const pupilaTxt = formatPupilaResumo(v.pupila) || "-";
  linhas.push("");
  linhas.push("Sinais vitais:");
  linhas.push(`- PA: ${paTxt}`);
  linhas.push(`- FC: ${fcTxt}${fcTxt !== "Prejudicada" ? " bpm" : ""}`);
  linhas.push(`- SpO₂: ${spo2Txt}`);
  linhas.push(`- MR: ${mrTxt}${mrTxt !== "Prejudicada" ? " irpm" : ""}`);
  linhas.push(`- Temperatura: ${tempTxt}`);
  linhas.push(`- Glasgow: ${gcsTxt}`);
  linhas.push(`- Pupilas: ${pupilaTxt}`);
  const procedimentos = getProcedimentosSelecionados(ev.procedimentos || {});
  if(procedimentos.length || ev.casoClinico){
    linhas.push("");
    linhas.push("Evolução:");
    if(procedimentos.length) linhas.push(`Procedimentos realizados: ${procedimentos.join(", ")}.`);
    if(ev.casoClinico) linhas.push(ev.casoClinico);
  }
  const reg=ev.regulacao||{};
  if(reg.regulador || reg.senha || reg.unidade){
    linhas.push("");
    linhas.push("Regulação:");
    if(reg.regulador) linhas.push(`- Médico regulador: ${reg.regulador}`);
    if(reg.senha) linhas.push(`- Senha: ${reg.senha}`);
    if(reg.unidade) linhas.push(`- Unidade: ${reg.unidade}`);
  }
  const adm=ev.admissao||{};
  if(adm.macaRetida===undefined && adm.marcaRetida!==undefined) adm.macaRetida = adm.marcaRetida;
  const nomeTxt = (adm.nome||"").trim();
  const genero = adm.genero || "";
  const cargo = adm.tipo==="medico" ? (genero==="f" ? "Médica" : "Médico")
              : adm.tipo==="enfermeiro" ? (genero==="f" ? "Enfermeira" : "Enfermeiro")
              : "Profissional";
  const prep = genero==="f" ? "pela" : "pelo";
  if(adm.tipo || nomeTxt){
    linhas.push("");
    linhas.push(`Admissão profissional: ${cargo}${nomeTxt ? " — " + nomeTxt : ""}`);
  }
  if(adm.macaRetida){
    const dt = adm.dataHora ? formatDateTimeBR(adm.dataHora) : "-";
    linhas.push(`MACA RETIDA ${prep} ${cargo}${nomeTxt ? " " + nomeTxt : ""} em ${dt}`);
  }
  return linhas.join("\n");
}
function renderEval(app, dayId, evId){
  const day = getDay(dayId);
  const ev = getEval(day, evId);
  if(!day || !ev){
    app.innerHTML = topbar({title:"Avaliação não encontrada", left:btn("←","ghost",`type="button" id="backBtn"`)}) +
      `<main class="content"><div class="muted">Esta avaliação não existe (ou foi excluída).</div></main>`;
    $("#backBtn").onclick = ()=>location.hash = `#/day/${dayId}`;
    return;
  }
  let draft = safeClone(ensureEvaluationShape(ev));
  const left = btn("←","ghost",`type="button" id="backBtn"`);
  const right = btn("🧾 Resumo","ghost",`type="button" id="resumoBtn"`);
  app.innerHTML = topbar({title:`${ev.protocolo||"Sem protocolo"} — ${displayName(ev)}`, left, right}) + `
    <main class="content">
      <div class="autosave">
        <div class="row"><span class="dot"></span><span class="muted">Salvamento automático (offline)</span></div>
        ${ev.status==="saved"?pill("FINAL","ok"):pill("DRAFT","draft")}
      </div>
      ${section("1) Informações gerais", `
        ${field("Protocolo", `<input class="input" id="protocolo" inputmode="numeric" pattern="[0-9]*" placeholder="Ex.: 2026000123" />`)}
        ${field("Endereço", `<textarea class="textarea" id="endereco" rows="3" placeholder="Rua, número, bairro, referência..."></textarea>`)}
        <div class="row space">
          <div class="muted" id="gpsLabel">${ev.gps?escapeHTML("GPS: "+ev.gps):"Sem GPS registrado."}</div>
          ${btn("📍 Usar GPS","",`type="button" id="gpsBtn"`)}
        </div>
      `)}
      ${section("2) Dados pessoais", `
        ${field("Nome da vítima", `<input class="input" id="nome" placeholder="Nome completo (se houver)" />`,
          `Se vazio, aparecerá como "Não identificado".`
        )}
        ${field("CPF ou Documento", `<input class="input" id="doc" placeholder="CPF (11 dígitos) ou outro documento" />`,
          `<span id="docHint" class="hint">Detectado: Documento.</span>`
        )}
        <div class="grid2">
          <div class="card">
            <div class="title">Data de nascimento</div>
            <input class="input" id="nasc" inputmode="numeric" placeholder="DDMMAAAA ou DDMMAA" />
            <div class="muted" style="margin-top:6px">Digite numericamente. Ex.: 04041994 ou 040494.</div>
          </div>
          <div class="card">
            <div class="title">Idade</div>
            <input class="input" id="idade" inputmode="numeric" placeholder="anos" />
            <div class="muted" style="margin-top:6px">Se preencher a idade, a data de nascimento fica opcional.</div>
          </div>
        </div>
      `)}
      ${section("3) Sinais vitais", `
        <div class="grid2">
          <div class="card">
            <div class="title">PA (Pressão arterial)</div>
            <div class="row">
              <input class="input" id="pas" inputmode="numeric" placeholder="Alta" />
              <div class="x">x</div>
              <input class="input" id="pad" inputmode="numeric" placeholder="Baixa" />
            </div>
            <label class="check"><input type="checkbox" id="paPrej" /> <span>Prejudicada</span></label>
          </div>
          <div class="card">
            <div class="title">FC</div>
            <input class="input" id="fc" inputmode="numeric" placeholder="bpm" />
            <label class="check"><input type="checkbox" id="fcPrej" /> <span>Prejudicada</span></label>
          </div>
          <div class="card">
            <div class="title">SpO₂</div>
            <input class="input" id="spo2" inputmode="numeric" placeholder="%" />
            <label class="check"><input type="checkbox" id="spo2Prej" /> <span>Prejudicada</span></label>
          </div>
          <div class="card">
            <div class="title">MR</div>
            <input class="input" id="mr" inputmode="numeric" placeholder="irpm" />
            <label class="check"><input type="checkbox" id="mrPrej" /> <span>Prejudicada</span></label>
          </div>
          <div class="card">
            <div class="title">Temperatura</div>
            <input class="input" id="temperatura" inputmode="decimal" placeholder="°C" />
          </div>
        </div>
        ${field("Glasgow", `
          <select class="input" id="glasgow">
            <option value="">Selecione…</option>
            ${Array.from({length:15},(_,i)=>15-i).map(n=>`<option value="${n}">${n}</option>`).join("")}
          </select>
        `)}
        <div class="card">
          <div class="title">Pupilas</div>
          ${field("Tipo de pupila", `
            <select class="input" id="pupilaTipo">
              <option value="">Selecione…</option>
              <option value="isocorica">Isocórica</option>
              <option value="miotica">Miotica</option>
              <option value="midriatica">Midriatica</option>
              <option value="anisocorica">Anisocórica</option>
            </select>
          `)}
          <label class="check"><input type="checkbox" id="pupilaReagente" /> <span>Reagente</span></label>
          <div id="pupilaLadosWrap" style="display:none; margin-top:8px">
            <div class="muted" style="margin-bottom:6px">Informe o lado reagente:</div>
            <label class="check"><input type="checkbox" id="pupilaEsquerda" /> <span>Esquerda</span></label>
            <label class="check"><input type="checkbox" id="pupilaDireita" /> <span>Direita</span></label>
          </div>
        </div>
      `)}
      ${section("4) Evolução", `
        <div class="grid2">
          ${Object.entries(PROCEDIMENTO_LABELS).map(([key,label]) => `
            <div class="card">
              <label class="check" style="margin-top:0"><input type="checkbox" id="proc_${key}" /> <span>${label}</span></label>
            </div>
          `).join("")}
        </div>
        ${field("Evolução", `<textarea class="textarea" id="casoClinico" rows="6" placeholder="Descreva a evolução (o campo cresce conforme você digita)…"></textarea>`)}
      `)}
      ${section("5) Regulação", `
        ${favoriteField("Médico regulador","regulador","reguladores","regulador")}
        ${field("Senha", `<input class="input" id="senha" placeholder="Senha/regulação" />`)}
        ${favoriteField("Unidade de saúde","unidade","unidades","unidade")}
      `)}
      ${section("6) Admissão", `
        ${field("Quem admitiu?", `
          <div class="seg">
            <button type="button" id="admMed">Médico</button>
            <button type="button" id="admEnf">Enfermeiro</button>
          </div>
        `)}
        ${field("Gênero do profissional", `
          <div class="seg">
            <button type="button" id="genM">Masculino</button>
            <button type="button" id="genF">Feminino</button>
          </div>
        `)}
        ${field("Nome de quem admitiu", `<input class="input" id="admNome" placeholder="Nome do profissional" />`)}
        <label class="check"><input type="checkbox" id="macaRetida" /> <span>Maca retida</span></label>
        <div id="macaWrap" style="display:none">
          ${field("Data/hora da maca retida", `<input class="input" type="datetime-local" id="macaDT" />`)}
        </div>
      `)}
      <div class="footerbar">
        ${btn("Salvar avaliação","primary",`type="button" id="saveBtn"`)}
        <button class="btn danger" type="button" id="holdDelBtn">
          <span>Segure para excluir</span>
          <span class="holdbar" id="holdBar" style="transform:scaleX(0)"></span>
        </button>
      </div>
      <div style="height:40px"></div>
    </main>
    ${toast(TOAST)}
  `;
  $("#backBtn").onclick = ()=>location.hash = `#/day/${day.id}`;
  $("#resumoBtn").onclick = ()=>showResumoModal(day, getEval(getDay(dayId), evId) || draft);
  $("#protocolo").value = onlyDigits(ev.protocolo||"");
  $("#nome").value = ev.pessoa?.nome||"";
  $("#doc").value = ev.pessoa?.documento||"";
  $("#nasc").value = formatNascimentoInput(ev.pessoa?.nascimento||"");
  $("#idade").value = ev.pessoa?.idade||"";
  $("#endereco").value = ev.endereco||"";
  $("#casoClinico").value = ev.casoClinico||"";
  $("#pas").value = ev.vitais?.pa?.pas||"";
  $("#pad").value = ev.vitais?.pa?.pad||"";
  $("#paPrej").checked = !!ev.vitais?.pa?.prejudicada;
  $("#fc").value = ev.vitais?.fc?.valor||"";
  $("#fcPrej").checked = !!ev.vitais?.fc?.prejudicada;
  $("#spo2").value = ev.vitais?.spo2?.valor||"";
  $("#spo2Prej").checked = !!ev.vitais?.spo2?.prejudicada;
  $("#mr").value = ev.vitais?.mr?.valor||"";
  $("#mrPrej").checked = !!ev.vitais?.mr?.prejudicada;
  $("#temperatura").value = ev.vitais?.temperatura||"";
  $("#glasgow").value = ev.vitais?.glasgow||"";
  $("#pupilaTipo").value = ev.vitais?.pupila?.tipo||"";
  $("#pupilaReagente").checked = !!ev.vitais?.pupila?.reagente;
  $("#pupilaEsquerda").checked = !!ev.vitais?.pupila?.esquerda;
  $("#pupilaDireita").checked = !!ev.vitais?.pupila?.direita;
  $("#senha").value = ev.regulacao?.senha||"";
  $("#fav_regulador_input").value = ev.regulacao?.regulador||"";
  $("#fav_unidade_input").value = ev.regulacao?.unidade||"";
  Object.keys(PROCEDIMENTO_LABELS).forEach(key=>{
    const el = document.getElementById(`proc_${key}`);
    if(el) el.checked = !!ev.procedimentos?.[key];
  });
  const adm = ev.admissao || {};
  const macaFlag = (adm.macaRetida!==undefined) ? adm.macaRetida : !!adm.marcaRetida;
  $("#macaRetida").checked = !!macaFlag;
  $("#macaDT").value = adm.dataHora || "";
  $("#macaWrap").style.display = $("#macaRetida").checked ? "block" : "none";
  $("#admNome").value = adm.nome || "";
  setAdmButtons(adm.tipo || "");
  setGeneroButtons(adm.genero || "");
  const syncPupilaUI = ()=>{
    const show = $("#pupilaReagente").checked;
    $("#pupilaLadosWrap").style.display = show ? "block" : "none";
    $("#pupilaEsquerda").disabled = !show;
    $("#pupilaDireita").disabled = !show;
  };
  syncPupilaUI();
  draft = safeClone(ensureEvaluationShape(getEval(getDay(dayId), evId) || ev));
  const apply = (mutate)=>{
    mutate(draft);
    updateEvaluation(day.id, ev.id, draft, { render:false });
  };
  $("#doc").addEventListener("input", e=>{
    const raw = e.target.value;
    const digits = onlyDigits(raw);
    if(digits.length===11 && isValidCPF(digits)){
      const masked = maskCPF(digits);
      e.target.value = masked;
      $("#docHint").textContent = "Detectado: CPF válido (formatado automaticamente).";
      apply(n=>{ n.pessoa.documento=masked; n.docTipo="cpf"; });
    }else{
      $("#docHint").textContent = "Detectado: Documento.";
      apply(n=>{ n.pessoa.documento=raw; n.docTipo="documento"; });
    }
  });
  $("#protocolo").addEventListener("input", e=>{
    const valor = sanitizeInteger(e.target.value, 30);
    e.target.value = valor;
    apply(n=>{ n.protocolo=valor; });
  });
  $("#nome").addEventListener("input", e=>apply(n=>{ n.pessoa.nome=e.target.value; }));
  $("#endereco").addEventListener("input", e=>apply(n=>{ n.endereco=e.target.value; }));
  $("#casoClinico").addEventListener("input", e=>apply(n=>{ n.casoClinico=e.target.value; }));
  $("#casoClinico").addEventListener("input", ()=>{
    const el=$("#casoClinico");
    const lines = el.value.split("\n").length;
    const est = Math.min(18, Math.max(6, lines + Math.floor(el.value.length/90)));
    el.rows = est;
  });
  function calcIdade(iso){
    if(!iso) return "";
    const [y,m,d] = iso.split("-").map(Number);
    if(!y||!m||!d) return "";
    const today = new Date();
    let age = today.getFullYear() - y;
    const md = (today.getMonth()+1)*100 + today.getDate();
    const bd = m*100 + d;
    if(md < bd) age -= 1;
    if(age < 0) age = 0;
    return String(age);
  }
  function syncDobAgeUI(){
    const idadeVal = ($("#idade").value || "").trim();
    const nascVal = ($("#nasc").value || "").trim();
    $("#nasc").disabled = !!(idadeVal && !nascVal);
  }
  $("#nasc").addEventListener("input", e=>{
    const parsed = parseNascimentoDigitado(e.target.value);
    e.target.value = formatNascimentoInput(e.target.value);
    if(parsed){
      const idade = calcIdade(parsed.iso);
      if(idade) $("#idade").value = idade;
      apply(n=>{ n.pessoa.nascimento = parsed.iso; n.pessoa.idade = idade || ""; });
    }else if(!onlyDigits(e.target.value)){
      apply(n=>{ n.pessoa.nascimento = ""; if(!($("#idade").value||"").trim()) n.pessoa.idade = ""; });
    }else{
      $("#idade").value = "";
      apply(n=>{ n.pessoa.nascimento = ""; n.pessoa.idade = ""; });
    }
    syncDobAgeUI();
  });
  $("#idade").addEventListener("input", e=>{
    const v = e.target.value.replace(/\D+/g,"").slice(0,3);
    e.target.value = v;
    if(v){
      if($("#nasc").value) $("#nasc").value = "";
      apply(n=>{ n.pessoa.idade = v; n.pessoa.nascimento = ""; });
    }else{
      apply(n=>{ n.pessoa.idade = ""; });
    }
    syncDobAgeUI();
  });
  syncDobAgeUI();
  const syncPrej = ()=>{
    $("#pas").disabled = $("#paPrej").checked;
    $("#pad").disabled = $("#paPrej").checked;
    $("#fc").disabled = $("#fcPrej").checked;
    $("#spo2").disabled = $("#spo2Prej").checked;
    $("#mr").disabled = $("#mrPrej").checked;
  };
  syncPrej();
  $("#pas").addEventListener("input", e=>{ const v=sanitizeInteger(e.target.value,4); e.target.value=v; apply(n=>{ n.vitais.pa.pas=v; }); });
  $("#pad").addEventListener("input", e=>{ const v=sanitizeInteger(e.target.value,4); e.target.value=v; apply(n=>{ n.vitais.pa.pad=v; }); });
  $("#paPrej").addEventListener("change", e=>{ apply(n=>{ n.vitais.pa.prejudicada=e.target.checked; }); syncPrej(); });
  $("#fc").addEventListener("input", e=>{ const v=sanitizeInteger(e.target.value,3); e.target.value=v; apply(n=>{ n.vitais.fc.valor=v; }); });
  $("#fcPrej").addEventListener("change", e=>{ apply(n=>{ n.vitais.fc.prejudicada=e.target.checked; }); syncPrej(); });
  $("#spo2").addEventListener("input", e=>{ const v=sanitizeInteger(e.target.value,3); e.target.value=v; apply(n=>{ n.vitais.spo2.valor=v; }); });
  $("#spo2Prej").addEventListener("change", e=>{ apply(n=>{ n.vitais.spo2.prejudicada=e.target.checked; }); syncPrej(); });
  $("#mr").addEventListener("input", e=>{ const v=sanitizeInteger(e.target.value,3); e.target.value=v; apply(n=>{ n.vitais.mr.valor=v; }); });
  $("#mrPrej").addEventListener("change", e=>{ apply(n=>{ n.vitais.mr.prejudicada=e.target.checked; }); syncPrej(); });
  $("#temperatura").addEventListener("input", e=>{
    const valor = sanitizeDecimal(e.target.value, 6);
    e.target.value = valor;
    apply(n=>{ n.vitais.temperatura=valor; });
  });
  $("#glasgow").addEventListener("change", e=>apply(n=>{ n.vitais.glasgow=e.target.value; }));
  $("#pupilaTipo").addEventListener("change", e=>apply(n=>{ n.vitais.pupila.tipo=e.target.value; }));
  $("#pupilaReagente").addEventListener("change", e=>{
    const checked = e.target.checked;
    if(!checked){
      $("#pupilaEsquerda").checked = false;
      $("#pupilaDireita").checked = false;
    }
    apply(n=>{
      n.vitais.pupila.reagente=checked;
      if(!checked){
        n.vitais.pupila.esquerda=false;
        n.vitais.pupila.direita=false;
      }
    });
    syncPupilaUI();
  });
  $("#pupilaEsquerda").addEventListener("change", e=>apply(n=>{ n.vitais.pupila.esquerda=e.target.checked; }));
  $("#pupilaDireita").addEventListener("change", e=>apply(n=>{ n.vitais.pupila.direita=e.target.checked; }));
  Object.keys(PROCEDIMENTO_LABELS).forEach(key=>{
    const el = document.getElementById(`proc_${key}`);
    if(el){
      el.addEventListener("change", e=>apply(n=>{ n.procedimentos[key]=e.target.checked; }));
    }
  });
  wireFavoriteField("regulador", "reguladores",
    ()=> (getEval(getDay(dayId), evId)?.regulacao?.regulador||""),
    (val)=>apply(n=>{ n.regulacao.regulador=val; })
  );
  $("#senha").addEventListener("input", e=>apply(n=>{ n.regulacao.senha=e.target.value; }));
  wireFavoriteField("unidade", "unidades",
    ()=> (getEval(getDay(dayId), evId)?.regulacao?.unidade||""),
    (val)=>apply(n=>{ n.regulacao.unidade=val; })
  );
  $("#admNome").addEventListener("input", e=>apply(n=>{ n.admissao.nome=e.target.value; }));
  $("#admMed").onclick = ()=>{ apply(n=>{ n.admissao.tipo="medico"; }); setAdmButtons("medico"); };
  $("#admEnf").onclick = ()=>{ apply(n=>{ n.admissao.tipo="enfermeiro"; }); setAdmButtons("enfermeiro"); };
  $("#genM").onclick = ()=>{ apply(n=>{ n.admissao.genero="m"; }); setGeneroButtons("m"); };
  $("#genF").onclick = ()=>{ apply(n=>{ n.admissao.genero="f"; }); setGeneroButtons("f"); };
  $("#macaRetida").addEventListener("change", e=>{
    const checked = e.target.checked;
    $("#macaWrap").style.display = checked ? "block" : "none";
    apply(n=>{
      n.admissao.macaRetida = checked;
      if(checked && !n.admissao.dataHora) n.admissao.dataHora = nowLocalISODateTime();
    });
    if(checked) $("#macaDT").value = (getEval(getDay(dayId), evId)?.admissao?.dataHora || nowLocalISODateTime());
  });
  $("#macaDT").addEventListener("input", e=>apply(n=>{ n.admissao.dataHora=e.target.value; }));
  $("#gpsBtn").onclick = ()=>{
    if(!navigator.geolocation){ setToast("GPS não disponível."); return; }
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const {latitude, longitude, accuracy} = pos.coords;
        const gps = `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`;
        $("#gpsLabel").textContent = `GPS: ${gps}`;
        apply(n=>{ n.gps=gps; });
        setToast("GPS registrado.");
      },
      ()=>setToast("Não foi possível obter GPS."),
      { enableHighAccuracy:true, timeout:8000, maximumAge:60000 }
    );
  };
  $("#saveBtn").onclick = ()=>{
    draft.status = "saved";
    updateEvaluation(day.id, ev.id, draft, { render:true });
    setToast("Avaliação salva.");
  };
  wireHoldToDelete(()=>{ deleteEvaluation(day.id, ev.id); location.hash = `#/day/${day.id}`; });
  function isVisible(el){
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  function focusNext(current){
    const scope = document.querySelector("main.content");
    if(!scope) return;
    const focusables = Array.from(scope.querySelectorAll("input, select, textarea"))
      .filter(el => !el.disabled && !el.readOnly && isVisible(el));
    const idx = focusables.indexOf(current);
    if(idx >= 0 && idx < focusables.length-1){
      focusables[idx+1].focus();
      try{ focusables[idx+1].select?.(); }catch{}
    }
  }
  Array.from(document.querySelectorAll("main.content input, main.content select")).forEach(el=>{
    el.setAttribute("enterkeyhint","next");
    el.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){
        e.preventDefault();
        focusNext(el);
      }
    });
  });
  function markFilled(el){
    if(!el) return;
    const filled = !!String(el.value||"").trim();
    el.classList.toggle("filled", filled);
  }
  function markCardFilledFromCheckbox(chk){
    const card = chk.closest(".card");
    if(card) card.classList.toggle("filledcard", chk.checked);
  }
  Array.from(document.querySelectorAll("main.content input, main.content select, main.content textarea")).forEach(markFilled);
  Array.from(document.querySelectorAll("main.content input, main.content select, main.content textarea")).forEach(el=>{
    el.addEventListener("input", ()=>markFilled(el));
    el.addEventListener("change", ()=>markFilled(el));
  });
  ["paPrej","fcPrej","spo2Prej","mrPrej","pupilaReagente", ...Object.keys(PROCEDIMENTO_LABELS).map(key=>`proc_${key}`)].forEach(id=>{
    const chk = document.getElementById(id);
    if(chk){
      markCardFilledFromCheckbox(chk);
      chk.addEventListener("change", ()=>markCardFilledFromCheckbox(chk));
    }
  });
  function setAdmButtons(tipo){
    $("#admMed").classList.toggle("on", tipo==="medico");
    $("#admEnf").classList.toggle("on", tipo==="enfermeiro");
  }
  function setGeneroButtons(gen){
    $("#genM").classList.toggle("on", gen==="m");
    $("#genF").classList.toggle("on", gen==="f");
  }
}
function renderQto(app, dayId, qtoId){
  const day = getDay(dayId);
  const qto = getQto(day, qtoId);
  if(!day || !qto){
    app.innerHTML = topbar({title:"QTO não encontrado", left:btn("←","ghost",`type="button" id="backBtn"`)}) +
      `<main class="content"><div class="muted">Este QTO não existe (ou foi excluído).</div></main>`;
    $("#backBtn").onclick = ()=>location.hash = `#/day/${dayId}`;
    return;
  }
  let draft = safeClone(ensureQtoShape(qto));
  const left = btn("←","ghost",`type="button" id="backBtn"`);
  app.innerHTML = topbar({title:`QTO — ${day.viatura||"Sem viatura"}`, left}) + `
    <main class="content">
      <div class="autosave">
        <div class="row"><span class="dot"></span><span class="muted">Salvamento automático (offline)</span></div>
        ${qto.status==="saved"?pill("FINAL","ok"):pill("DRAFT","draft")}
      </div>
      ${section("QTO", `
        <div class="card">
          <div class="title">Fluxo QTO criado com sucesso</div>
          <div class="muted">Esta página foi aberta a partir de uma viatura do tipo ABR, ABS ou ABT.</div>
          <div class="muted" style="margin-top:8px">Por enquanto o formulário QTO está em branco, apenas para validar o funcionamento do novo caminho.</div>
        </div>
      `)}
      <div class="footerbar">
        ${btn("Salvar QTO","primary",`type="button" id="saveQtoBtn"`)}
        <button class="btn danger" type="button" id="holdDelBtn">
          <span>Segure para excluir</span>
          <span class="holdbar" id="holdBar" style="transform:scaleX(0)"></span>
        </button>
      </div>
      <div style="height:40px"></div>
    </main>
    ${toast(TOAST)}
  `;
  $("#backBtn").onclick = ()=>location.hash = `#/day/${day.id}`;
  $("#saveQtoBtn").onclick = ()=>{
    draft.status = "saved";
    updateQto(day.id, qto.id, draft, { render:true });
    setToast("QTO salvo.");
  };
  wireHoldToDelete(()=>{ deleteQto(day.id, qto.id); location.hash = `#/day/${day.id}`; });
}
function favoriteField(label, kind, favKey, idBase){
  const inputId = `fav_${idBase}_input`;
  const listId = `fav_${idBase}_list`;
  const starId = `fav_${idBase}_star`;
  return `
    <div class="field">
      <div class="label row space" style="width:100%">
        <span>${escapeHTML(label)}</span>
        <button class="btn ghost star" id="${starId}" type="button" title="Favoritar">☆</button>
      </div>
      <input class="input" id="${inputId}" list="${listId}" placeholder="Digite ou escolha abaixo…" />
      <datalist id="${listId}">
        ${(STATE.favorites?.[favKey]||[]).map(f=>`<option value="${escapeHTML(f)}"></option>`).join("")}
      </datalist>
      ${(STATE.favorites?.[favKey]||[]).length ? `
        <div class="chips">
          ${(STATE.favorites[favKey]||[]).slice(0,8).map(f=>`<button class="chip" type="button" data-chip="${idBase}" data-value="${escapeHTML(f)}">${escapeHTML(f)}</button>`).join("")}
        </div>
      ` : `<div class="hint">Sem favoritos ainda. Digite e toque na estrela para salvar.</div>`}
    </div>
  `;
}
function wireFavoriteField(idBase, favKey, getValue, setValue){
  const input = document.querySelector(`#fav_${idBase}_input`);
  const star = document.querySelector(`#fav_${idBase}_star`);
  const refreshStar = ()=>{
    const v = String(getValue()||"").trim();
    const isFav = (STATE.favorites?.[favKey]||[]).some(x=>x.toLowerCase()===v.toLowerCase());
    star.textContent = isFav ? "★" : "☆";
    star.classList.toggle("on", isFav);
  };
  input.addEventListener("input", e=>{ setValue(e.target.value); refreshStar(); });
  star.onclick = ()=>{
    toggleFavorite(idBase==="regulador"?"regulador":"unidade", input.value);
    setToast("Favoritos atualizado.");
    refreshStar();
  };
  document.querySelectorAll(`[data-chip="${idBase}"]`).forEach(ch=>{
    ch.onclick = ()=>{ input.value = ch.getAttribute("data-value"); setValue(input.value); refreshStar(); };
  });
  refreshStar();
}
function wireHoldToDelete(onConfirm){
  const btn = document.querySelector("#holdDelBtn");
  const bar = document.querySelector("#holdBar");
  let holding=false;
  let start=0;
  const seconds=1.5;
  function stop(){ holding=false; start=0; bar.style.transform="scaleX(0)"; }
  btn.addEventListener("pointerdown", ()=>{
    holding=true;
    start=performance.now();
    const tick=()=>{
      if(!holding) return;
      const elapsed=(performance.now()-start)/1000;
      const p=Math.min(1, elapsed/seconds);
      bar.style.transform = `scaleX(${p})`;
      if(p>=1){
        stop();
        onConfirm();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  ["pointerup","pointerleave","pointercancel"].forEach(evt=>btn.addEventListener(evt, stop));
}
function showResumoModal(day, ev){
  const text = generateResumo(day, ev);
  const modal = openModal(`
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Resumo (copiar para BO)</div>
        <button class="btn ghost" id="closeResumo" type="button">✕</button>
      </div>
      <div class="modal-body">
        <textarea class="textarea" id="resumoTA" rows="18" readonly>${escapeHTML(text)}</textarea>
        <div class="muted" style="margin-top:8px">Dica: você pode copiar e colar no boletim/relatório depois.</div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" id="fecharResumo" type="button">Fechar</button>
        <button class="btn primary" id="copyResumo" type="button">Copiar</button>
      </div>
    </div>
  `);
  modal.querySelector("#closeResumo").onclick = ()=>closeModal(modal);
  modal.querySelector("#fecharResumo").onclick = ()=>closeModal(modal);
  modal.querySelector("#copyResumo").onclick = async ()=>{
    const ta = modal.querySelector("#resumoTA");
    try{
      await navigator.clipboard.writeText(ta.value);
      setToast("Resumo copiado.");
    }catch{
      ta.focus(); ta.select();
      document.execCommand("copy");
      setToast("Resumo copiado.");
    }
  };
}
function showCopyProtocolsModal(day){
  const protocolos = (day?.evaluations || [])
    .map(ev => String(ev.protocolo || "").trim())
    .filter(Boolean);
  if(!protocolos.length){
    setToast("Nenhum protocolo preenchido.");
    return;
  }
  const text = protocolos.join("\n");
  const modal = openModal(`
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Todos os protocolos</div>
        <button class="btn ghost" id="closeProtocols" type="button">✕</button>
      </div>
      <div class="modal-body">
        <textarea class="textarea" id="protocolosTA" rows="16" readonly>${escapeHTML(text)}</textarea>
        <div class="muted" style="margin-top:8px">Cada protocolo fica em uma linha para colar em outro lugar.</div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" id="fecharProtocols" type="button">Fechar</button>
        <button class="btn primary" id="copyProtocols" type="button">Copiar</button>
      </div>
    </div>
  `);
  modal.querySelector("#closeProtocols").onclick = ()=>closeModal(modal);
  modal.querySelector("#fecharProtocols").onclick = ()=>closeModal(modal);
  modal.querySelector("#copyProtocols").onclick = async ()=>{
    const ta = modal.querySelector("#protocolosTA");
    try{
      await navigator.clipboard.writeText(ta.value);
      setToast("Protocolos copiados.");
    }catch{
      ta.focus(); ta.select();
      document.execCommand("copy");
      setToast("Protocolos copiados.");
    }
  };
}
init();
