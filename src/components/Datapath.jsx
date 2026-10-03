// Datapath.jsx — Ruta de datos single-cycle (misma geometría que las diapositivas)
import React from "react";

// cables: id -> puntos
export const WIRES = {
  pcnext: [[52, 240], [80, 240]],
  pc_im: [[130, 240], [165, 240]],
  pc_add4: [[150, 240], [150, 395], [180, 395]],
  pc_tgt: [[150, 395], [150, 500], [600, 500]],
  instr: [[300, 240], [330, 240]],
  bus: [[330, 60], [330, 420]],
  op: [[330, 60], [480, 60]],
  rs1: [[330, 195], [380, 195]],
  rs2: [[330, 230], [380, 230]],
  rd: [[330, 265], [380, 265]],
  immin: [[330, 420], [400, 420]],
  srca: [[520, 205], [640, 205]],
  rd2: [[520, 290], [560, 290]],
  rd2_mux: [[560, 290], [580, 290]],
  wdata: [[560, 290], [560, 370], [725, 370], [725, 320], [760, 320]],
  immext: [[500, 420], [570, 420]],
  imm_mux: [[570, 420], [570, 330], [580, 330]],
  imm_tgt: [[570, 420], [570, 470], [600, 470]],
  srcb: [[602, 310], [640, 310]],
  alures: [[700, 260], [760, 260]],
  alu_res: [[745, 260], [745, 180], [935, 180], [935, 230], [950, 230]],
  rdata: [[880, 260], [950, 260]],
  result: [[972, 265], [1000, 265], [1000, 455], [360, 455], [360, 330], [380, 330]],
  plus4: [[230, 410], [255, 410]],
  plus4_mux: [[255, 410], [255, 600], [15, 600], [15, 220], [30, 220]],
  plus4_res: [[255, 600], [940, 600], [940, 295], [950, 295]],
  target: [[650, 485], [680, 485], [680, 580], [8, 580], [8, 260], [30, 260]],
  four: [[165, 425], [180, 425]],
};
const THIN = new Set(["bus", "rs1", "rs2", "rd", "op", "four"]);

// a qué señal corresponde cada cable (para enlazar con las fichas de valores)
export const WIRE_SIGNAL = {
  pcnext: "PCNext", pc_im: "PC", pc_add4: "PC", pc_tgt: "PC", instr: "Instr", bus: "Instr",
  srca: "SrcA", srcb: "SrcB", rd2: "WriteData", rd2_mux: "WriteData", wdata: "WriteData",
  immext: "ImmExt", imm_mux: "ImmExt", imm_tgt: "ImmExt", alures: "ALUResult", alu_res: "ALUResult",
  rdata: "ReadData", result: "Result", plus4: "PCPlus4", plus4_mux: "PCPlus4", plus4_res: "PCPlus4",
  target: "PCTarget",
};

const DOTS = {
  j0: [150, 240, "pc_add4"], j0b: [150, 395, "pc_tgt"], j1: [560, 290, "wdata"],
  j3: [570, 420, "imm_tgt"], j2: [745, 260, "alu_res"], j4: [255, 410, "plus4_mux"], j5: [255, 600, "plus4_res"],
};

const mux = (x, y, w, h) => `M${x},${y} L${x + w},${y + 10} L${x + w},${y + h - 10} L${x},${y + h} Z`;
const aluPath = (x, y, w, h) => {
  const n = y + h / 2;
  return `M${x},${y} L${x + w},${y + h * 0.28} L${x + w},${y + h * 0.72} L${x},${y + h} L${x},${n + 18} L${x + 14},${n} L${x},${n - 18} Z`;
};

const BLOCKS = {
  pcmux: { d: mux(30, 200, 22, 80) },
  pc: { r: [80, 210, 50, 60], label: ["PC"], fs: 20 },
  im: { r: [165, 170, 135, 140], label: ["Memoria de", "instrucciones"], fs: 15 },
  add4: { r: [180, 380, 50, 60], label: ["+"], fs: 30 },
  rf: { r: [380, 175, 140, 170], label: ["Banco de", "registros"], fs: 17 },
  ext: { r: [400, 395, 100, 50], label: ["Extend"], fs: 17 },
  srcbmux: { d: mux(580, 270, 22, 80) },
  alu: { d: aluPath(640, 180, 60, 160), label: ["ALU"], at: [672, 262], fs: 17 },
  dm: { r: [760, 215, 120, 130], label: ["Memoria", "de datos"], fs: 17 },
  resmux: { d: mux(950, 210, 22, 110) },
  addt: { r: [600, 455, 50, 60], label: ["+"], fs: 30 },
  cu: { r: [480, 20, 150, 95], label: ["Unidad de", "control"], fs: 17, ctrl: true },
};

