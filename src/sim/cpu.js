// cpu.js — Modelo del procesador single-cycle del libro (Harris & Harris, sección 7.3)
// Cada paso calcula TODAS las señales de la ruta de datos tal como lo haría el hardware
// (Main Decoder, ALU Decoder, Extend, ALU, multiplexores) y luego actualiza el estado
// en el "flanco de reloj".
import { fields, mnemonicOf, SUPPORTED, hex, disassemble } from "./isa.js";

const u32 = (v) => v >>> 0;

// Main Decoder (Tabla 7.6). x = no importa -> null
const MAIN = {
  0b0000011: { RegWrite: 1, ImmSrc: 0b00, ALUSrc: 1, MemWrite: 0, ResultSrc: 0b01, Branch: 0, ALUOp: 0b00, Jump: 0 }, // lw
  0b0100011: { RegWrite: 0, ImmSrc: 0b01, ALUSrc: 1, MemWrite: 1, ResultSrc: null, Branch: 0, ALUOp: 0b00, Jump: 0 }, // sw
  0b0110011: { RegWrite: 1, ImmSrc: null, ALUSrc: 0, MemWrite: 0, ResultSrc: 0b00, Branch: 0, ALUOp: 0b10, Jump: 0 }, // R
  0b1100011: { RegWrite: 0, ImmSrc: 0b10, ALUSrc: 0, MemWrite: 0, ResultSrc: null, Branch: 1, ALUOp: 0b01, Jump: 0 }, // beq
  0b0010011: { RegWrite: 1, ImmSrc: 0b00, ALUSrc: 1, MemWrite: 0, ResultSrc: 0b00, Branch: 0, ALUOp: 0b10, Jump: 0 }, // I-ALU
  0b1101111: { RegWrite: 1, ImmSrc: 0b11, ALUSrc: null, MemWrite: 0, ResultSrc: 0b10, Branch: 0, ALUOp: null, Jump: 1 }, // jal
};

// ALU Decoder (Tabla 7.3)
export function aluDecoder(ALUOp, funct3, op5, funct7b5) {
  if (ALUOp === null) return null;
  if (ALUOp === 0b00) return 0b000;
  if (ALUOp === 0b01) return 0b001;
  switch (funct3) {
    case 0b000: return op5 && funct7b5 ? 0b001 : 0b000;
    case 0b010: return 0b101;
    case 0b110: return 0b011;
    case 0b111: return 0b010;
    default: return null;
  }
}

export function extend(w, ImmSrc) {
  const f = fields(w);
  switch (ImmSrc) {
    case 0b00: return f.immI;
    case 0b01: return f.immS;
    case 0b10: return f.immB;
    case 0b11: return f.immJ;
    default: return null;
  }
}

export function alu(a, b, ctl) {
  switch (ctl) {
    case 0b000: return u32(a + b);
    case 0b001: return u32(a - b);
    case 0b010: return u32(a & b);
    case 0b011: return u32(a | b);
    case 0b101: return (a | 0) < (b | 0) ? 1 : 0;
    default: return null;
  }
}

export const ALU_NAME = { 0b000: "suma", 0b001: "resta", 0b010: "AND", 0b011: "OR", 0b101: "slt" };

export function initialState(program) {
  const regs = new Array(32).fill(0);
  for (const k in program.init.regs) regs[k] = program.init.regs[k];
  regs[0] = 0;
  const mem = {};
  for (const k in program.init.mem) mem[u32(k) & ~3] = program.init.mem[k];
  return { pc: program.base, regs, mem, cycle: 0, halted: false, message: "" };
}

export function fetch(program, pc) {
  const i = (pc - program.base) / 4;
  if (i < 0 || i >= program.words.length || !Number.isInteger(i)) return null;
  return program.words[i].word;
}

