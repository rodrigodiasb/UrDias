import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state.jsxx";
import { formatDateBR, formatDateISO } from "../utils.js";
import { Card, Field, TopBar } from "../components/UI.jsx";

export default function DaysScreen() {
  const nav = useNavigate();
  const { state, hydrated, createDay, deleteDay } = useAppState();
  const [showNew, setShowNew] = useState(false);

  const [viatura, setViatura] = useState("");
  const [integrantesText, setIntegrantesText] = useState("");
  const [dateISO, setDateISO] = useState(formatDateISO(new Date()));

  const days = useMemo(() => state.days || [], [state.days]);

  const onCreate = () => {
    const id = createDay({ viatura, integrantesText, dateISO });
    setViatura("");
    setIntegrantesText("");
    setDateISO(formatDateISO(new Date()));
    setShowNew(false);
    nav(`/day/${id}`);
  };

  return (
    <div className="app">
      <TopBar
        title="Triagem GU"
        right={<button className="btn" onClick={() => setShowNew(true)} type="button">+ Novo dia</button>}
      />

      <main className="content">
        {!hydrated ? (
          <div className="muted">Carregando dados locais...</div>
        ) : days.length === 0 ? (
          <div className="empty">
            <h2>Nenhum dia cadastrado</h2>
            <p>Toque em <b>+ Novo dia</b> para começar.</p>
          </div>
        ) : (
          <div className="list">
            {days.map((d) => {
              const integrantesCount = (d.integrantesText || "").split("\n").map(x => x.trim()).filter(Boolean).length;
              return (
                <Card key={d.id} onClick={() => nav(`/day/${d.id}`)}>
                  <div className="row row--space">
                    <div>
                      <div className="title">{formatDateBR(d.dateISO)} — {d.viatura || "Sem viatura"}</div>
                      <div className="muted">{integrantesCount} integrante(s) • {d.evaluations?.length || 0} avaliação(ões)</div>
                    </div>
                    <button
                      className="btn btn--ghost"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const ok = window.confirm("Excluir este dia e todas as avaliações? Esta ação não pode ser desfeita.");
                        if (ok) deleteDay(d.id);
                      }}
                      aria-label="Excluir dia"
                    >
                      🗑
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {showNew ? (
        <div className="modal__backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal__header">
              <div className="modal__title">Novo dia de serviço</div>
              <button className="btn btn--ghost" type="button" onClick={() => setShowNew(false)}>✕</button>
            </div>

            <div className="modal__body">
              <Field label="Viatura">
                <input className="input" value={viatura} onChange={(e) => setViatura(e.target.value)} placeholder="Ex.: UR-12 / ASU-01 / Bravo 03" />
              </Field>

              <Field label="Integrantes (1 por linha)" hint="Ex.: Rodrigo Dias Batista ↵ Lidiane Batista Sousa ↵ Américo Gonçalves">
                <textarea className="textarea" rows={5} value={integrantesText} onChange={(e) => setIntegrantesText(e.target.value)} placeholder="Digite um nome por linha..." />
              </Field>

              <Field label="Data">
                <input className="input" type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
              </Field>
            </div>

            <div className="modal__footer">
              <button className="btn btn--ghost" type="button" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn--primary" type="button" onClick={onCreate}>Salvar dia</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
