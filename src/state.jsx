import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadState, saveState } from "./storage/db.js";
import { debounce, formatDateISO, uid } from "./utils.js";

const AppStateContext = createContext(null);

function defaultState() {
  return {
    version: 1,
    lastSavedAt: null,
    days: [],
    favorites: {
      reguladores: [],
      unidades: []
    }
  };
}

export function AppStateProvider({ children }) {
  const [state, setState] = useState(defaultState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadState();
      if (loaded) setState(loaded);
      setHydrated(true);
    })();
  }, []);

  const persist = useMemo(() => debounce(async (next) => {
    const withStamp = { ...next, lastSavedAt: Date.now() };
    await saveState(withStamp);
  }, 500), []);

  useEffect(() => {
    if (!hydrated) return;
    persist(state);
  }, [state, hydrated, persist]);

  // Flush on background/close
  useEffect(() => {
    const flush = async () => {
      try {
        await saveState({ ...state, lastSavedAt: Date.now() });
      } catch {}
    };
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, [state]);

  const api = useMemo(() => ({
    state,
    hydrated,
    setState,

    // Days
    createDay({ viatura, integrantesText, dateISO }) {
      const day = {
        id: uid("day"),
        dateISO: dateISO || formatDateISO(new Date()),
        viatura: viatura || "",
        integrantesText: integrantesText || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        evaluations: []
      };
      setState((s) => ({ ...s, days: [day, ...s.days] }));
      return day.id;
    },
    updateDay(dayId, patch) {
      setState((s) => ({
        ...s,
        days: s.days.map((d) => d.id === dayId ? { ...d, ...patch, updatedAt: Date.now() } : d)
      }));
    },
    deleteDay(dayId) {
      setState((s) => ({ ...s, days: s.days.filter((d) => d.id !== dayId) }));
    },

    // Evaluations
    createEvaluation(dayId) {
      const ev = {
        id: uid("ev"),
        status: "draft", // draft | final
        createdAt: Date.now(),
        updatedAt: Date.now(),

        protocolo: "",
        bravo: "",

        pessoa: { nome: "", documento: "" }, // documento stores raw (masked if cpf)
        docTipo: "documento", // cpf | documento
        endereco: "",
        gps: "",

        vitais: {
          pa: { prejudicada: false, pas: "", pad: "" },
          fc: { prejudicada: false, valor: "" },
          spo2: { prejudicada: false, valor: "" },
          mr: { prejudicada: false, valor: "" },
          glasgow: ""
        },

        casoClinico: "",

        regulacao: { regulador: "", senha: "", unidade: "" },

        admissao: {
          tipo: "", // medico | enfermeiro
          nome: "",
          marcaRetida: false,
          dataHora: "" // yyyy-mm-ddTHH:MM
        }
      };

      setState((s) => ({
        ...s,
        days: s.days.map((d) => {
          if (d.id !== dayId) return d;
          return { ...d, evaluations: [ev, ...d.evaluations], updatedAt: Date.now() };
        })
      }));
      return ev.id;
    },
    updateEvaluation(dayId, evId, patch) {
      setState((s) => ({
        ...s,
        days: s.days.map((d) => {
          if (d.id !== dayId) return d;
          return {
            ...d,
            updatedAt: Date.now(),
            evaluations: d.evaluations.map((ev) =>
              ev.id === evId ? { ...ev, ...patch, updatedAt: Date.now() } : ev
            )
          };
        })
      }));
    },
    deleteEvaluation(dayId, evId) {
      setState((s) => ({
        ...s,
        days: s.days.map((d) => {
          if (d.id !== dayId) return d;
          return { ...d, evaluations: d.evaluations.filter((ev) => ev.id !== evId), updatedAt: Date.now() };
        })
      }));
    },

    // Favorites
    toggleFavorite(kind, value) {
      const key = kind === "regulador" ? "reguladores" : "unidades";
      const v = String(value || "").trim();
      if (!v) return;
      setState((s) => {
        const arr = s.favorites[key] || [];
        const exists = arr.some((x) => x.toLowerCase() === v.toLowerCase());
        const next = exists ? arr.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [v, ...arr];
        return { ...s, favorites: { ...s.favorites, [key]: next.slice(0, 30) } };
      });
    }
  }), [state, hydrated]);

  return (
    <AppStateContext.Provider value={api}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