/** Calcula las señales del ciclo actual sin modificar el estado. */
export function evaluate(program, st) {
  const Instr = fetch(program, st.pc);
  if (Instr === null) return { error: `No hay instrucción en PC = 0x${hex(st.pc)} (fin del programa)` };
  const f = fields(Instr);
  const mnem = mnemonicOf(Instr);
  const supported = mnem !== null && SUPPORTED.has(mnem);
  const ctrl = MAIN[f.op];
  if (!supported || !ctrl) {
    return { Instr, f, mnem, error: `${mnem ?? "instrucción desconocida"} (0x${hex(Instr)}) no está implementada en este procesador single-cycle` };
  }
  const ALUControl = aluDecoder(ctrl.ALUOp, f.funct3, (f.op >> 5) & 1, (f.funct7 >> 5) & 1);
  const RD1 = st.regs[f.rs1], RD2 = st.regs[f.rs2];
  const ImmExt = extend(Instr, ctrl.ImmSrc);
  const SrcA = RD1;
  const WriteData = RD2;
  const SrcB = ctrl.ALUSrc === null ? null : ctrl.ALUSrc ? u32(ImmExt) : RD2;
  const ALUResult = ALUControl === null || SrcB === null ? null : alu(SrcA, SrcB, ALUControl);
  const Zero = ALUResult === null ? null : ALUResult === 0 ? 1 : 0;
  const ReadData = ALUResult === null ? null : (st.mem[ALUResult & ~3] ?? 0);
  const PCPlus4 = u32(st.pc + 4);
  const PCTarget = ImmExt === null ? null : u32(st.pc + ImmExt);
  const PCSrc = (ctrl.Branch & (Zero ?? 0)) | ctrl.Jump;
  const PCNext = PCSrc ? PCTarget : PCPlus4;
  const Result = ctrl.ResultSrc === 0b00 ? ALUResult : ctrl.ResultSrc === 0b01 ? ReadData : ctrl.ResultSrc === 0b10 ? PCPlus4 : null;
  return {
    Instr, f, mnem, asm: disassemble(Instr, st.pc),
    ctrl: { ...ctrl, ALUControl, PCSrc },
    RD1, RD2, ImmExt, SrcA, SrcB, WriteData, ALUResult, Zero, ReadData,
    PCPlus4, PCTarget, PCNext, Result,
  };
}

/** Avanza un ciclo: aplica las escrituras del flanco de subida. */
export function step(program, st) {
  const sig = evaluate(program, st);
  if (sig.error) return { state: { ...st, halted: true, message: sig.error }, sig };
  const regs = st.regs.slice();
  const mem = { ...st.mem };
  const writes = [];
  if (sig.ctrl.RegWrite && sig.f.rd !== 0) { regs[sig.f.rd] = sig.Result; writes.push({ kind: "reg", idx: sig.f.rd, value: sig.Result }); }
  if (sig.ctrl.MemWrite) { mem[sig.ALUResult & ~3] = sig.WriteData; writes.push({ kind: "mem", addr: sig.ALUResult & ~3, value: sig.WriteData }); }
  const selfLoop = sig.PCNext === st.pc;
  return {
    state: { pc: sig.PCNext, regs, mem, cycle: st.cycle + 1, halted: false, message: selfLoop ? "Lazo infinito: el programa terminó (salta a sí mismo)." : "" },
    sig, writes, selfLoop,
  };
}

