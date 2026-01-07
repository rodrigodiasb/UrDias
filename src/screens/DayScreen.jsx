import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppState } from "../state.jsxx";
import { formatDateBR, normalizeForSearch } from "../utils.js";
import { Card, TopBar } from "../components/UI.jsx";

function displayName(ev) {
  const nome = (ev?.pessoa?.nome || "").trim();
  return nome ? nome : "Não identificado";
}

export default function DayScreen() {
  const nav = useNavigate();
  const { dayId } = useParams();
  const { state, createEvaluation } = useAppState();
  const [q, setQ] = useState("");

  const day = useMemo(() => (state.days || []).find((d) => d.id === dayId), [state.days, dayId]);

  const evaluations = useMemo(() => {
    const list = (day?.evaluations || []);
    const nq = normalizeForSearch(q);
    if (!nq) return list;
    return list.filter((ev) => {
      const protocolo = normalizeForSearch(ev?.protocolo || "");
      const nome = normalizeForSearch(displayName(ev));
      const doc = normalizeForSearch(ev?.pessoa?.documento || "");
      return protocolo.includes(nq) || nome.includes(nq) || doc.includes(nq);
    });
  }, [day, q]);

  if (!day) {
    return (
      <div className="app">
        <TopBar title="Dia não encontrado" left={<button className="btn btn--ghost" onClick={() => nav("/")}>←</button>} />
        <main className="content">
          <p className="muted">Este dia não existe (ou foi excluído).</p>
          <button className="btn btn--primary" onClick={() => nav("/")}>Voltar</button>
        </main>
      </div>
    );
  }

  const onNew = () => {
    const evId = createEvaluation(day.id);
    nav(`/day/${day.id}/eval/${evId}`);
  };

  const integrantesCount = (day.integrantesText || "").split("\n").map(x => x.trim()).filter(Boolean).length;

  return (
    <div className="app">
      <TopBar
        title={`${formatDateBR(day.dateISO)} — ${day.viatura || "Sem viatura"}`}
        left={<button className="btn btn--ghost" type="button" onClick={() => nav("/")}>←</button>}
        right={<button className="btn btn--primary" type="button" onClick={onNew}>+ Avaliação</button>}
      />

      <main className="content">
        <div className="subhead">
          <div className="muted">{integrantesCount} integrante(s)</div>
        </div>

        <div className="searchbar">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por protocolo, nome ou documento…"
          />
          {q ? <button className="btn btn--ghost" type="button" onClick={() => setQ("")}>Limpar</button> : null}
        </div>

        {evaluations.length === 0 ? (
          <div className="empty">
            <h2>Nenhuma avaliação</h2>
            <p>Toque em <b>+ Avaliação</b> para iniciar (salva automaticamente).</p>
          </div>
        ) : (
          <div className="list">
            {evaluations.map((ev) => (
              <Card key={ev.id} onClick={() => nav(`/day/${day.id}/eval/${ev.id}`)}>
                <div className="row row--space">
                  <div>
                    <div className="title">{ev.protocolo || "Sem protocolo"} — {displayName(ev)}</div>
                    <div className="muted">
                      {ev.status === "final" ? "✅ Salva" : "📝 Rascunho"}
                      {ev?.regulacao?.unidade ? ` • ${ev.regulacao.unidade}` : ""}
                    </div>
                  </div>
                  <div className={`pill ${ev.status === "final" ? "pill--ok" : "pill--draft"}`}>
                    {ev.status === "final" ? "FINAL" : "DRAFT"}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
