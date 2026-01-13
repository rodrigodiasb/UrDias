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
  const [date,time]=isoDT.split("T");
  return `${formatDateBR(date)} ${time}`;
}
function onlyDigits(s=""){ return String(s).replace(/\D+/g,""); }
function normalizeForSearch(s=""){
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
function debounce(fn, ms=450){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
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

function safeClone(obj){
  try{ return structuredClone(obj); }catch{ return JSON.parse(JSON.stringify(obj)); }
}

/* ---------------- state ---------------- */
const defaultState = () => ({
  version: 1,
  lastSavedAt: null,
  days: [],
  favorites: { reguladores: [], unidades: [] }
});

let STATE = defaultState();
let HYDRATED = false;

const persist = debounce(async ()=>{
  STATE.lastSavedAt = Date.now();
  await saveState(STATE);
}, 500);

async function init(){
  const loaded = await loadState();
  if(loaded) STATE = loaded;
  HYDRATED = true;

  // register SW
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  window.addEventListener("hashchange", ()=>{ saveState(STATE).catch(()=>{}); render(); });
  document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") saveState(STATE).catch(()=>{}); });
  window.addEventListener("pagehide", ()=>{ saveState(STATE).catch(()=>{}); });

  if(!location.hash) location.hash = "#/";
  render();
}

function setState(mutator, opts={ render: true }){
  mutator(STATE);
  persist();
  if(opts.render) render();
}
function getDay(dayId){ return (STATE.days||[]).find(d=>d.id===dayId); }
function getEval(day, evId){ return (day?.evaluations||[]).find(e=>e.id===evId); }

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
    evaluations: []
  };
  setState(s => { s.days = [day, ...(s.days||[])]; });
  return day.id;
}

function deleteDay(dayId){
  setState(s => { s.days = (s.days||[]).filter(d=>d.id!==dayId); });
}

function createEvaluation(dayId){
  const ev = {
    id: uid("ev"),
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
      glasgow: ""
    },
    casoClinico: "",
    regulacao: { regulador:"", senha:"", unidade:"" },
    admissao: { tipo:"", nome:"", marcaRetida:false, dataHora:"" }
  };
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    d.evaluations = [ev, ...(d.evaluations||[])];
    d.updatedAt = Date.now();
  });
  return ev.id;
}

function updateEvaluation(dayId, evId, nextEv, opts={ render: true }){
  setState(s=>{
    const d = (s.days||[]).find(x=>x.id===dayId);
    if(!d) return;
    d.evaluations = (d.evaluations||[]).map(e=> e.id===evId ? (nextEv.updatedAt=Date.now(), nextEv) : e);
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
function section(title, body, open=false){
  return `<details class="section" ${open?"open":""} ${open?"open":""}>
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
                  <div class="muted">${count} integrante(s) • ${(d.evaluations||[]).length} avaliação(ões)</div>
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
        ${field("Viatura", `<input class="input" id="viatura" placeholder="Ex.: UR-12 / ASU-01 / Bravo 03" />`)}
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
  const right = btn("+ Avaliação","primary",`type="button" id="newEvalBtn"`);
  const left = btn("←","ghost",`type="button" id="backBtn"`);
  app.innerHTML = topbar({title:`${formatDateBR(day.dateISO)} — ${day.viatura||"Sem viatura"}`, left, right}) + `
    <main class="content">
      <div class="muted">${(day.integrantesText||"").split("\n").map(x=>x.trim()).filter(Boolean).length} integrante(s)</div>

      <div class="searchbar">
        <input class="input" id="q" placeholder="Buscar por protocolo, nome ou documento…" />
        ${btn("Limpar","ghost",`type="button" id="clearQBtn"`)}
      </div>

      <div class="list" id="evalList"></div>
    </main>
    ${toast(TOAST)}
  `;
  $("#backBtn").onclick = ()=>location.hash="#/";
  $("#newEvalBtn").onclick = ()=>{
    const evId = createEvaluation(day.id);
    location.hash = `#/day/${day.id}/ev/${evId}`;
  };

  const listEl = $("#evalList");
  const renderList = ()=>{
    const q = normalizeForSearch($("#q").value);
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
      const st = ev.status==="final" ? pill("FINAL","ok") : pill("DRAFT","draft");
      return card(`
        <div class="row space">
          <div>
            <div class="title">${escapeHTML(ev.protocolo||"Sem protocolo")} — ${escapeHTML(displayName(ev))}</div>
            <div class="muted">${ev.status==="final"?"✅ Salva":"📝 Rascunho"}${ev.regulacao?.unidade?` • ${escapeHTML(ev.regulacao.unidade)}`:""}</div>
          </div>
          ${st}
        </div>
      `, true, `data-open-ev="${ev.id}"`);
    }).join("");
    $$("[data-open-ev]").forEach(el=>{
      el.onclick = ()=> location.hash = `#/day/${day.id}/ev/${el.getAttribute("data-open-ev")}`;
    });
  };

  $("#q").addEventListener("input", renderList);
  $("#clearQBtn").onclick = ()=>{ $("#q").value=""; renderList(); };
  renderList();
}

