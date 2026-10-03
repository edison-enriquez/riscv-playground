// isa.js — Ensamblador y desensamblador RV32I (sin dependencias)
// El ensamblador acepta todo RV32I; el simulador single-cycle solo ejecuta
// el subconjunto del libro (ver SUPPORTED).

export const ABI = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
  "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"];

// Instrucciones que implementa el procesador single-cycle del libro (secciones 7.3.1–7.3.4)
export const SUPPORTED = new Set(["lw", "sw", "add", "sub", "and", "or", "slt", "addi", "andi", "ori", "slti", "beq", "jal"]);

// Tabla RV32I: nombre -> [formato, op, funct3, funct7]
export const RV32I = {
  lui: ["U", 0b0110111], auipc: ["U", 0b0010111], jal: ["J", 0b1101111],
  jalr: ["I", 0b1100111, 0],
  beq: ["B", 0b1100011, 0], bne: ["B", 0b1100011, 1], blt: ["B", 0b1100011, 4],
  bge: ["B", 0b1100011, 5], bltu: ["B", 0b1100011, 6], bgeu: ["B", 0b1100011, 7],
  lb: ["L", 0b0000011, 0], lh: ["L", 0b0000011, 1], lw: ["L", 0b0000011, 2], lbu: ["L", 0b0000011, 4], lhu: ["L", 0b0000011, 5],
  sb: ["S", 0b0100011, 0], sh: ["S", 0b0100011, 1], sw: ["S", 0b0100011, 2],
  addi: ["I", 0b0010011, 0], slti: ["I", 0b0010011, 2], sltiu: ["I", 0b0010011, 3],
  xori: ["I", 0b0010011, 4], ori: ["I", 0b0010011, 6], andi: ["I", 0b0010011, 7],
  slli: ["SH", 0b0010011, 1, 0], srli: ["SH", 0b0010011, 5, 0], srai: ["SH", 0b0010011, 5, 0x20],
  add: ["R", 0b0110011, 0, 0], sub: ["R", 0b0110011, 0, 0x20], sll: ["R", 0b0110011, 1, 0],
  slt: ["R", 0b0110011, 2, 0], sltu: ["R", 0b0110011, 3, 0], xor: ["R", 0b0110011, 4, 0],
  srl: ["R", 0b0110011, 5, 0], sra: ["R", 0b0110011, 5, 0x20], or: ["R", 0b0110011, 6, 0], and: ["R", 0b0110011, 7, 0],
  ecall: ["SYS", 0b1110011, 0], ebreak: ["SYS", 0b1110011, 0],
};

export function regNum(tok) {
  const t = tok.trim().toLowerCase();
  if (/^x([0-9]|[12][0-9]|3[01])$/.test(t)) return parseInt(t.slice(1), 10);
  if (t === "fp") return 8;
  const i = ABI.indexOf(t);
  if (i < 0) throw new Error(`registro desconocido "${tok}"`);
  return i;
}

export function parseImm(tok) {
  const t = tok.trim().toLowerCase().replace(/_/g, "");
  let v;
  if (/^-?0x[0-9a-f]+$/.test(t)) v = t.startsWith("-") ? -parseInt(t.slice(3), 16) : parseInt(t.slice(2), 16);
  else if (/^-?0b[01]+$/.test(t)) v = t.startsWith("-") ? -parseInt(t.slice(3), 2) : parseInt(t.slice(2), 2);
  else if (/^-?[0-9]+$/.test(t)) v = parseInt(t, 10);
  else throw new Error(`valor inmediato inválido "${tok}"`);
  return v;
}

const u32 = (v) => v >>> 0;
const fits = (v, bits) => v >= -(2 ** (bits - 1)) && v < 2 ** (bits - 1);

