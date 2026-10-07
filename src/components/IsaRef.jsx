import React, { useMemo, useState } from "react";
import { ABI, SUPPORTED } from "../sim/isa.js";
import {
  SPEC_URL, SPEC_NAME, FORMAT_FIELDS, FORMAT_INFO, IMM_LAYOUT, SECTIONS, INSTRUCTIONS, PSEUDOS, RAS_HINTS,
} from "../programs/rv32iDoc.js";

// Página de referencia del conjunto RV32I con el mismo lenguaje visual de la app:
// op/funct en verde azulado, registros en azul, inmediatos en ámbar.

const bits = (v, n) => (v >>> 0).toString(2).padStart(n, "0").slice(-n);
const shortFmt = (f) => ({ SH: "I", FENCE: "I", SYS: "I" }[f] || f);
const APP_PSEUDOS = new Set(["nop", "mv", "not", "neg", "j", "jal", "jr", "ret", "beqz", "bnez", "bgt", "ble", "li"]);
const REG_USE = [
  "cero fijo", "dirección de retorno", "puntero de pila", "puntero global", "puntero de hilo", "temporal / enlace alterno",
  "temporal", "temporal", "guardado / puntero de marco", "guardado", "argumento / retorno", "argumento / retorno",
  "argumento", "argumento", "argumento", "argumento", "argumento", "argumento",
  "guardado", "guardado", "guardado", "guardado", "guardado", "guardado", "guardado", "guardado", "guardado", "guardado",
  "temporal", "temporal", "temporal", "temporal",
];

// valor que se muestra en cada campo de la codificación de una instrucción
function fieldValue(ins, name, hi, lo) {
  const n = hi - lo + 1;
  if (name === "opcode") return bits(ins.op, n);
  if (name === "funct3" && ins.f3 !== undefined) return bits(ins.f3, n);
  if (name === "funct7" && ins.f7 !== undefined) return bits(ins.f7, n);
  if (name === "funct12" && ins.f12 !== undefined) return bits(ins.f12, n);
  if (name === "fm" && ins.fm !== undefined) return bits(ins.fm, n);
  if (name === "pred" && ins.pred !== undefined) return bits(ins.pred, n);
  if (name === "succ" && ins.succ !== undefined) return bits(ins.succ, n);
  if (ins.fmt === "SYS" && (name === "rs1" || name === "rd")) return "00000";
  return null;
}

