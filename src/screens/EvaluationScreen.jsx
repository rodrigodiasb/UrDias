import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppState } from "../state.jsxx";
import { Card, Field, HoldToConfirmButton, Section, TopBar, Toast } from "../components/UI.jsx";
import { isValidCPF, maskCPF, nowLocalISODateTime, onlyDigits, formatDateTimeBR, safeClone } from "../utils.js";

function displayName(ev) {
  const nome = (ev?.pessoa?.nome || "").trim();
  return nome ? nome : "Não identificado";
}

function generateResumo({ day, ev }) {
  const linhas = [];
  linhas.push(`PROTOCOLO: ${ev.protocolo || "-"}`);
  if (ev.bravo) linhas.push(`BRAVO/GU: ${ev.bravo}`);
  linhas.push(`DATA: ${day?.dateISO || "-"}`);
  if (day?.viatura) linhas.push(`VIATURA: ${day.viatura}`);
  const integrantes = (day?.integrantesText || "").split("\n").map(x => x.trim()).filter(Boolean);
  if (integrantes.length) {
    linhas.push(`GUARNIÇÃO: ${integrantes.join("; ")}`);
  }
  linhas.push("");
  linhas.push(`VÍTIMA: ${displayName(ev)}`);
  linhas.push(`DOCUMENTO: ${ev.pessoa?.documento || "-"}`);
  if (ev.endereco) linhas.push(`ENDEREÇO: ${ev.endereco}`);
  if (ev.gps) linhas.push(`GPS: ${ev.gps}`);

  // vitais
  const v = ev.vitais || {};
  const pa = v.pa || {};
  const paTxt = pa.prejudicada ? "Prejudicada" : (pa.pas && pa.pad ? `${pa.pas}x${pa.pad} mmHg` : "-");
  const fcTxt = v.fc?.prejudicada ? "Prejudicada" : (v.fc?.valor || "-");
  const spo2Txt = v.spo2?.prejudicada ? "Prejudicada" : (v.spo2?.valor ? `${v.spo2.valor}%` : "-");
  const mrTxt = v.mr?.prejudicada ? "Prejudicada" : (v.mr?.valor || "-");
  const gcsTxt = v.glasgow || "-";
  linhas.push("");
  linhas.push(`SINAIS VITAIS: PA ${paTxt} | FC ${fcTxt} | SpO₂ ${spo2Txt} | MR ${mrTxt} | Glasgow ${gcsTxt}`);

  if (ev.casoClinico) {
    linhas.push("");
    linhas.push("CASO CLÍNICO:");
    linhas.push(ev.casoClinico);
  }

  const reg = ev.regulacao || {};
  if (reg.regulador || reg.senha || reg.unidade) {
    linhas.push("");
    linhas.push("REGULAÇÃO:");
    if (reg.regulador) linhas.push(`- Médico regulador: ${reg.regulador}`);
    if (reg.senha) linhas.push(`- Senha: ${reg.senha}`);
    if (reg.unidade) linhas.push(`- Unidade: ${reg.unidade}`);
  }

  const adm = ev.admissao || {};
  if (adm.tipo || adm.nome || adm.marcaRetida) {
    linhas.push("");
    linhas.push("ADMISSÃO:");
    const tipoTxt = adm.tipo === "medico" ? "Médico" : adm.tipo === "enfermeiro" ? "Enfermeiro" : "-";
    linhas.push(`- Profissional: ${tipoTxt}${adm.nome ? " — " + adm.nome : ""}`);
    if (adm.marcaRetida) {
      const dt = adm.dataHora ? formatDateTimeBR(adm.dataHora) : "-";
      linhas.push(`- Marca retida: SIM (registrada em ${dt})`);
    } else {
      linhas.push(`- Marca retida: NÃO`);
    }
  }

  return linhas.join("\n");
}

