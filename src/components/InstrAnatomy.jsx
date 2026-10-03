import React, { useState } from "react";
import { RV32I, ABI, fields, mnemonicOf, disassemble, hex, SUPPORTED } from "../sim/isa.js";

// Campos de cada formato, del bit 31 al 0. kind: op | fn | reg | imm
const LAYOUT = {
  R: [["funct7", 31, 25, "fn"], ["rs2", 24, 20, "reg"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["op", 6, 0, "op"]],
  I: [["imm[11:0]", 31, 20, "imm"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["op", 6, 0, "op"]],
  SH: [["funct7", 31, 25, "fn"], ["shamt", 24, 20, "imm"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["op", 6, 0, "op"]],
  S: [["imm[11:5]", 31, 25, "imm"], ["rs2", 24, 20, "reg"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["imm[4:0]", 11, 7, "imm"], ["op", 6, 0, "op"]],
  B: [["imm[12|10:5]", 31, 25, "imm"], ["rs2", 24, 20, "reg"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["imm[4:1|11]", 11, 7, "imm"], ["op", 6, 0, "op"]],
  U: [["imm[31:12]", 31, 12, "imm"], ["rd", 11, 7, "reg"], ["op", 6, 0, "op"]],
  J: [["imm[20|10:1|11|19:12]", 31, 12, "imm"], ["rd", 11, 7, "reg"], ["op", 6, 0, "op"]],
};
const FORMATS = ["R", "I", "S", "B", "U", "J"];

// Cómo se arma el inmediato: piezas de la instrucción, de la más significativa a la menos
const IMM_PARTS = {
  I: { bits: 12, src: [[31, 20]], immSrc: "00" },
  L: { bits: 12, src: [[31, 20]], immSrc: "00" },
  S: { bits: 12, src: [[31, 25], [11, 7]], immSrc: "01" },
  B: { bits: 13, src: [[31, 31], [7, 7], [30, 25], [11, 8], "0"], immSrc: "10" },
  J: { bits: 21, src: [[31, 31], [19, 12], [20, 20], [30, 21], "0"], immSrc: "11" },
  U: { bits: 32, src: [[31, 12], "000000000000"], immSrc: "—" },
};

const OP_NAME = {
  0b0000011: "carga (lw)", 0b0100011: "almacenamiento (sw)", 0b0110011: "tipo R (ALU con registros)",
  0b0010011: "tipo I (ALU con inmediato)", 0b1100011: "salto condicional (beq)", 0b1101111: "jal",
  0b0110111: "lui", 0b0010111: "auipc", 0b1100111: "jalr", 0b1110011: "sistema",
};
const KIND_NAME = { op: "código de operación", fn: "función", reg: "registro", imm: "inmediato" };

const bit = (w, i) => (w >>> i) & 1;
const bitsOf = (w, hi, lo) => { let s = ""; for (let i = hi; i >= lo; i--) s += bit(w, i); return s; };
const val = (w, hi, lo) => (w >>> lo) & (2 ** (hi - lo + 1) - 1);

function fieldNote(name, kind, v, w, mnem) {
  if (kind === "reg") return `x${v} (${ABI[v]})`;
  if (name === "op") return OP_NAME[v] || "no reconocido";
  if (name === "funct3") return mnem ? `con op elige ${mnem}` : `= ${v}`;
  if (name === "funct7") return v === 0x20 ? "bit 30 = 1: resta / aritmético" : v === 0 ? "0" : `= ${v}`;
  if (name === "shamt") return `desplaza ${v}`;
  return `= ${v}`;
}

export default function InstrAnatomy({ word, addr, isCurrent, onFollowPC }) {
  const [hot, setHot] = useState(null); // [hi, lo] del rango resaltado
  const [showAll, setShowAll] = useState(false);
  if (word === null || word === undefined) return <p className="hint">Elija una instrucción en el listado del programa.</p>;

  const mnem = mnemonicOf(word);
  const fmt = mnem ? RV32I[mnem][0] : "R";
  const layoutKey = fmt === "L" || fmt === "SYS" ? "I" : fmt;
  const layout = LAYOUT[layoutKey];
  const shortFmt = { L: "I", SH: "I", SYS: "I" }[fmt] || fmt;
  const f = fields(word);
  const imm = IMM_PARTS[fmt === "SH" || fmt === "SYS" ? "none" : fmt];
  const immVal = { I: f.immI, L: f.immI, S: f.immS, B: f.immB, J: f.immJ, U: f.immU }[fmt];
  const inRange = (i) => hot && i <= hot[0] && i >= hot[1];
  const fieldAt = (i) => layout.find(([, hi, lo]) => i <= hi && i >= lo);

  return (
    <div className="anat">
      <div className="anat-head">
        <code className="anat-asm">{disassemble(word, addr)}</code>
        <span className={`fmt-badge k-${shortFmt}`}>tipo {shortFmt}</span>
        <span className="anat-meta">0x{hex(word)} · dirección 0x{hex(addr)}</span>
        {!SUPPORTED.has(mnem ?? "?") && <span className="tag">no implementada</span>}
        {!isCurrent && <button className="link" onClick={onFollowPC}>Volver a la instrucción del PC</button>}
      </div>

      <div className="bits-scroll">
        <div className="bits" role="img" aria-label={`Bits de la instrucción ${disassemble(word, addr)}`}>
          <div className="bitrow idx">
            {Array.from({ length: 32 }, (_, k) => 31 - k).map((i) => <span key={i} className={inRange(i) ? "hot" : ""}>{i}</span>)}
          </div>
          <div className="bitrow val">
            {Array.from({ length: 32 }, (_, k) => 31 - k).map((i) => {
              const fd = fieldAt(i);
              const edge = fd && i === fd[2] && i !== 0;
              return <span key={i} className={`k-${fd?.[3]}${edge ? " edge" : ""}${inRange(i) ? " hot" : ""}`}>{bit(word, i)}</span>;
            })}
          </div>
          <div className="fieldrow">
            {layout.map(([name, hi, lo, kind]) => {
              const v = val(word, hi, lo);
              return (
                <button key={name} style={{ gridColumn: `span ${hi - lo + 1}` }} className={`field k-${kind}${hot && hot[0] === hi && hot[1] === lo ? " on" : ""}`}
                  onMouseEnter={() => setHot([hi, lo])} onMouseLeave={() => setHot(null)} onFocus={() => setHot([hi, lo])} onBlur={() => setHot(null)}
                  title={`${name}: bits ${hi}–${lo} (${KIND_NAME[kind]})`}>
                  <b>{name}</b>
                  <span className="fb">{hi - lo + 1 > 12 ? `${bitsOf(word, hi, lo).slice(0, 8)}…` : bitsOf(word, hi, lo)}</span>
                  <span className="fn">{fieldNote(name, kind, v, word, mnem)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {imm && (
        <div className="immbox">
          <div className="imm-title">
            <span>Inmediato</span>
            <span className="muted">Extend con ImmSrc = {imm.immSrc}{imm.bits < 32 ? `: ${imm.bits} bits con signo → 32 bits` : ": los 20 bits van arriba"}</span>
          </div>
          <div className="immparts">
            {imm.src.map((p, k) => typeof p === "string" ? (
              <span key={k} className="ipart zero"><b>{p}</b><i>fijo</i></span>
            ) : (
              <span key={k} className={`ipart${hot && hot[0] === p[0] && hot[1] === p[1] ? " on" : ""}`}
                onMouseEnter={() => setHot(p)} onMouseLeave={() => setHot(null)}>
                <b>{bitsOf(word, p[0], p[1])}</b><i>Instr[{p[0] === p[1] ? p[0] : `${p[0]}:${p[1]}`}]</i>
              </span>
            ))}
            <span className="ieq">=</span>
            <span className="ires"><b>{immVal}</b><i>0x{hex(immVal)}</i></span>
          </div>
          {fmt === "B" || fmt === "J" ? (
            <p className="hint">El bit 0 no se guarda: los saltos van siempre a direcciones pares. Destino = PC + {immVal} = 0x{hex((addr + immVal) >>> 0)}.</p>
          ) : null}
        </div>
      )}

      <button className="link" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
        {showAll ? "Ocultar los seis formatos" : "Ver los seis formatos"}
      </button>
      {showAll && (
        <div className="formats">
          {FORMATS.map((F) => (
            <div key={F} className={`frow${F === shortFmt && fmt !== "SH" ? " cur" : ""}`}>
              <span className="fname">{F}</span>
              <div className="fcells" style={{ gridTemplateColumns: LAYOUT[F].map(([, hi, lo]) => `${hi - lo + 1}fr`).join(" ") }}>
                {LAYOUT[F].map(([name, hi, lo, kind]) => <span key={name} className={`fcell k-${kind}`}>{name}<i>{hi}{hi !== lo ? `–${lo}` : ""}</i></span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