function Strip({ fields, ins, compact }) {
  return (
    <div className="isa-strip-scroll">
      <div className={`isa-strip${compact ? " compact" : ""}`}>
        {fields.map(([name, hi, lo, kind]) => {
          const v = ins ? fieldValue(ins, name, hi, lo) : null;
          return (
            <div key={name} className={`isa-f k-${kind}${v ? " const" : ""}`} style={{ gridColumn: `span ${hi - lo + 1}` }} title={`${name}: bits ${hi}–${lo}`}>
              <span className="isa-fv">{v ?? name}</span>
              <span className="isa-fr">{hi === lo ? hi : `${hi}–${lo}`}{v && <i> {name}</i>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// resalta la sintaxis: mnemónico, registros, inmediatos
function Syntax({ text }) {
  const parts = text.split(/(\s+|,|\(|\))/).filter((p) => p !== "");
  return (
    <code className="isa-syn">
      {parts.map((p, i) => {
        let c = "";
        if (i === 0) c = "s-m";
        else if (/^(rd|rs1|rs2|rs|rt)$/.test(p)) c = "s-r";
        else if (/^(imm|offset|shamt|pred|succ)$/.test(p)) c = "s-i";
        return <span key={i} className={c}>{p}</span>;
      })}
    </code>
  );
}

export default function IsaRef() {
  const [q, setQ] = useState("");
  const [onlyBook, setOnlyBook] = useState(false);
  const [fmt, setFmt] = useState(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return INSTRUCTIONS.filter((ins) => {
      if (onlyBook && !SUPPORTED.has(ins.m)) return false;
      if (fmt && shortFmt(ins.fmt) !== fmt) return false;
      if (!t) return true;
      return [ins.m, ins.syntax, ins.rtl, ins.desc].some((s) => s.toLowerCase().includes(t));
    });
  }, [q, onlyBook, fmt]);

  const toc = [["isa-modelo", "Modelo"], ["isa-formatos", "Formatos"], ["isa-inm", "Inmediatos"], ...SECTIONS.map((s) => [`isa-${s.id}`, s.title]), ["isa-pseudo", "Pseudoinstrucciones"], ["isa-hint", "NOP y HINT"]];
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="isa-page">
      <header className="isa-hero">
        <div className="isa-kicker">Referencia</div>
        <h1>RV32I <span>Conjunto base de instrucciones enteras · versión 2.1</span></h1>
        <p className="isa-lede">
          {INSTRUCTIONS.filter((i) => !i.variant).length} instrucciones de 32 bits en 6 formatos. Las <b>{SUPPORTED.size}</b> marcadas con
          <span className="isa-book">procesador</span> son las que implementa el procesador single-cycle del libro.
        </p>
        <p className="isa-src">Fuente: <a href={SPEC_URL} target="_blank" rel="noreferrer">{SPEC_NAME}</a>. Traducción y formato propios; el documento oficial es la referencia normativa.</p>
      </header>

      <div className="isa-toolbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: beq, desplazamiento, signo…" aria-label="Buscar instrucción" />
        <div className="isa-chips" role="group" aria-label="Filtros">
          <button className={`chipf${onlyBook ? " on" : ""}`} aria-pressed={onlyBook} onClick={() => setOnlyBook((v) => !v)}>Solo del procesador</button>
          {["R", "I", "S", "B", "U", "J"].map((f) => (
            <button key={f} className={`chipf fmt${fmt === f ? " on" : ""}`} aria-pressed={fmt === f} onClick={() => setFmt((x) => (x === f ? null : f))}>{f}</button>
          ))}
        </div>
        <nav className="isa-toc" aria-label="Contenido">
          {toc.map(([id, t]) => <button key={id} onClick={() => go(id)}>{t}</button>)}
        </nav>
      </div>

      {!q && !onlyBook && !fmt && (
        <>
          <section id="isa-modelo" className="isa-sec">
            <h2><span className="isa-num">1.1.1</span>Modelo del programador</h2>
            <p>XLEN = 32: hay 32 registros <code>x0</code>–<code>x31</code> de 32 bits y el registro <code>pc</code> con la dirección de la instrucción actual. <code>x0</code> vale siempre cero. El ISA no fija registros de pila ni de enlace; la convención de llamadas usa <code>x1</code> para la dirección de retorno, <code>x5</code> como enlace alterno y <code>x2</code> como puntero de pila. Los nombres ABI vienen de esa convención.</p>
            <div className="isa-regs">
              {ABI.map((a, i) => (
                <div key={i} className="isa-reg"><b>x{i}</b><span>{a}</span><em>{REG_USE[i]}</em></div>
              ))}
            </div>
          </section>

          <section id="isa-formatos" className="isa-sec">
            <h2><span className="isa-num">1.1.2</span>Formatos de instrucción</h2>
            <p>Todas las instrucciones miden 32 bits y deben estar alineadas a 4 bytes. <code>rs1</code>, <code>rs2</code> y <code>rd</code> ocupan siempre la misma posición, y el bit de signo de todo inmediato es el bit 31 de la instrucción: así la decodificación de registros y la extensión de signo empiezan antes de saber qué instrucción es.</p>
            <div className="isa-formats">
              {["R", "I", "S", "B", "U", "J"].map((f) => (
                <button key={f} className="isa-fmtrow" onClick={() => setFmt(f)} title={`Ver las instrucciones tipo ${f}`}>
                  <span className={`fmt-badge k-${f}`}>tipo {f}</span>
                  <Strip fields={FORMAT_FIELDS[f]} compact />
                  <span className="isa-fmtinfo">{FORMAT_INFO[f]}</span>
                </button>
              ))}
            </div>
          </section>

          <section id="isa-inm" className="isa-sec">
            <h2><span className="isa-num">1.1.3</span>Cómo se forma cada inmediato</h2>
            <p>Bits del inmediato de 32 bits (de izquierda a derecha, del 31 al 0) y de qué bits de la instrucción, <code>inst[…]</code>, sale cada uno; abajo, la posición en el inmediato. «signo» es inst[31] repetido. Esto es lo que hace el bloque <b>Extend</b> de la ruta de datos.</p>
            <div className="isa-imms">
              {Object.entries(IMM_LAYOUT).map(([t, parts]) => (
                <div key={t} className="isa-immrow">
                  <span className={`fmt-badge k-${t}`}>{t}</span>
                  <div className="isa-immbar">
                    {parts.map(([range, src]) => {
                      const [a, b] = range.split("–").map(Number);
                      const w = b === undefined ? 1 : a - b + 1;
                      return (
                        <div key={range} className={`isa-imm${src === "0" ? " zero" : ""}${src.includes("signo") ? " sign" : ""}`} style={{ flexGrow: w }}>
                          <b>{src}</b><i>{range}</i>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {SECTIONS.map((s) => {
        const list = filtered.filter((i) => i.sec === s.id);
        if (!list.length) return null;
        return (
          <section key={s.id} id={`isa-${s.id}`} className="isa-sec">
            <h2><span className="isa-num">{s.spec}</span>{s.title}</h2>
            <p>{s.intro}</p>
            <div className="isa-list">
              {list.map((ins) => (
                <article key={ins.m} className={`isa-ins${SUPPORTED.has(ins.m) ? " book" : ""}`}>
                  <div className="isa-ins-head">
                    <h3>{ins.m}</h3>
                    <Syntax text={ins.syntax} />
                    <span className={`fmt-badge k-${shortFmt(ins.fmt)}`}>tipo {shortFmt(ins.fmt)}</span>
                    {SUPPORTED.has(ins.m) && <span className="isa-book">procesador</span>}
                    {ins.variant && <span className="isa-var">variante de fence</span>}
                  </div>
                  <code className="isa-rtl">{ins.rtl}</code>
                  <p>{ins.desc}</p>
                  <Strip fields={FORMAT_FIELDS[ins.fmt]} ins={ins} />
                </article>
              ))}
            </div>
            {s.id === "jump" && (
              <div className="isa-note">
                <h4>Pistas para predecir retornos</h4>
                <p>Un procesador puede usar una pila de direcciones de retorno (RAS). jal la usa solo si rd es x1 o x5. Para jalr:</p>
                <table className="isa-table">
                  <thead><tr><th>rd es x1/x5</th><th>rs1 es x1/x5</th><th>rd = rs1</th><th>Acción en la RAS</th></tr></thead>
                  <tbody>{RAS_HINTS.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {filtered.length === 0 && <p className="hint isa-empty">Ninguna instrucción coincide con la búsqueda.</p>}

      {!q && !onlyBook && !fmt && (
        <>
          <section id="isa-pseudo" className="isa-sec">
            <h2>Pseudoinstrucciones</h2>
            <p>No tienen codificación propia: el ensamblador las traduce a una instrucción base.</p>
            <table className="isa-table">
              <thead><tr><th>Pseudoinstrucción</th><th>Equivale a</th><th>En la especificación</th><th>Ensamblador de la app</th></tr></thead>
              <tbody>
                {PSEUDOS.map((p) => (
                  <tr key={p.p}>
                    <td><Syntax text={p.p} /></td>
                    <td><code>{p.base}</code></td>
                    <td>{p.spec ? "sí" : "—"}</td>
                    <td>{APP_PSEUDOS.has(p.p.split(" ")[0]) ? "sí" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section id="isa-hint" className="isa-sec">
            <h2><span className="isa-num">1.1.4.3 · 1.1.9</span>NOP y HINT</h2>
            <p><code>nop</code> se codifica como <code>addi x0, x0, 0</code>: solo avanza el pc. Las instrucciones que escriben en <code>x0</code> (por ejemplo <code>add x0, …</code>) se reservan como <b>HINT</b>: no cambian el estado arquitectónico salvo el pc y los contadores, y una implementación simple las ejecuta como instrucciones normales sin efecto visible. Algunas tienen uso estándar: <code>fence</code> con pred = W y succ = 0 es <code>pause</code>, y <code>add x0, x0, x2…x5</code> son las pistas de localidad NTL.</p>
          </section>
        </>
      )}

      <footer className="isa-foot">
        Basado en <a href={SPEC_URL} target="_blank" rel="noreferrer">{SPEC_NAME}</a>, RISC-V International.
      </footer>
    </div>
  );
}