export default function EvaluationScreen({ mode }) {
  const nav = useNavigate();
  const { dayId, evId } = useParams();
  const { state, updateEvaluation, deleteEvaluation, toggleFavorite } = useAppState();

  const day = useMemo(() => (state.days || []).find((d) => d.id === dayId), [state.days, dayId]);
  const ev = useMemo(() => (day?.evaluations || []).find((x) => x.id === evId), [day, evId]);

  const [toast, setToast] = useState("");
  const [showResumo, setShowResumo] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  if (!day || !ev) {
    return (
      <div className="app">
        <TopBar title="Avaliação não encontrada" left={<button className="btn btn--ghost" onClick={() => nav(-1)}>←</button>} />
        <main className="content">
          <p className="muted">Esta avaliação não existe (ou foi excluída).</p>
          <button className="btn btn--primary" onClick={() => nav(`/day/${dayId}`)}>Voltar ao dia</button>
        </main>
      </div>
    );
  }

  const favorites = state.favorites || { reguladores: [], unidades: [] };
  const resumoText = generateResumo({ day, ev });

  const setField = (path, value) => {
    // shallow path setter (handles known nested structures)
    const next = safeClone(ev);
    const parts = path.split(".");
    let cur = next;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
    updateEvaluation(day.id, ev.id, next);
  };

  const onDocChange = (raw) => {
    const digits = onlyDigits(raw);
    if (digits.length === 11) {
      const valid = isValidCPF(digits);
      if (valid) {
        setField("pessoa.documento", maskCPF(digits));
        setField("docTipo", "cpf");
        return;
      }
      // 11 dígitos mas inválido -> documento
      setField("pessoa.documento", raw);
      setField("docTipo", "documento");
      return;
    }
    // qualquer outra coisa -> documento
    setField("pessoa.documento", raw);
    setField("docTipo", "documento");
  };

  const onMarkGPS = async () => {
    if (!navigator.geolocation) {
      setToast("GPS não disponível neste dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const gps = `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`;
        setField("gps", gps);
        setToast("GPS registrado.");
      },
      () => setToast("Não foi possível obter GPS."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const finalize = () => {
    updateEvaluation(day.id, ev.id, { ...ev, status: "final" });
    setToast("Avaliação salva.");
  };

  const onDelete = () => {
    // volta para o dia após excluir
    deleteEvaluation(day.id, ev.id);
    nav(`/day/${day.id}`);
  };

  return (
    <div className="app">
      <TopBar
        title={`${ev.protocolo || "Sem protocolo"} — ${displayName(ev)}`}
        left={<button className="btn btn--ghost" type="button" onClick={() => nav(`/day/${day.id}`)}>←</button>}
        right={
          <button className="btn btn--ghost" type="button" onClick={() => setShowResumo(true)}>
            🧾 Resumo
          </button>
        }
      />

      <main className="content">
        <div className="autosave">
          <span className="dot" />
          <span className="muted">Salvamento automático (offline)</span>
          <span className={`pill ${ev.status === "final" ? "pill--ok" : "pill--draft"}`}>{ev.status === "final" ? "FINAL" : "DRAFT"}</span>
        </div>

        <Section title="1) Protocolo" defaultOpen>
          <Field label="Protocolo (primeiro de tudo)">
            <input className="input" value={ev.protocolo} onChange={(e) => setField("protocolo", e.target.value)} placeholder="Ex.: 2026-000123" />
          </Field>

          <Field label="Bravo / GU (opcional)">
            <input className="input" value={ev.bravo} onChange={(e) => setField("bravo", e.target.value)} placeholder="Ex.: Bravo 03" />
          </Field>
        </Section>

        <Section title="2) Dados pessoais" defaultOpen={false}>
          <Field label="Nome da vítima" hint='Se vazio, aparecerá como "Não identificado".'>
            <input className="input" value={ev.pessoa?.nome || ""} onChange={(e) => setField("pessoa.nome", e.target.value)} placeholder="Nome completo (se houver)" />
          </Field>

          <Field
            label="CPF ou Documento"
            hint={ev.docTipo === "cpf" ? "Detectado: CPF válido (formatado automaticamente)." : "Detectado: Documento."}
          >
            <input className="input" value={ev.pessoa?.documento || ""} onChange={(e) => onDocChange(e.target.value)} placeholder="CPF (11 dígitos) ou outro documento" />
          </Field>
        </Section>

        <Section title="3) Endereço" defaultOpen={false}>
          <Field label="Endereço">
            <textarea className="textarea" rows={3} value={ev.endereco} onChange={(e) => setField("endereco", e.target.value)} placeholder="Rua, número, bairro, referência..." />
          </Field>

          <div className="row row--space">
            <div className="muted">{ev.gps ? `GPS: ${ev.gps}` : "Sem GPS registrado."}</div>
            <button className="btn" type="button" onClick={onMarkGPS}>📍 Usar GPS</button>
          </div>
        </Section>

        <Section title="4) Sinais vitais" defaultOpen={false}>
          <div className="grid2">
            <Card>
              <div className="title">PA (Pressão arterial)</div>
              <div className="row">
                <input
                  className="input input--small"
                  inputMode="numeric"
                  disabled={ev.vitais?.pa?.prejudicada}
                  value={ev.vitais?.pa?.pas || ""}
                  onChange={(e) => setField("vitais.pa.pas", e.target.value)}
                  placeholder="Alta"
                />
                <div className="x">x</div>
                <input
                  className="input input--small"
                  inputMode="numeric"
                  disabled={ev.vitais?.pa?.prejudicada}
                  value={ev.vitais?.pa?.pad || ""}
                  onChange={(e) => setField("vitais.pa.pad", e.target.value)}
                  placeholder="Baixa"
                />
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!ev.vitais?.pa?.prejudicada}
                  onChange={(e) => setField("vitais.pa.prejudicada", e.target.checked)}
                />
                <span>Prejudicada</span>
              </label>
            </Card>

            <Card>
              <div className="title">FC</div>
              <input
                className="input"
                inputMode="numeric"
                disabled={ev.vitais?.fc?.prejudicada}
                value={ev.vitais?.fc?.valor || ""}
                onChange={(e) => setField("vitais.fc.valor", e.target.value)}
                placeholder="bpm"
              />
              <label className="check">
                <input type="checkbox" checked={!!ev.vitais?.fc?.prejudicada} onChange={(e) => setField("vitais.fc.prejudicada", e.target.checked)} />
                <span>Prejudicada</span>
              </label>
            </Card>

            <Card>
              <div className="title">SpO₂</div>
              <input
                className="input"
                inputMode="numeric"
                disabled={ev.vitais?.spo2?.prejudicada}
                value={ev.vitais?.spo2?.valor || ""}
                onChange={(e) => setField("vitais.spo2.valor", e.target.value)}
                placeholder="%"
              />
              <label className="check">
                <input type="checkbox" checked={!!ev.vitais?.spo2?.prejudicada} onChange={(e) => setField("vitais.spo2.prejudicada", e.target.checked)} />
                <span>Prejudicada</span>
              </label>
            </Card>

            <Card>
              <div className="title">MR</div>
              <input
                className="input"
                inputMode="numeric"
                disabled={ev.vitais?.mr?.prejudicada}
                value={ev.vitais?.mr?.valor || ""}
                onChange={(e) => setField("vitais.mr.valor", e.target.value)}
                placeholder="irpm"
              />
              <label className="check">
                <input type="checkbox" checked={!!ev.vitais?.mr?.prejudicada} onChange={(e) => setField("vitais.mr.prejudicada", e.target.checked)} />
                <span>Prejudicada</span>
              </label>
            </Card>
          </div>

          <Field label="Glasgow">
            <select className="input" value={ev.vitais?.glasgow || ""} onChange={(e) => setField("vitais.glasgow", e.target.value)}>
              <option value="">Selecione…</option>
              {Array.from({ length: 15 }, (_, i) => 15 - i).map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="5) Caso clínico" defaultOpen={false}>
          <AutoGrowTextarea
            value={ev.casoClinico || ""}
            onChange={(v) => setField("casoClinico", v)}
            placeholder="Descreva o caso (o campo cresce conforme você digita)…"
          />
        </Section>

        <Section title="6) Regulação" defaultOpen={false}>
          <FavoriteField
            label="Médico regulador"
            value={ev.regulacao?.regulador || ""}
            favorites={favorites.reguladores}
            lastValue={ev.regulacao?.regulador || ""}
            onChange={(v) => setField("regulacao.regulador", v)}
            onToggleFav={() => toggleFavorite("regulador", ev.regulacao?.regulador || "")}
          />

          <Field label="Senha">
            <input className="input" value={ev.regulacao?.senha || ""} onChange={(e) => setField("regulacao.senha", e.target.value)} placeholder="Senha/regulação" />
          </Field>

          <FavoriteField
            label="Unidade de saúde"
            value={ev.regulacao?.unidade || ""}
            favorites={favorites.unidades}
            lastValue={ev.regulacao?.unidade || ""}
            onChange={(v) => setField("regulacao.unidade", v)}
            onToggleFav={() => toggleFavorite("unidade", ev.regulacao?.unidade || "")}
          />
        </Section>

        <Section title="7) Admissão" defaultOpen={false}>
          <Field label="Quem admitiu?">
            <div className="seg">
              <button
                type="button"
                className={`seg__btn ${ev.admissao?.tipo === "medico" ? "seg__btn--on" : ""}`}
                onClick={() => setField("admissao.tipo", "medico")}
              >
                Médico
              </button>
              <button
                type="button"
                className={`seg__btn ${ev.admissao?.tipo === "enfermeiro" ? "seg__btn--on" : ""}`}
                onClick={() => setField("admissao.tipo", "enfermeiro")}
              >
                Enfermeiro
              </button>
            </div>
          </Field>

          <Field label="Nome de quem admitiu">
            <input className="input" value={ev.admissao?.nome || ""} onChange={(e) => setField("admissao.nome", e.target.value)} placeholder="Nome do profissional" />
          </Field>

          <label className="check">
            <input
              type="checkbox"
              checked={!!ev.admissao?.marcaRetida}
              onChange={(e) => {
                const checked = e.target.checked;
                setField("admissao.marcaRetida", checked);
                if (checked && !ev.admissao?.dataHora) {
                  setField("admissao.dataHora", nowLocalISODateTime());
                }
              }}
            />
            <span>Marca retida</span>
          </label>

          {ev.admissao?.marcaRetida ? (
            <Field label="Data/hora da marca retida">
              <input className="input" type="datetime-local" value={ev.admissao?.dataHora || ""} onChange={(e) => setField("admissao.dataHora", e.target.value)} />
            </Field>
          ) : null}
        </Section>

        <div className="footerbar">
          <button className="btn btn--primary" type="button" onClick={finalize}>Salvar avaliação</button>
          <HoldToConfirmButton onConfirm={onDelete}>Segure para excluir</HoldToConfirmButton>
        </div>

        <div className="spacer" />
      </main>

      {showResumo ? (
        <ResumoModal
          text={resumoText}
          onClose={() => setShowResumo(false)}
          onCopied={() => setToast("Resumo copiado.")}
        />
      ) : null}

      <Toast text={toast} />
    </div>
  );
}

function ResumoModal({ text, onClose, onCopied }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onCopied?.();
    } catch {
      // fallback: select
      const ta = document.getElementById("resumo_ta");
      if (ta) {
        ta.focus();
        ta.select();
        document.execCommand("copy");
        onCopied?.();
      }
    }
  };

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="modal modal--big">
        <div className="modal__header">
          <div className="modal__title">Resumo (copiar para BO)</div>
          <button className="btn btn--ghost" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <textarea id="resumo_ta" className="textarea" rows={18} readOnly value={text} />
          <div className="muted" style={{ marginTop: 8 }}>
            Dica: você pode copiar e colar no boletim/relatório depois.
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>Fechar</button>
          <button className="btn btn--primary" type="button" onClick={copy}>Copiar</button>
        </div>
      </div>
    </div>
  );
}

