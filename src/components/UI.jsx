import React, { useEffect, useRef, useState } from "react";

export function TopBar({ title, left, right }) {
  return (
    <header className="topbar">
      <div className="topbar__left">{left}</div>
      <div className="topbar__title">{title}</div>
      <div className="topbar__right">{right}</div>
    </header>
  );
}

export function Card({ children, onClick }) {
  return (
    <div className={`card ${onClick ? "card--clickable" : ""}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      {children}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <div className="field__label">{label}</div>
      {children}
      {hint ? <div className="field__hint">{hint}</div> : null}
    </label>
  );
}

export function Section({ title, children, defaultOpen = true }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary className="section__summary">{title}</summary>
      <div className="section__body">{children}</div>
    </details>
  );
}

export function Toast({ text }) {
  if (!text) return null;
  return <div className="toast">{text}</div>;
}

export function HoldToConfirmButton({ className="", seconds = 1.5, onConfirm, children }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (!holding) return;
    const tick = (t) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = (t - startRef.current) / 1000;
      const p = Math.min(1, elapsed / seconds);
      setProgress(p);
      if (p >= 1) {
        setHolding(false);
        setProgress(0);
        startRef.current = 0;
        onConfirm?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = 0;
    };
  }, [holding, seconds, onConfirm]);

  const stop = () => {
    setHolding(false);
    setProgress(0);
  };

  return (
    <button
      className={`btn btn--danger ${className}`}
      onPointerDown={() => setHolding(true)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      type="button"
    >
      <span className="holdbtn__text">{children}</span>
      {holding ? <span className="holdbtn__bar" style={{ transform: `scaleX(${progress})` }} /> : null}
    </button>
  );
}