function generateResumo(day, ev){
  const linhas=[];
  linhas.push(`PROTOCOLO: ${ev.protocolo||"-"}`);
linhas.push(`DATA: ${day?.dateISO||"-"}`);
  if(day?.viatura) linhas.push(`VIATURA: ${day.viatura}`);
  const integrantes=(day?.integrantesText||"").split("\n").map(x=>x.trim()).filter(Boolean);
  if(integrantes.length) linhas.push(`GUARNIÇÃO: ${integrantes.join("; ")}`);
  linhas.push("");
  linhas.push(`VÍTIMA: ${displayName(ev)}`);
  linhas.push(`DOCUMENTO: ${ev.pessoa?.documento||"-"}`);
  const idadeTxt = (ev.pessoa?.idade||"").trim();
  if(idadeTxt) linhas.push(`IDADE: ${idadeTxt} ano(s)`);

  if(ev.endereco) linhas.push(`ENDEREÇO: ${ev.endereco}`);
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

  const gcsFilled = !!String(v.glasgow||"").trim();
  const gcsTxt = gcsFilled ? v.glasgow : "Prejudicada";
  linhas.push("");
  linhas.push(`SINAIS VITAIS: PA ${paTxt} | FC ${fcTxt} | SpO₂ ${spo2Txt} | MR ${mrTxt} | Glasgow ${gcsTxt}`);

  if(ev.casoClinico){
    linhas.push("");
    linhas.push("CASO CLÍNICO:");
    linhas.push(ev.casoClinico);
  }

  const reg=ev.regulacao||{};
  if(reg.regulador || reg.senha || reg.unidade){
    linhas.push("");
    linhas.push("REGULAÇÃO:");
    if(reg.regulador) linhas.push(`- Médico regulador: ${reg.regulador}`);
    if(reg.senha) linhas.push(`- Senha: ${reg.senha}`);
    if(reg.unidade) linhas.push(`- Unidade: ${reg.unidade}`);
  }

  const adm=ev.admissao||{};
  if(adm.tipo || adm.nome || adm.marcaRetida){
    linhas.push("");
    // Montagem conforme rádio (médico/enfermeiro). "(a)" cobre ambos os sexos.
    const tipoTxt = adm.tipo==="medico" ? "Médico(a)" : adm.tipo==="enfermeiro" ? "Enfermeiro(a)" : "Profissional";
    const nomeTxt = (adm.nome||"").trim();
    linhas.push(`ADMISSÃO PROFISSIONAL: ${tipoTxt}${nomeTxt ? " — " + nomeTxt : ""}`);

    if(adm.marcaRetida){
      const dt = adm.dataHora ? formatDateTimeBR(adm.dataHora) : "-";
      const por = nomeTxt ? ` por ${tipoTxt} ${nomeTxt}` : "";
      linhas.push(`MACA RETIDA: SIM${por} em ${dt}`);
    }else{
      linhas.push("MACA RETIDA: NÃO");
    }
  }
  return linhas.join("\n");
}