function AutoGrowTextarea({ value, onChange, placeholder }) {
  const [rows, setRows] = useState(4);

  useEffect(() => {
    const lines = (value || "").split("\n").length;
    const len = (value || "").length;
    const est = Math.min(18, Math.max(4, lines + Math.floor(len / 90)));
    setRows(est);
  }, [value]);

  return (
    <textarea
      className="textarea"
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function FavoriteField({ label, value, favorites, onChange, onToggleFav }) {
  const isFav = (favorites || []).some((x) => x.toLowerCase() === String(value || "").trim().toLowerCase());

  return (
    <div className="favfield">
      <Field
        label={
          <span className="row row--space" style={{ width: "100%" }}>
            <span>{label}</span>
            <button
              type="button"
              className={`btn btn--ghost ${isFav ? "fav--on" : ""}`}
              onClick={(e) => { e.preventDefault(); onToggleFav?.(); }}
              title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              aria-label="Favoritar"
            >
              {isFav ? "★" : "☆"}
            </button>
          </span>
        }
      >
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite ou escolha abaixo…"
          list={`list_${label}`}
        />
        <datalist id={`list_${label}`}>
          {(favorites || []).map((f) => <option key={f} value={f} />)}
        </datalist>

        {(favorites || []).length ? (
          <div className="chips">
            {(favorites || []).slice(0, 8).map((f) => (
              <button key={f} className="chip" type="button" onClick={() => onChange(f)}>{f}</button>
            ))}
          </div>
        ) : (
          <div className="muted">Sem favoritos ainda. Digite e toque na estrela para salvar.</div>
        )}
      </Field>
    </div>
  );
}