function encR(op, f3, f7, rd, rs1, rs2) { return u32((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op); }
function encI(op, f3, rd, rs1, imm) { return u32(((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op); }
function encS(op, f3, rs1, rs2, imm) { return u32((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1f) << 7) | op); }
function encB(op, f3, rs1, rs2, imm) {
  return u32((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7) | op);
}
function encU(op, rd, imm20) { return u32(((imm20 & 0xfffff) << 12) | (rd << 7) | op); }
function encJ(op, rd, imm) {
  return u32((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) | (((imm >> 12) & 0xff) << 12) | (rd << 7) | op);
}

// Expande pseudoinstrucciones a instrucciones reales (antes de asignar direcciones)
function expandPseudo(m, a) {
  switch (m) {
    case "nop": return [["addi", ["x0", "x0", "0"]]];
    case "mv": return [["addi", [a[0], a[1], "0"]]];
    case "not": return [["xori", [a[0], a[1], "-1"]]];
    case "neg": return [["sub", [a[0], "x0", a[1]]]];
    case "j": return [["jal", ["x0", a[0]]]];
    case "ret": return [["jalr", ["x0", "ra", "0"]]];
    case "jr": return [["jalr", ["x0", a[0], "0"]]];
    case "beqz": return [["beq", [a[0], "x0", a[1]]]];
    case "bnez": return [["bne", [a[0], "x0", a[1]]]];
    case "bgt": return [["blt", [a[1], a[0], a[2]]]];
    case "ble": return [["bge", [a[1], a[0], a[2]]]];
    case "li": {
      const v = parseImm(a[1]);
      if (fits(v, 12)) return [["addi", [a[0], "x0", String(v)]]];
      const lo = ((v << 20) >> 20);          // 12 bits bajos con signo
      const hi = ((v - lo) >>> 12) & 0xfffff;
      const out = [["lui", [a[0], String(hi)]]];
      if (lo !== 0) out.push(["addi", [a[0], a[0], String(lo)]]);
      return out;
    }
    case "jal": return a.length === 1 ? [["jal", ["ra", a[0]]]] : [[m, a]];
    default: return [[m, a]];
  }
}

function splitArgs(s) {
  // "x6, -4(x9)" -> ["x6", "-4(x9)"]
  return s.split(",").map((x) => x.trim()).filter((x) => x.length);
}
function memArg(tok) {
  const m = /^(.*)\(\s*([a-z0-9]+)\s*\)$/i.exec(tok.trim());
  if (!m) throw new Error(`se esperaba desplazamiento(registro), por ejemplo -4(x9); se recibió "${tok}"`);
  return { imm: m[1].trim() === "" ? 0 : parseImm(m[1]), rs1: regNum(m[2]) };
}

/**
 * Ensambla un programa.
 * Directivas: .org <dir> (dirección del programa, por defecto 0)
 * Estado inicial en comentarios: "# init: x5=6, x9=0x2004, mem[0x2000]=10"
 * Devuelve { base, words: [{addr, word, src, line}], init: {regs, mem}, errors }
 */
export function assemble(src) {
  const lines = src.split(/\r?\n/);
  const errors = [];
  const init = { regs: {}, mem: {} };
  let base = 0;
  const items = []; // {mnem, args, line, src}
  const labels = {};

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    // estado inicial
    const ini = /#\s*init\s*:(.*)$/i.exec(raw);
    if (ini) {
      ini[1].split(",").forEach((kv) => {
        const p = kv.split("=");
        if (p.length !== 2) return;
        const k = p[0].trim().toLowerCase();
        try {
          const v = parseImm(p[1]);
          const mm = /^mem\[(.+)\]$/.exec(k);
          if (mm) init.mem[parseImm(mm[1]) >>> 0] = v >>> 0;
          else init.regs[regNum(k)] = v >>> 0;
        } catch (e) { errors.push({ line: lineNo, msg: `init: ${e.message}` }); }
      });
    }
    let s = raw.replace(/(#|\/\/).*$/, "").trim();
    if (!s) return;
    // etiquetas (pueden ir varias)
    let lm;
    while ((lm = /^([A-Za-z_.$][\w.$]*)\s*:/.exec(s))) {
      labels[lm[1]] = items.length; // índice de instrucción, se convierte luego
      s = s.slice(lm[0].length).trim();
    }
    if (!s) return;
    if (s.startsWith(".")) {
      const [dir, ...rest] = s.split(/\s+/);
      if (dir === ".org") {
        if (items.length) errors.push({ line: lineNo, msg: ".org debe ir antes de la primera instrucción" });
        else base = parseImm(rest.join("")) >>> 0;
      }
      // las demás directivas (.text, .globl, .type, .size, .file…) se ignoran:
      // así se puede pegar directamente la salida de gcc -S o de Compiler Explorer
      return;
    }
    const sp = s.search(/\s/);
    const mnem = (sp < 0 ? s : s.slice(0, sp)).toLowerCase();
    const args = sp < 0 ? [] : splitArgs(s.slice(sp + 1));
    try {
      expandPseudo(mnem, args).forEach(([m, a]) => items.push({ mnem: m, args: a, line: lineNo, src: s }));
    } catch (e) { errors.push({ line: lineNo, msg: e.message }); }
  });

  const addrOf = (i) => u32(base + 4 * i);
  const labelAddr = {};
  for (const k in labels) labelAddr[k] = addrOf(labels[k]);
  const target = (tok, pc) => {
    if (tok in labelAddr) return labelAddr[tok] - pc;
    return parseImm(tok); // desplazamiento numérico
  };

  const words = [];
  items.forEach((it, i) => {
    const pc = addrOf(i);
    const { mnem: m, args: a } = it;
    try {
      const spec = RV32I[m];
      if (!spec) throw new Error(`instrucción desconocida "${m}"`);
      const [fmt, op, f3, f7] = spec;
      const need = (n) => { if (a.length !== n) throw new Error(`${m} espera ${n} operandos`); };
      let w;
      switch (fmt) {
        case "R": need(3); w = encR(op, f3, f7, regNum(a[0]), regNum(a[1]), regNum(a[2])); break;
        case "I": {
          if (m === "jalr" && a.length === 2 && a[1].includes("(")) { const ma = memArg(a[1]); w = encI(op, f3, regNum(a[0]), ma.rs1, ma.imm); break; }
          need(3); const imm = parseImm(a[2]);
          if (!fits(imm, 12)) throw new Error(`inmediato ${imm} no cabe en 12 bits`);
          w = encI(op, f3, regNum(a[0]), regNum(a[1]), imm); break;
        }
        case "SH": { need(3); const sh = parseImm(a[2]); if (sh < 0 || sh > 31) throw new Error("desplazamiento fuera de 0..31"); w = encI(op, f3, regNum(a[0]), regNum(a[1]), (f7 << 5) | sh); break; }
        case "L": { need(2); const ma = memArg(a[1]); if (!fits(ma.imm, 12)) throw new Error("desplazamiento fuera de 12 bits"); w = encI(op, f3, regNum(a[0]), ma.rs1, ma.imm); break; }
        case "S": { need(2); const ma = memArg(a[1]); if (!fits(ma.imm, 12)) throw new Error("desplazamiento fuera de 12 bits"); w = encS(op, f3, ma.rs1, regNum(a[0]), ma.imm); break; }
        case "B": { need(3); const off = target(a[2], pc); if (off % 2 || !fits(off, 13)) throw new Error(`salto fuera de rango (${off})`); w = encB(op, f3, regNum(a[0]), regNum(a[1]), off); break; }
        case "U": { need(2); w = encU(op, regNum(a[0]), parseImm(a[1])); break; }
        case "J": { need(2); const off = target(a[1], pc); if (off % 2 || !fits(off, 21)) throw new Error(`salto fuera de rango (${off})`); w = encJ(op, regNum(a[0]), off); break; }
        case "SYS": w = m === "ebreak" ? 0x00100073 : 0x00000073; break;
        default: throw new Error("formato desconocido");
      }
      words.push({ addr: pc, word: w, src: it.src, line: it.line });
    } catch (e) { errors.push({ line: it.line, msg: e.message }); }
  });
  return { base, words, init, labels: labelAddr, errors };
}

/** Carga código máquina hexadecimal (una palabra por línea, como riscvtest.txt o objcopy -O verilog) */
export function loadHex(src, base = 0) {
  const toks = src.replace(/(#|\/\/).*$/gm, "").split(/\s+/).filter((t) => t && !t.startsWith("@"));
  const errors = [];
  const words = [];
  toks.forEach((t, i) => {
    const s = t.replace(/^0x/i, "");
    if (!/^[0-9a-f]{1,8}$/i.test(s)) { errors.push({ line: i + 1, msg: `"${t}" no es hexadecimal de 32 bits` }); return; }
    const w = parseInt(s, 16) >>> 0;
    words.push({ addr: u32(base + 4 * words.length), word: w, src: disassemble(w, u32(base + 4 * words.length)), line: i + 1 });
  });
  return { base, words, init: { regs: {}, mem: {} }, labels: {}, errors };
}

// ---------- decodificación ----------
export const sext = (v, bits) => (v << (32 - bits)) >> (32 - bits);
export function fields(w) {
  return {
    op: w & 0x7f, rd: (w >>> 7) & 0x1f, funct3: (w >>> 12) & 7, rs1: (w >>> 15) & 0x1f, rs2: (w >>> 20) & 0x1f,
    funct7: (w >>> 25) & 0x7f,
    immI: sext(w >>> 20, 12),
    immS: sext((((w >>> 25) & 0x7f) << 5) | ((w >>> 7) & 0x1f), 12),
    immB: sext((((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1), 13),
    immU: (w & 0xfffff000) | 0,
    immJ: sext((((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xff) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1), 21),
  };
}

export function mnemonicOf(w) {
  const f = fields(w);
  for (const [name, [fmt, op, f3, f7]] of Object.entries(RV32I)) {
    if (op !== f.op) continue;
    if (fmt === "U" || fmt === "J") return name;
    if (fmt === "SYS") return w === 0x00100073 ? "ebreak" : w === 0x00000073 ? "ecall" : null;
    if (f3 !== f.funct3) continue;
    if (fmt === "R" || fmt === "SH") { if ((f7 ?? 0) === f.funct7) return name; continue; }
    return name;
  }
  return null;
}

const r = (n) => `x${n}`;
export function disassemble(w, pc = 0) {
  const m = mnemonicOf(w);
  if (!m) return `.word 0x${hex(w)}`;
  const f = fields(w);
  const fmt = RV32I[m][0];
  switch (fmt) {
    case "R": return `${m} ${r(f.rd)}, ${r(f.rs1)}, ${r(f.rs2)}`;
    case "I": return m === "jalr" ? `${m} ${r(f.rd)}, ${f.immI}(${r(f.rs1)})` : `${m} ${r(f.rd)}, ${r(f.rs1)}, ${f.immI}`;
    case "SH": return `${m} ${r(f.rd)}, ${r(f.rs1)}, ${f.rs2}`;
    case "L": return `${m} ${r(f.rd)}, ${f.immI}(${r(f.rs1)})`;
    case "S": return `${m} ${r(f.rs2)}, ${f.immS}(${r(f.rs1)})`;
    case "B": return `${m} ${r(f.rs1)}, ${r(f.rs2)}, 0x${hex(u32(pc + f.immB))}`;
    case "U": return `${m} ${r(f.rd)}, 0x${((w >>> 12) & 0xfffff).toString(16)}`;
    case "J": return `${m} ${r(f.rd)}, 0x${hex(u32(pc + f.immJ))}`;
    default: return m;
  }
}

export const hex = (v, n = 8) => (v >>> 0).toString(16).toUpperCase().padStart(n, "0");
export const typeOf = (w) => { const m = mnemonicOf(w); if (!m) return "?"; const f = RV32I[m][0]; return { L: "I", SH: "I", SYS: "I" }[f] || f; };