function renderEval(app, dayId, evId){
  const day = getDay(dayId);
  const ev = getEval(day, evId);
  let draft = safeClone(ev);
  if(!day || !ev){
    app.innerHTML = topbar({title:"Avaliação não encontrada", left:btn("←","ghost",`type="button" id="backBtn"`)}) +
      `<main class="content"><div class="muted">Esta avaliação não existe (ou foi excluída).</div></main>`;
    $("#backBtn").onclick = ()=>location.hash = `#/day/${dayId}`;
    return;
  }

  const left = btn("←","ghost",`type="button" id="backBtn"`);
  const right = btn("🧾 Resumo","ghost",`type="button" id="resumoBtn"`);
  app.innerHTML = topbar({title:`${ev.protocolo||"Sem protocolo"} — ${displayName(ev)}`, left, right}) + `
    <main class="content">
      <div class="autosave">
        <div class="row"><span class="dot"></span><span class="muted">Salvamento automático (offline)</span></div>
        ${ev.status==="final"?pill("FINAL","ok"):pill("DRAFT","draft")}
      </div>

      ${section("1) Informações gerais", `
        ${field("Protocolo (primeiro de tudo)", `<input class="input" id="protocolo" placeholder="Ex.: 2026-000123" />`)}
        ${field("Endereço", `<textarea class="textarea" id="endereco" rows="3" placeholder="Rua, número, bairro, referência..."></textarea>`)}
        <div class="row space">
          <div class="muted" id="gpsLabel">${ev.gps?escapeHTML("GPS: "+ev.gps):"Sem GPS registrado."}</div>
          ${btn("📍 Usar GPS","",`type="button" id="gpsBtn"`)}
        </div>
      `, true)}

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
            <input class="input" type="date" id="nasc" />
            <div class="muted" style="margin-top:6px">Ao preencher, a idade é calculada automaticamente.</div>
          </div>

          <div class="card">
            <div class="title">Idade</div>
            <input class="input" id="idade" inputmode="numeric" placeholder="anos" />
            <div class="muted" style="margin-top:6px">Se preencher a idade, a data de nascimento fica opcional.</div>
          </div>
        </div>
      `, false)}

