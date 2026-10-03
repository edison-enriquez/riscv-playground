import React, { useEffect, useRef, useState } from "react";

// Botón de acción del editor al estilo VS Code: icono de ejecutar + flecha con menú.
// La última opción elegida queda como acción principal (como "Run Python File ▾").
const ICONS = {
  run: <path d="M7 4.5v15l12-7.5z" />,
  runall: <><path d="M5 4.5v15l10-7.5z" /><path d="M18 5v14" /></>,
  cloud: <><path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z" /><path d="M11 11.5v5l4-2.5z" fill="currentColor" stroke="none" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  chevron: <path d="M7 10l5 5 5-5" />,
};
export function ActionIcon({ name, size = 16 }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
  );
}

export default function RunSplit({ actions, defaultId, onPick, busy }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const items = actions.filter((a) => !a.separator);
  const def = items.find((a) => a.id === defaultId && !a.noDefault) || items[0];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    box.current?.querySelector("[role=menuitem]")?.focus();
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  const pick = (a) => { setOpen(false); if (!a.noDefault) onPick?.(a.id); a.run(); };
  const onMenuKey = (e) => {
    const list = [...box.current.querySelectorAll("[role=menuitem]:not(:disabled)")];
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };

  return (
    <div className="runsplit" ref={box}>
      <button className={`ea-btn${busy ? " busy" : ""}`} onClick={() => def.run()} disabled={busy || def.disabled}
        title={`${def.label}${def.kbd ? ` (${def.kbd})` : ""}`} aria-label={def.label}>
        <ActionIcon name={def.icon || "run"} />
      </button>
      <button className={`ea-btn chev${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        title="Más acciones…" aria-label="Más acciones">
        <ActionIcon name="chevron" size={14} />
      </button>
      {open && (
        <div className="ctxmenu" role="menu" onKeyDown={onMenuKey}>
          {actions.map((a, i) => a.separator ? <div key={`s${i}`} className="ctxsep" role="separator" /> : (
            <button key={a.id} role="menuitem" className="ctxitem" onClick={() => pick(a)} disabled={a.disabled}>
              <span className="ctxicon"><ActionIcon name={a.icon || "run"} size={15} /></span>
              <span className="ctxlabel">{a.label}{a.detail && <em>{a.detail}</em>}</span>
              <span className="ctxkbd">{a.id === def.id && a.kbd ? a.kbd : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
