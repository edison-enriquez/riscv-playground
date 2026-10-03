import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Visor con zoom y desplazamiento para el diagrama.
// - Botones −, %, +, Ajustar (esquina inferior derecha)
// - Ctrl/⌘ + rueda (o pellizco en el trackpad) hace zoom alrededor del cursor
// - Arrastrar con el ratón desplaza el diagrama cuando es más grande que la vista
// - Teclas + − 0 (fuera del editor de código)
const MIN = 0.4, MAX = 5, STEP = 1.25;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

export default function ZoomPane({ children, innerRef, aspect = 625 / 1040 }) {
  const vp = useRef(null);
  const [z, setZ] = useState(1); // 1 = ancho de la vista
  const zRef = useRef(1);
  zRef.current = z;
  const anchor = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const zoomTo = useCallback((nz, cx, cy) => {
    const el = vp.current;
    if (!el) return;
    nz = clamp(nz);
    const x = cx ?? el.clientWidth / 2, y = cy ?? el.clientHeight / 2;
    anchor.current = { fx: (el.scrollLeft + x) / el.scrollWidth, fy: (el.scrollTop + y) / el.scrollHeight, x, y };
    setZ(nz);
  }, []);

  // conservar el punto bajo el cursor después de cambiar el tamaño
  useLayoutEffect(() => {
    const a = anchor.current, el = vp.current;
    if (!a || !el) return;
    el.scrollLeft = a.fx * el.scrollWidth - a.x;
    el.scrollTop = a.fy * el.scrollHeight - a.y;
    anchor.current = null;
  }, [z]);

  const fitAll = useCallback(() => {
    const el = vp.current;
    if (!el) return;
    const w = el.clientWidth - 8, h = el.clientHeight - 8;
    setZ(clamp(Math.min(1, h / (w * aspect))));
    el.scrollLeft = 0; el.scrollTop = 0;
  }, [aspect]);

  // Ctrl + rueda: zoom (listener no pasivo para poder evitar el zoom del navegador)
  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zRef.current * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  // teclado: + − 0
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.(".cm-editor, textarea, input, select")) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(zRef.current * STEP); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomTo(zRef.current / STEP); }
      else if (e.key === "0") { e.preventDefault(); setZ(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomTo]);

  // arrastrar para desplazar
  const onPointerDown = (e) => {
    const el = vp.current;
    if (e.button !== 0 || e.pointerType === "touch" || !el) return;
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current, el = vp.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDragging(true); el.setPointerCapture?.(d.id); }
    el.scrollLeft = d.sl - dx;
    el.scrollTop = d.st - dy;
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  const pct = Math.round(z * 100);
  return (
    <div className="dp-stage">
      <div className={`dp-viewport${dragging ? " dragging" : ""}`} ref={vp}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onDoubleClick={(e) => { const r = vp.current.getBoundingClientRect(); zoomTo(z < 1.9 ? 2 : 1, e.clientX - r.left, e.clientY - r.top); }}>
        <div className="dp-wrap" ref={innerRef} style={{ width: `calc(${z} * 100%)` }}>
          {children}
        </div>
      </div>
      <div className="zoombar" role="group" aria-label="Zoom del diagrama">
        <button onClick={() => zoomTo(z / STEP)} disabled={z <= MIN + 1e-6} title="Alejar (−)" aria-label="Alejar">−</button>
        <button className="zpct" onClick={() => setZ(1)} title="Ancho de la vista (0)" aria-label={`Zoom ${pct} %, volver al ancho de la vista`}>{pct}%</button>
        <button onClick={() => zoomTo(z * STEP)} disabled={z >= MAX - 1e-6} title="Acercar (+)" aria-label="Acercar">+</button>
        <button className="zfit" onClick={fitAll} title="Ver el diagrama completo" aria-label="Ver el diagrama completo">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>
      {pct === 100 && <div className="zoomhint" aria-hidden="true">Ctrl + rueda para zoom · arrastre para mover · doble clic acerca</div>}
    </div>
  );
}