${section("4) Sinais vitais", `
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
        </div>

        ${field("Glasgow", `
          <select class="input" id="glasgow">
            <option value="">Selecione…</option>
            ${Array.from({length:15},(_,i)=>15-i).map(n=>`<option value="${n}">${n}</option>`).join("")}
          </select>
        `)}
      `, false)}

      ${section("5) Caso clínico", `
        ${field("Descrição", `<textarea class="textarea" id="casoClinico" rows="6" placeholder="Descreva o caso (o campo cresce conforme você digita)…"></textarea>`)}
      `, false)}

      ${section("6) Regulação", `
        ${favoriteField("Médico regulador","regulador","reguladores","regulador")}
        ${field("Senha", `<input class="input" id="senha" placeholder="Senha/regulação" />`)}
        ${favoriteField("Unidade de saúde","unidade","unidades","unidade")}
      `, false)}

      ${section("7) Admissão", `
        ${field("Quem admitiu?", `
          <div class="seg">
            <button type="button" id="admMed">Médico</button>
            <button type="button" id="admEnf">Enfermeiro</button>
          </div>
        `)}
        ${field("Nome de quem admitiu", `<input class="input" id="admNome" placeholder="Nome do profissional" />`)}
        <label class="check"><input type="checkbox" id="marcaRetida" /> <span>Marca retida</span></label>
        <div id="marcaWrap" style="display:none">
          ${field("Data/hora da marca retida", `<input class="input" type="datetime-local" id="marcaDT" />`)}
        </div>
      `, false)}

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
  $("#resumoBtn").onclick = ()=>showResumoModal(day, ev);

  // set initial values
  $("#protocolo").value = ev.protocolo||"";  $("#nome").value = ev.pessoa?.nome||"";
  $("#doc").value = ev.pessoa?.documento||"";
  $("#nasc").value = ev.pessoa?.nascimento||"";
  $("#idade").value = ev.pessoa?.idade||"";
  $("#endereco").value = ev.endereco||"";

  $("#pas").value = ev.vitais?.pa?.pas||"";
  $("#pad").value = ev.vitais?.pa?.pad||"";
  $("#paPrej").checked = !!ev.vitais?.pa?.prejudicada;

  $("#fc").value = ev.vitais?.fc?.valor||"";
  $("#fcPrej").checked = !!ev.vitais?.fc?.prejudicada;

  $("#spo2").value = ev.vitais?.spo2?.valor||"";
  $("#spo2Prej").checked = !!ev.vitais?.spo2?.prejudicada;

  $("#mr").value = ev.vitais?.mr?.valor||"";
  $("#mrPrej").checked = !!ev.vitais?.mr?.prejudicada;

  $("#glasgow").value = ev.vitais?.glasgow||"";
  $("#casoClinico").value = ev.casoClinico||"";

  $("#senha").value = ev.regulacao?.senha||"";
  $("#fav_regulador_input").value = ev.regulacao?.regulador||"";
  $("#fav_unidade_input").value = ev.regulacao?.unidade||"";

  // admission
  setAdmButtons(ev.admissao?.tipo||"");
  $("#admNome").value = ev.admissao?.nome||"";
  $("#marcaRetida").checked = !!ev.admissao?.marcaRetida;
  $("#marcaDT").value = ev.admissao?.dataHora || "";
  $("#marcaWrap").style.display = $("#marcaRetida").checked ? "block" : "none";

  // auto-grow case
  $("#casoClinico").addEventListener("input", ()=>{
    const el=$("#casoClinico");
    const lines = el.value.split("\n").length;
    const est = Math.min(18, Math.max(6, lines + Math.floor(el.value.length/90)));
    el.rows = est;
  });

  const apply = (mutate)=>{
    // Mantém um rascunho local atualizado para não perder campos já preenchidos
    mutate(draft);
    // Atualiza o rascunho SEM re-render completo (evita perder foco a cada tecla)
    updateEvaluation(day.id, ev.id, draft, { render: false });
  };

  $("#protocolo").addEventListener("input", e=>apply(n=>{ n.protocolo=e.target.value; }));  $("#nome").addEventListener("input", e=>apply(n=>{ n.pessoa.nome=e.target.value; }));

  // nascimento / idade (sincronização simples)
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
    const iso = e.target.value;
    const idade = calcIdade(iso);
    if(idade){
      $("#idade").value = idade;
    }
    apply(n=>{ n.pessoa.nascimento = iso; n.pessoa.idade = idade || ""; });
    syncDobAgeUI();
  });

  $("#idade").addEventListener("input", e=>{
    const v = e.target.value.replace(/\D+/g,"").slice(0,3);
    e.target.value = v;
    if(v){
      if($("#nasc").value){
        $("#nasc").value = "";
      }
      apply(n=>{ n.pessoa.idade = v; n.pessoa.nascimento = ""; });
    }else{
      apply(n=>{ n.pessoa.idade = ""; });
    }
    syncDobAgeUI();
  });

  syncDobAgeUI();


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

  $("#endereco").addEventListener("input", e=>apply(n=>{ n.endereco=e.target.value; }));

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

  // vitals
  const syncPrej = ()=>{
    $("#pas").disabled = $("#paPrej").checked;
    $("#pad").disabled = $("#paPrej").checked;
    $("#fc").disabled = $("#fcPrej").checked;
    $("#spo2").disabled = $("#spo2Prej").checked;
    $("#mr").disabled = $("#mrPrej").checked;
  };
  syncPrej();

  $("#pas").addEventListener("input", e=>apply(n=>{ n.vitais.pa.pas=e.target.value; }));
  $("#pad").addEventListener("input", e=>apply(n=>{ n.vitais.pa.pad=e.target.value; }));
  $("#paPrej").addEventListener("change", e=>{ apply(n=>{ n.vitais.pa.prejudicada=e.target.checked; }); syncPrej(); });

  $("#fc").addEventListener("input", e=>apply(n=>{ n.vitais.fc.valor=e.target.value; }));
  $("#fcPrej").addEventListener("change", e=>{ apply(n=>{ n.vitais.fc.prejudicada=e.target.checked; }); syncPrej(); });

  $("#spo2").addEventListener("input", e=>apply(n=>{ n.vitais.spo2.valor=e.target.value; }));
  $("#spo2Prej").addEventListener("change", e=>{ apply(n=>{ n.vitais.spo2.prejudicada=e.target.checked; }); syncPrej(); });

  $("#mr").addEventListener("input", e=>apply(n=>{ n.vitais.mr.valor=e.target.value; }));
  $("#mrPrej").addEventListener("change", e=>{ apply(n=>{ n.vitais.mr.prejudicada=e.target.checked; }); syncPrej(); });

  $("#glasgow").addEventListener("change", e=>apply(n=>{ n.vitais.glasgow=e.target.value; }));

  $("#casoClinico").addEventListener("input", e=>apply(n=>{ n.casoClinico=e.target.value; }));

  // favorites fields
  wireFavoriteField("regulador", "reguladores",
    ()=> (getEval(getDay(dayId), evId)?.regulacao?.regulador||""),
    (val)=>apply(n=>{ n.regulacao.regulador=val; })
  );
  $("#senha").addEventListener("input", e=>apply(n=>{ n.regulacao.senha=e.target.value; }));
  wireFavoriteField("unidade", "unidades",
    ()=> (getEval(getDay(dayId), evId)?.regulacao?.unidade||""),
    (val)=>apply(n=>{ n.regulacao.unidade=val; })
  );

  // admission
  $("#admMed").onclick = ()=>{ apply(n=>{ n.admissao.tipo="medico"; }); setAdmButtons("medico"); };
  $("#admEnf").onclick = ()=>{ apply(n=>{ n.admissao.tipo="enfermeiro"; }); setAdmButtons("enfermeiro"); };
  $("#admNome").addEventListener("input", e=>apply(n=>{ n.admissao.nome=e.target.value; }));
  $("#marcaRetida").addEventListener("change", e=>{
    const checked = e.target.checked;
    $("#marcaWrap").style.display = checked ? "block" : "none";
    apply(n=>{
      n.admissao.marcaRetida = checked;
      if(checked && !n.admissao.dataHora) n.admissao.dataHora = nowLocalISODateTime();
    });
    if(checked) $("#marcaDT").value = getEval(getDay(dayId), evId)?.admissao?.dataHora || nowLocalISODateTime();
  });
  $("#marcaDT").addEventListener("input", e=>apply(n=>{ n.admissao.dataHora=e.target.value; }));


  // Enter/Retorno no iOS: ir para o próximo campo (exceto textarea do Caso clínico)
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
  // Aplica comportamento Enter => próximo (exceto textarea)
  Array.from(document.querySelectorAll("main.content input, main.content select")).forEach(el=>{
    el.setAttribute("enterkeyhint","next");
    el.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){
        e.preventDefault();
        focusNext(el);
      }
    });
  });

  // Destaque visual de campos preenchidos
  function markFilled(el){
    if(!el) return;
    const tag = el.tagName.toLowerCase();
    const filled = !!String(el.value||"").trim();
    el.classList.toggle("filled", filled);
  }
  function markCardFilledFromCheckbox(chk){
    const card = chk.closest(".card");
    if(card) card.classList.toggle("filledcard", chk.checked);
  }

  // inicial
  Array.from(document.querySelectorAll("main.content input, main.content select, main.content textarea")).forEach(markFilled);

  // listeners genéricos
  Array.from(document.querySelectorAll("main.content input, main.content select, main.content textarea")).forEach(el=>{
    el.addEventListener("input", ()=>markFilled(el));
    el.addEventListener("change", ()=>markFilled(el));
  });

  // quando marcar "prejudicada", marca o card como preenchido
  ["paPrej","fcPrej","spo2Prej","mrPrej"].forEach(id=>{
    const chk = document.getElementById(id);
    if(chk){
      markCardFilledFromCheckbox(chk);
      chk.addEventListener("change", ()=>markCardFilledFromCheckbox(chk));
    }
  });

  $("#saveBtn").onclick = ()=>{
    const next = safeClone(getEval(getDay(dayId), evId));
    next.status = "final";
    updateEvaluation(day.id, ev.id, next, { render: true });
    setToast("Avaliação salva.");
  };

  wireHoldToDelete(()=>{ deleteEvaluation(day.id, ev.id); location.hash = `#/day/${day.id}`; });

  function setAdmButtons(tipo){
    $("#admMed").classList.toggle("on", tipo==="medico");
    $("#admEnf").classList.toggle("on", tipo==="enfermeiro");
  }
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
        ${btn("✕","ghost",`id="closeResumo" type="button"`)}
      </div>
      <div class="modal-body">
        <textarea class="textarea" id="resumoTA" rows="18" readonly>${escapeHTML(text)}</textarea>
        <div class="muted" style="margin-top:8px">Dica: você pode copiar e colar no boletim/relatório depois.</div>
      </div>
      <div class="modal-footer">
        ${btn("Fechar","ghost",`id="fecharResumo" type="button"`)}
        ${btn("Copiar","primary",`id="copyResumo" type="button"`)}
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

/* start */
init();