/** Qué cables y bloques del diagrama están activos para estas señales. */
export function activeElements(sig) {
  const A = new Set(["pc", "pc_im", "im", "instr", "bus", "cu", "op", "pcnext", "pcmux", "j0", "pc_add4", "add4", "four", "plus4"]);
  if (!sig || sig.error) return A;
  const c = sig.ctrl;
  const op = sig.f.op;
  const usesRs1 = op !== 0b1101111;
  const usesRs2 = op === 0b0110011 || op === 0b0100011 || op === 0b1100011;
  if (usesRs1) ["rs1", "rf", "srca", "alu", "srcb", "alures"].forEach((e) => A.add(e));
  if (usesRs2) { A.add("rs2"); A.add("rf"); A.add("rd2"); }
  if (c.ImmSrc !== null) ["immin", "ext", "immext"].forEach((e) => A.add(e));
  if (c.ALUSrc === 1) { A.add("imm_mux"); A.add("srcbmux"); A.add("j3"); }
  if (c.ALUSrc === 0 && usesRs2) { A.add("rd2_mux"); A.add("srcbmux"); }
  if (c.MemWrite) { A.add("wdata"); A.add("dm"); A.add("j1"); }
  if (c.ResultSrc === 0b01) { A.add("dm"); A.add("rdata"); }
  if (c.ResultSrc === 0b00 && c.RegWrite) { A.add("alu_res"); A.add("j2"); }
  if (c.ResultSrc === 0b10) { A.add("plus4_res"); A.add("j5"); A.add("j4"); }
  if (c.RegWrite) { ["resmux", "result", "rd", "rf"].forEach((e) => A.add(e)); }
  if (c.Branch || c.Jump) { ["imm_tgt", "j3", "addt", "pc_tgt", "j0b"].forEach((e) => A.add(e)); }
  if (c.PCSrc) A.add("target"); else { A.add("plus4_mux"); A.add("j4"); }
  return A;
}

/** Explicación en español de lo que hace la instrucción en este ciclo. */
export function explain(sig, st) {
  if (!sig || sig.error) return [];
  const h = (v) => (v === null || v === undefined ? "—" : `0x${hex(v)}`);
  const d = (v) => (v | 0).toString();
  const f = sig.f, c = sig.ctrl;
  const out = [`Fetch: la memoria de instrucciones entrega Instr = ${h(sig.Instr)} (${sig.asm}).`];
  const op = f.op;
  if (op !== 0b1101111) out.push(`Banco de registros: rs1 = x${f.rs1} → SrcA = ${h(sig.SrcA)} (${d(sig.SrcA)}).`);
  if (op === 0b0110011 || op === 0b0100011 || op === 0b1100011) out.push(`rs2 = x${f.rs2} → RD2 = ${h(sig.RD2)} (${d(sig.RD2)}).`);
  if (c.ImmSrc !== null) out.push(`Extend (ImmSrc = ${c.ImmSrc.toString(2).padStart(2, "0")}): ImmExt = ${h(sig.ImmExt)} (${d(sig.ImmExt)}).`);
  if (c.ALUControl !== null) out.push(`ALU (${ALU_NAME[c.ALUControl]}, ALUControl = ${c.ALUControl.toString(2).padStart(3, "0")}): ${h(sig.SrcA)} y ${h(sig.SrcB)} → ALUResult = ${h(sig.ALUResult)}, Zero = ${sig.Zero}.`);
  if (c.MemWrite) out.push(`Memoria de datos: en el flanco, Mem[${h(sig.ALUResult)}] ← ${h(sig.WriteData)} (${d(sig.WriteData)}).`);
  if (c.ResultSrc === 0b01) out.push(`Memoria de datos: ReadData = Mem[${h(sig.ALUResult)}] = ${h(sig.ReadData)} (${d(sig.ReadData)}).`);
  if (c.RegWrite) out.push(`Writeback: ${f.rd === 0 ? "x0 descarta la escritura" : `en el flanco, x${f.rd} ← ${h(sig.Result)} (${d(sig.Result)})`}.`);
  if (c.Branch) out.push(`beq: Zero = ${sig.Zero} → ${sig.Zero ? `salta a PCTarget = ${h(sig.PCTarget)}` : "no salta"}.`);
  if (c.Jump) out.push(`jal: salta a PCTarget = ${h(sig.PCTarget)}.`);
  out.push(`Siguiente PC = ${h(sig.PCNext)} (PCSrc = ${c.PCSrc}).`);
  return out;
}