const LABELS = [
  [302, 232, "Instr", "start", "sig", "instr"],
  [338, 189, "19:15", "start", "bits", "rs1"], [338, 224, "24:20", "start", "bits", "rs2"],
  [338, 259, "11:7", "start", "bits", "rd"], [338, 414, "31:7", "start", "bits", "immin"],
  [338, 52, "op, funct3, funct7₅", "start", "bits", "op"],
  [386, 199, "A1", "start", "port"], [386, 234, "A2", "start", "port"], [386, 269, "A3", "start", "port"], [386, 334, "WD3", "start", "port"],
  [514, 209, "RD1", "end", "port"], [514, 294, "RD2", "end", "port"],
  [170, 258, "A", "start", "port"], [295, 258, "RD", "end", "port"],
  [766, 264, "A", "start", "port"], [766, 324, "WD", "start", "port"], [874, 264, "RD", "end", "port"],
  [606, 200, "SrcA", "middle", "sig", "srca"], [622, 304, "SrcB", "middle", "sig", "srcb"],
  [540, 414, "ImmExt", "middle", "sig", "immext"], [840, 172, "ALUResult", "middle", "sig", "alu_res"],
  [905, 254, "ReadData", "middle", "sig", "rdata"], [655, 364, "WriteData", "middle", "sig", "wdata"],
  [1004, 380, "Result", "start", "sig", "result"], [258, 404, "PCPlus4", "start", "sig", "plus4"],
  [690, 479, "PCTarget", "start", "sig", "target"], [160, 429, "4", "end", "sig", "four"],
  [584, 288, "0", "start", "port"], [584, 334, "1", "start", "port"],
  [34, 224, "0", "start", "port"], [34, 264, "1", "start", "port"],
  [953, 234, "00", "start", "port"], [953, 264, "01", "start", "port"], [953, 299, "10", "start", "port"],
  [690, 236, "Zero", "end", "port"],
];

// señales de control: [nombre, x1,y1,x2,y2, xEtiqueta, yEtiqueta]
const CTRL = [
  ["RegWrite", 450, 175, 450, 160, 450, 154],
  ["ImmSrc", 450, 395, 450, 380, 450, 374],
  ["ALUSrc", 591, 273, 591, 258, 591, 252],
  ["ALUControl", 670, 189, 670, 165, 670, 159],
  ["MemWrite", 820, 345, 820, 360, 820, 376],
  ["ResultSrc", 961, 211, 961, 196, 975, 190],
  ["PCSrc", 41, 279, 41, 292, 41, 306],
];
const CTRL_BITS = { ImmSrc: 2, ResultSrc: 2, ALUControl: 3 };
export function fmtCtrl(name, v) {
  if (v === null || v === undefined) return "x";
  const b = CTRL_BITS[name];
  return b ? v.toString(2).padStart(b, "0") : String(v);
}

const pts = (p) => p.map((q) => q.join(",")).join(" ");

export default function Datapath({ active, ctrl, hoverSignal, onHoverSignal }) {
  const order = Object.keys(WIRES).sort((a, b) => (active.has(a) ? 1 : 0) - (active.has(b) ? 1 : 0));
  return (
    <svg className="dp" viewBox="0 0 1040 625" role="img" aria-label="Ruta de datos del procesador RISC-V single-cycle">
      {order.map((id) => {
        const on = active.has(id);
        const sigName = WIRE_SIGNAL[id];
        const hot = sigName && hoverSignal === sigName;
        const cls = `wire${on ? " on" : ""}${THIN.has(id) ? " thin" : ""}${hot ? " hot" : ""}`;
        return (
          <g key={id}>
            <polyline points={pts(WIRES[id])} className={cls} />
            {sigName && (
              <polyline points={pts(WIRES[id])} className="wire-hit"
                onMouseEnter={() => onHoverSignal(sigName)} onMouseLeave={() => onHoverSignal(null)}>
                <title>{sigName}</title>
              </polyline>
            )}
          </g>
        );
      })}
      {Object.entries(DOTS).map(([k, [x, y, owner]]) => (
        <circle key={k} cx={x} cy={y} r="4.5" className={`dot${active.has(owner) ? " on" : ""}`} />
      ))}
      {Object.entries(BLOCKS).map(([id, b]) => {
        const on = active.has(id);
        const cls = `block${on ? " on" : ""}${b.ctrl ? " ctrl" : ""}`;
        let cx, cy;
        if (b.r) { cx = b.r[0] + b.r[2] / 2; cy = b.r[1] + b.r[3] / 2; } else if (b.at) { [cx, cy] = b.at; }
        return (
          <g key={id}>
            {b.r ? <rect x={b.r[0]} y={b.r[1]} width={b.r[2]} height={b.r[3]} rx="6" className={cls} />
              : <path d={b.d} className={cls} />}
            {b.label && b.label.map((ln, i) => (
              <text key={i} x={cx} y={cy + (i - (b.label.length - 1) / 2) * 20 + b.fs * 0.35}
                className={`blabel${b.ctrl ? " ctrl" : ""}`} style={{ fontSize: b.fs }}>{ln}</text>
            ))}
            {id === "pc" && <path d="M98,270 L105,261 L112,270" className="clk" />}
          </g>
        );
      })}
      {LABELS.map(([x, y, t, anc, kind, owner], i) => {
        if (kind === "port") return <text key={i} x={x} y={y} textAnchor={anc} className="port">{t}</text>;
        const on = owner && active.has(owner);
        return <text key={i} x={x} y={y} textAnchor={anc} className={`slabel ${kind}${on ? " on" : ""}`}>{t}</text>;
      })}
      {CTRL.map(([n, x1, y1, x2, y2, lx, ly]) => {
        const v = ctrl ? ctrl[n] : undefined;
        const on = v !== undefined && v !== null && !(n === "MemWrite" && v === 0 && false);
        return (
          <g key={n}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className={`cstub${on ? " on" : ""}`} />
            <text x={lx} y={ly} textAnchor="middle" className={`clabel${on ? " on" : ""}`}>
              {n}{ctrl ? ` = ${fmtCtrl(n, v)}` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
