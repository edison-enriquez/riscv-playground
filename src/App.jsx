import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Datapath from "./components/Datapath.jsx";
import InstrAnatomy from "./components/InstrAnatomy.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import ZoomPane from "./components/ZoomPane.jsx";
import { assemble, loadHex, hex, ABI, typeOf, mnemonicOf, SUPPORTED } from "./sim/isa.js";
import { initialState, evaluate, step, activeElements, explain, ALU_NAME } from "./sim/cpu.js";
import { compileC } from "./sim/minic.js";
import { compileWithGCC } from "./sim/godbolt.js";
import { svgToString, downloadText } from "./sim/svgExport.js";
import { EXAMPLES } from "./programs/examples.js";
import { C_EXAMPLES } from "./programs/cExamples.js";

const CTRL_ORDER = ["RegWrite", "ImmSrc", "ALUSrc", "MemWrite", "ResultSrc", "Branch", "ALUOp", "Jump", "ALUControl", "PCSrc"];
const CTRL_FMT = { ImmSrc: 2, ResultSrc: 2, ALUOp: 2, ALUControl: 3 };
const SIGNALS = ["PC", "Instr", "SrcA", "SrcB", "ImmExt", "ALUResult", "ReadData", "WriteData", "Result", "PCPlus4", "PCTarget", "PCNext"];
const SPEEDS = [1200, 700, 350, 120];
const FILES = [
  { id: "c", name: "main.c", lang: "C", icon: "C" },
  { id: "asm", name: "programa.s", lang: "RISC-V", icon: "S" },
  { id: "hex", name: "programa.hex", lang: "Hex", icon: "H" },
];

const fmtVal = (v, mode) => (v === null || v === undefined ? "x" : mode === "dec" ? String(v | 0) : "0x" + hex(v));
function load(key, fallback) { try { const v = localStorage.getItem(key); return v ?? fallback; } catch { return fallback; } }
function save(key, v) { try { localStorage.setItem(key, v); } catch { /* sin almacenamiento */ } }
function loadJSON(key, fallback) { try { return { ...fallback, ...JSON.parse(load(key, "{}")) }; } catch { return fallback; } }
const toHexText = (prog) => prog.words.map((w) => hex(w.word)).join("\n") + "\n";
const now = () => new Date().toLocaleTimeString("es-CO", { hour12: false });

// mapa línea de ensamblador -> línea de C, a partir de los comentarios "# C n:" del compilador didáctico
function cLineMap(asm) {
  const map = {};
  let cur = 0;
  asm.split("\n").forEach((ln, i) => { const m = /^\s*# C (\d+):/.exec(ln); if (m) cur = +m[1]; map[i + 1] = cur; });
  return map;
}

function Icon({ name, size = 18 }) {
  const paths = {
    files: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
    debug: <><path d="M7 4l12 8-12 8z" /><circle cx="17.5" cy="17.5" r="3.5" fill="currentColor" stroke="none" opacity="0.9" /></>,
    build: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></>,
    reset: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
    back: <path d="M15 6l-6 6 6 6" />,
    step: <><path d="M5 12h11" /><path d="M12 7l5 5-5 5" /><path d="M20 5v14" /></>,
    play: <path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" />,
    pause: <path d="M8 5v14M16 5v14" strokeWidth="3" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    side: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 14h18" /></>,
    code: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
    download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    run: <path d="M7 5l12 7-12 7z" />,
    open: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    error: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
    warn: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
    chip: <><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  };
  return (
    <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  );
}

function Sash({ dir, onDrag }) {
  const down = (e) => {
    e.preventDefault();
    let last = dir === "v" ? e.clientX : e.clientY;
    const move = (ev) => { const p = dir === "v" ? ev.clientX : ev.clientY; onDrag(p - last); last = p; };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.classList.remove(`dragging-${dir}`); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.classList.add(`dragging-${dir}`);
  };
  return <div className={`sash ${dir}`} onPointerDown={down} role="separator" aria-orientation={dir === "v" ? "vertical" : "horizontal"} />;
}

function Section({ id, title, open, onToggle, actions, children }) {
  return (
    <section className={`vsec${open ? " open" : ""}`}>
      <div className="vsec-head">
        <button className="vsec-title" aria-expanded={open} onClick={() => onToggle(id)}>
          <span className="chev"><Icon name="chevron" size={14} /></span>{title}
        </button>
        {open && actions && <div className="vsec-actions">{actions}</div>}
      </div>
      {open && <div className="vsec-body">{children}</div>}
    </section>
  );
}

export default function App() {
  // ---------- fuentes ----------
  const initialAsm = load("rv-src", EXAMPLES[0].src);
  const [source, setSource] = useState(initialAsm);
  const [cSource, setCSource] = useState(() => load("rv-csrc", C_EXAMPLES[0].src));
  const [hexSource, setHexSource] = useState(() => toHexText(assemble(initialAsm)));
  const [hexBase, setHexBase] = useState(() => "0x" + (assemble(initialAsm).base >>> 0).toString(16));
  const [origin, setOrigin] = useState("asm"); // de dónde salió el programa cargado: asm | c | gcc | hex
  const [cMap, setCMap] = useState(null);
  const [cErrors, setCErrors] = useState([]);
  const [built, setBuilt] = useState(() => ({ c: load("rv-csrc", C_EXAMPLES[0].src), asm: initialAsm, hex: toHexText(assemble(initialAsm)) }));
  const [gccLang, setGccLang] = useState("c");
  const [gccOpt, setGccOpt] = useState("-O1");
  const [gccBusy, setGccBusy] = useState(false);
  const [log, setLog] = useState(() => [{ t: now(), kind: "info", text: "Listo. Ctrl+Enter compila o ensambla el archivo abierto; F10 avanza un ciclo; F5 ejecuta o pausa." }]);
  const addLog = (kind, text) => setLog((l) => [...l.slice(-200), { t: now(), kind, text }]);

  // ---------- simulación ----------
  const [program, setProgram] = useState(() => assemble(initialAsm));
  const [history, setHistory] = useState(() => [{ state: initialState(assemble(initialAsm)), writes: [] }]);
  const [running, setRunning] = useState(false);
  const [runFrom, setRunFrom] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [numMode, setNumMode] = useState("hex");
  const [hoverSignal, setHoverSignal] = useState(null);
  const [selAddr, setSelAddr] = useState(null);
  const [breakpoints, setBreakpoints] = useState(() => new Set());

  // ---------- interfaz ----------
  const [layout, setLayout] = useState(() => loadJSON("rv-layout", { sidebar: true, panel: true, code: true, side: 300, codeW: 460, panelH: 270 }));
  const [view, setView] = useState(() => load("rv-view", "sim"));
  const [tab, setTab] = useState(() => load("rv-tab2", "c"));
  const [openTabs, setOpenTabs] = useState(() => {
    try { const t = JSON.parse(load("rv-open", "[]")); if (Array.isArray(t) && t.length) return t.filter((x) => FILES.some((f) => f.id === x)); } catch { /* nada */ }
    return ["c", "asm"];
  });
  const [panelTab, setPanelTab] = useState(() => load("rv-ptab", "formato"));
  const [secs, setSecs] = useState(() => loadJSON("rv-secs", { regs: true, imem: true, dmem: true, prog: true, cex: true, aex: true, mini: true, gcc: true }));
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const editors = { c: useRef(null), asm: useRef(null), hex: useRef(null) };
  const dpRef = useRef(null);
  const tabsRef = useRef(null);
  const imemRef = useRef(null);

  useEffect(() => { save("rv-layout", JSON.stringify(layout)); }, [layout]);
  useEffect(() => { save("rv-view", view); }, [view]);
  useEffect(() => { save("rv-tab2", tab); }, [tab]);
  useEffect(() => { save("rv-ptab", panelTab); }, [panelTab]);
  useEffect(() => { save("rv-secs", JSON.stringify(secs)); }, [secs]);
  const toggleSec = (k) => setSecs((s) => ({ ...s, [k]: !s[k] }));
  useEffect(() => { save("rv-open", JSON.stringify(openTabs)); }, [openTabs]);
  // abrir una pestaña (como VS Code): si no está abierta se agrega; focus=false la abre sin cambiar la activa
  const openTab = (id, focus = true) => {
    setOpenTabs((t) => (t.includes(id) ? t : [...t, id]));
    if (focus) { setTab(id); setLayout((l) => ({ ...l, code: true })); }
  };
  const closeTab = (id) => {
    const i = openTabs.indexOf(id);
    const next = openTabs.filter((x) => x !== id);
    setOpenTabs(next);
    if (id === tab && next.length) setTab(next[Math.min(i, next.length - 1)]);
  };

  const setL = (patch) => setLayout((l) => ({ ...l, ...(typeof patch === "function" ? patch(l) : patch) }));
  const flash = (text) => { setToast(text); setTimeout(() => setToast(null), 2600); };

  const cur = history[history.length - 1];
  const st = cur.state;
  const sig = useMemo(() => (st.halted ? null : evaluate(program, st)), [program, st]);
  const active = useMemo(() => activeElements(sig), [sig]);
  const lines = useMemo(() => explain(sig, st), [sig, st]);
  const prevRegs = history.length > 1 ? history[history.length - 2].state.regs : null;
  const okSig = sig && !sig.error;
  const finished = st.halted || cur.selfLoop;

  // ---------- carga de programas ----------
  const loadProgram = useCallback((prog, from, hexText) => {
    setProgram(prog);
    setHistory([{ state: initialState(prog), writes: [] }]);
    setRunning(false);
    setSelAddr(null);
    setOrigin(from);
    if (!prog.errors?.length) {
      const h = hexText ?? toHexText(prog);
      setHexSource(h);
      setBuilt((b) => ({ ...b, hex: h }));
      setHexBase("0x" + (prog.base >>> 0).toString(16));
    }
  }, []);

  const reportProgram = (prog, what) => {
    if (prog.errors.length) { addLog("err", `${what}: ${prog.errors.length} error(es). Vea PROBLEMAS.`); setPanelTab("problemas"); return; }
    const bad = [...new Set(prog.words.map((w) => mnemonicOf(w.word) ?? "?").filter((m) => !SUPPORTED.has(m)))];
    addLog(bad.length ? "warn" : "ok", `${what}: ${prog.words.length} instrucciones desde 0x${hex(prog.base)}.` + (bad.length ? ` No implementadas: ${bad.join(", ")}.` : ""));
  };

  const assembleText = (text, from = "asm", what = "Ensamblado programa.s") => {
    save("rv-src", text);
    const prog = assemble(text);
    setBuilt((b) => ({ ...b, asm: text }));
    loadProgram(prog, from);
    reportProgram(prog, what);
    return prog;
  };
  const doAssemble = () => { setCMap(null); assembleText(source); };
  const doLoadHex = () => {
    const base = parseInt(hexBase, hexBase.toLowerCase().startsWith("0x") ? 16 : 10) >>> 0;
    const prog = loadHex(hexSource, isNaN(base) ? 0 : base);
    setCMap(null);
    loadProgram(prog, "hex", hexSource);
    reportProgram(prog, "Cargado programa.hex");
  };
  const doCompileMini = () => {
    save("rv-csrc", cSource);
    addLog("info", "Compilando main.c con el compilador didáctico (solo las 13 instrucciones del libro)…");
    const r = compileC(cSource);
    setCErrors(r.errors);
    if (r.errors.length) { addLog("err", `main.c: ${r.errors[0].msg} (línea ${r.errors[0].line}).`); setPanelTab("problemas"); return; }
    setSource(r.asm);
    setCMap(cLineMap(r.asm));
    setBuilt((b) => ({ ...b, c: cSource }));
    openTab("asm", false);
    assembleText(r.asm, "c", "Compilado main.c → programa.s → programa.hex");
  };
  const doCompileGCC = async () => {
    save("rv-csrc", cSource);
    setGccBusy(true);
    addLog("info", `Compilando main.c con GCC (${gccLang === "cpp" ? "C++" : "C"}, ${gccOpt}) en Compiler Explorer…`);
    try {
      const r = await compileWithGCC(cSource, gccLang, gccOpt);
      setCErrors([]);
      setSource(r.asm);
      setCMap(null);
      setBuilt((b) => ({ ...b, c: cSource }));
      openTab("asm", false);
      if (r.warnings) addLog("warn", r.warnings);
      assembleText(r.asm, "gcc", "GCC generó programa.s");
    } catch (e) {
      addLog("err", e.message);
      setPanelTab("salida");
    } finally {
      setGccBusy(false);
    }
  };
  const runFile = { c: doCompileMini, asm: doAssemble, hex: doLoadHex };

  const openExample = (kind, ex) => {
    if (kind === "c") { setCSource(ex.src); setCErrors([]); openTab("c"); addLog("info", `Abierto ejemplo en C: ${ex.name}.`); }
    else { setSource(ex.src); openTab("asm"); setCMap(null); assembleText(ex.src, "asm", `Ensamblado ejemplo «${ex.name}»`); }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      if (/\.(c|cc|cpp|h|hpp)$/i.test(file.name)) { setCSource(text); openTab("c"); addLog("info", `Abierto ${file.name} en main.c.`); return; }
      const looksHex = text.replace(/(#|\/\/).*$/gm, "").trim().split(/\s+/).every((t) => /^(0x)?[0-9a-f]{1,8}$/i.test(t) || t.startsWith("@"));
      if (looksHex) { setHexSource(text); openTab("hex"); const p = loadHex(text, 0); loadProgram(p, "hex", text); reportProgram(p, `Cargado ${file.name}`); }
      else { setSource(text); openTab("asm"); setCMap(null); assembleText(text, "asm", `Ensamblado ${file.name}`); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ---------- ejecución ----------
  const doStep = useCallback(() => {
    setHistory((h) => {
      const top = h[h.length - 1];
      if (top.state.halted || top.selfLoop) return h;
      const r = step(program, top.state);
      return [...h, { state: r.state, writes: r.writes || [], selfLoop: r.selfLoop }];
    });
  }, [program]);
  const doBack = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const doReset = () => { setRunning(false); setHistory((h) => [h[0]]); };
  const toggleRun = useCallback(() => {
    setRunning((r) => { if (!r) setRunFrom(history.length); return !r; });
  }, [history.length]);

  useEffect(() => {
    if (!running) return;
    if (finished) { setRunning(false); addLog(st.halted ? "warn" : "ok", st.message || "Programa terminado."); return; }
    if (history.length > runFrom && breakpoints.has(st.pc)) { setRunning(false); addLog("info", `Detenido en el punto de interrupción 0x${hex(st.pc)} (ciclo ${st.cycle}).`); return; }
    const t = setTimeout(doStep, SPEEDS[speed]);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, history, speed, doStep, finished]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F10") { e.preventDefault(); doStep(); return; }
      if (e.key === "F5" && e.shiftKey) { e.preventDefault(); doReset(); return; }
      if (e.key === "F5") { e.preventDefault(); toggleRun(); return; }
      if (e.target.closest(".cm-editor, textarea, input, select")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); doStep(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); doBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doStep, toggleRun]);

  // la pestaña activa siempre visible en la barra de pestañas
  useEffect(() => {
    const box = tabsRef.current;
    const el = box?.querySelector(".etab.on");
    if (!box || !el) return;
    if (el.offsetLeft < box.scrollLeft) box.scrollLeft = el.offsetLeft;
    else if (el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft + el.offsetWidth - box.clientWidth;
  }, [tab, openTabs]);

  // mantener visible la instrucción actual en la memoria de instrucciones
  useEffect(() => {
    const box = imemRef.current;
    const el = box?.querySelector(".imrow.cur");
    if (el && box) {
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 24) box.scrollTop = top - box.clientHeight / 3;
    }
  }, [st.pc, secs.imem, view]);

  // ---------- exportar diagrama ----------
  const svgName = () => `ruta-datos_${okSig ? sig.asm.split(/\s+/)[0] : "estado"}_ciclo${st.cycle}.svg`;
  const exportSvg = () => {
    const svg = dpRef.current?.querySelector("svg");
    if (!svg) return null;
    setHoverSignal(null);
    return svgToString(svg, { theme: "light" });
  };
  const doDownloadSvg = async () => {
    const text = exportSvg();
    if (!text) return;
    const name = svgName();
    // En claude.ai el visor guarda el archivo (capacidad "downloads"); en local, descarga normal del navegador.
    let downloads = null;
    try { downloads = window.claude?.use ? await window.claude.use("downloads") : null; } catch { downloads = null; }
    if (downloads) {
      try {
        await downloads.save({ filename: name, data: text });
        addLog("ok", `Diagrama guardado como ${name} (tema claro).`);
      } catch (e) {
        if (e?.code === "declined") addLog("info", "Descarga cancelada.");
        else addLog("err", `No se pudo guardar el SVG (${e?.code || "error"}). Use Copiar SVG.`);
      }
      return;
    }
    downloadText(text, name);
    addLog("ok", `Diagrama exportado como ${name} (tema claro). Si no se descargó, use Copiar SVG.`);
  };
  const doCopySvg = () => {
    const text = exportSvg();
    if (!text) return;
    const done = () => { flash("SVG copiado al portapapeles"); addLog("ok", "SVG del diagrama copiado al portapapeles: péguelo en un archivo .svg o en Inkscape."); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => addLog("err", "El navegador no permitió copiar al portapapeles."));
    else addLog("err", "El navegador no permitió copiar al portapapeles.");
  };

  // ---------- datos derivados ----------
  const unsupported = program.words.filter((w) => !SUPPORTED.has(mnemonicOf(w.word) ?? "?"));
  const memEntries = Object.entries(st.mem).map(([a, v]) => [Number(a), v]).sort((a, b) => a[0] - b[0]);
  const lastWrite = cur.writes || [];
  const readRegs = okSig ? new Set([sig.f.rs1, ...(sig.f.op === 0b0110011 || sig.f.op === 0b0100011 || sig.f.op === 0b1100011 ? [sig.f.rs2] : [])]) : new Set();
  const destReg = okSig && sig.ctrl.RegWrite ? sig.f.rd : null;
  const sigVals = okSig ? { ...sig, PC: st.pc } : { PC: st.pc };
  const sigActive = {
    PC: true, Instr: true, PCPlus4: true, PCNext: true,
    SrcA: active.has("srca"), SrcB: active.has("srcb"), ImmExt: active.has("immext"),
    ALUResult: active.has("alures"), ReadData: active.has("rdata"), WriteData: active.has("wdata"),
    Result: active.has("result"), PCTarget: active.has("target") || active.has("addt"),
  };
  const anatAddr = selAddr ?? st.pc;
  const anatWord = program.words.find((w) => w.addr === anatAddr) ?? null;
  const pcWordIdx = program.words.findIndex((w) => w.addr === st.pc);
  const pcWord = pcWordIdx >= 0 ? program.words[pcWordIdx] : null;
  const execLine = {
    asm: pcWord && origin !== "hex" ? pcWord.line : 0,
    hex: pcWord ? (origin === "hex" ? pcWord.line : pcWordIdx + 1) : 0,
    c: pcWord && origin === "c" && cMap ? cMap[pcWord.line] || 0 : 0,
  };
  const problemsFor = useMemo(() => {
    const mk = (list) => list.map((w) => ({ line: w.line, msg: `${mnemonicOf(w.word) ?? "instrucción"} no está en el procesador del libro`, severity: "warning" }));
    const errs = program.errors.map((e) => ({ ...e, severity: "error" }));
    return {
      c: cErrors.map((e) => ({ ...e, severity: "error" })),
      asm: origin !== "hex" ? [...errs, ...mk(unsupported)] : [],
      hex: origin === "hex" ? [...errs, ...mk(unsupported)] : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, cErrors, origin]);
  const problems = FILES.flatMap((f) => problemsFor[f.id].map((p) => ({ ...p, file: f })));
  const nErr = problems.filter((p) => p.severity === "error").length;
  const nWarn = problems.length - nErr;
  const curFile = FILES.find((f) => f.id === tab && openTabs.includes(f.id)) || FILES.find((f) => openTabs.includes(f.id)) || FILES[0];
  const gotoProblem = (p) => { openTab(p.file.id); setTimeout(() => editors[p.file.id].current?.gotoLine(p.line), 30); };
  const toggleBp = (addr) => setBreakpoints((b) => { const n = new Set(b); if (n.has(addr)) n.delete(addr); else n.add(addr); return n; });
  const selectInstr = (addr) => { setSelAddr(addr === st.pc ? null : addr); setPanelTab("formato"); setL({ panel: true }); };

  const showCode = layout.code && openTabs.length > 0;
  const dirty = { c: cSource !== built.c, asm: source !== built.asm, hex: hexSource !== built.hex };
  const onTabsWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; };
  const wbStyle = { "--side-w": `${layout.side}px`, "--code-w": `${layout.codeW}px`, "--panel-h": `${layout.panelH}px` };
  const runLabel = { c: "Compilar", asm: "Ensamblar", hex: "Cargar" }[curFile.id];
  const stateLabel = running ? "Ejecutando" : finished ? (st.halted ? "Detenido" : "Terminado") : history.length > 1 ? "En pausa" : "Listo";

  return (
    <div className="wb" style={wbStyle}>
      {/* ---------------- barra de título con la barra de depuración ---------------- */}
      <header className="titlebar">
        <div className="tb-brand">
          <span className="chipmark" aria-hidden="true">RV32I</span>
          <h1>Ruta de datos RISC-V</h1>
          <span className="tb-sub">single-cycle · Harris &amp; Harris 7.3</span>
        </div>
        <div className="debugbar" role="toolbar" aria-label="Controles de simulación">
          <button className={`dbg${running ? " running" : ""}`} onClick={toggleRun} disabled={finished} title={running ? "Pausa (F5)" : "Ejecutar hasta el final o un punto de interrupción (F5)"} aria-label={running ? "Pausa" : "Ejecutar"}>
            <Icon name={running ? "pause" : "play"} />
          </button>
          <button className="dbg step" onClick={doStep} disabled={finished} title="Un ciclo de reloj (F10 o →)"><Icon name="step" /><span>Paso</span></button>
          <button className="dbg" onClick={doBack} disabled={history.length < 2} title="Ciclo anterior (←)" aria-label="Ciclo anterior"><Icon name="back" /></button>
          <button className="dbg" onClick={doReset} disabled={history.length < 2} title="Reiniciar (Mayús+F5)" aria-label="Reiniciar"><Icon name="reset" /></button>
          <span className="dbg-sep" />
          <label className="dbg-speed" title="Velocidad de ejecución">
            <input type="range" min="0" max="3" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Velocidad" />
          </label>
        </div>
        <div className="tb-layout" role="group" aria-label="Diseño">
          <button className={`lay${layout.sidebar ? " on" : ""}`} aria-pressed={layout.sidebar} onClick={() => setL((l) => ({ sidebar: !l.sidebar }))} title="Mostrar u ocultar la barra lateral" aria-label="Barra lateral"><Icon name="side" /></button>
          <button className={`lay${showCode ? " on" : ""}`} aria-pressed={showCode} onClick={() => { if (!showCode) openTab(openTabs.includes(tab) ? tab : "c"); else setL({ code: false }); }} title="Mostrar u ocultar el editor de código" aria-label="Editor de código"><Icon name="code" /></button>
          <button className={`lay${layout.panel ? " on" : ""}`} aria-pressed={layout.panel} onClick={() => setL((l) => ({ panel: !l.panel }))} title="Mostrar u ocultar el panel inferior" aria-label="Panel inferior"><Icon name="panel" /></button>
        </div>
      </header>

      <div className="wb-main">
        {/* ---------------- barra de actividades ---------------- */}
        <nav className="activitybar" aria-label="Vistas">
          {[["explorer", "files", "Explorador"], ["sim", "debug", "Simulación"], ["build", "build", "Compilador"]].map(([k, ic, name]) => (
            <button key={k} className={`act${view === k && layout.sidebar ? " on" : ""}`} title={name} aria-label={name} aria-pressed={view === k && layout.sidebar}
              onClick={() => { if (view === k) setL((l) => ({ sidebar: !l.sidebar })); else { setView(k); setL({ sidebar: true }); } }}>
              <Icon name={ic} size={22} />
            </button>
          ))}
        </nav>

        {/* ---------------- barra lateral ---------------- */}
        {layout.sidebar && (
          <>
            <aside className="sidebar" aria-label="Barra lateral">
              <div className="side-title">{{ explorer: "Explorador", sim: "Simulación", build: "Compilador" }[view]}</div>

              {view === "explorer" && (
                <div className="side-scroll">
                  <Section id="opened" title="Editores abiertos" open={secs.opened !== false} onToggle={toggleSec}>
                    {openTabs.length === 0 && <p className="hint pad">Ningún archivo abierto.</p>}
                    {openTabs.map((id) => FILES.find((f) => f.id === id)).map((f) => (
                      <div key={f.id} className={`tree-row${showCode && curFile.id === f.id ? " on" : ""}`}>
                        <button className="tree-close" onClick={() => closeTab(f.id)} aria-label={`Cerrar ${f.name}`} title="Cerrar"><Icon name="close" size={13} /></button>
                        <button className="tree-item" onClick={() => openTab(f.id)}><span className={`ficon f-${f.id}`}>{f.icon}</span>{f.name}{dirty[f.id] && <span className="tdot-inline" aria-label="modificado" />}</button>
                      </div>
                    ))}
                  </Section>
                  <Section id="prog" title="Programa" open={secs.prog} onToggle={toggleSec}
                    actions={<button className="mini-btn" onClick={() => fileRef.current?.click()} title="Abrir archivo (.c, .s, .hex, .txt)" aria-label="Abrir archivo"><Icon name="open" size={15} /></button>}>
                    {FILES.map((f) => (
                      <button key={f.id} className={`tree-item${showCode && curFile.id === f.id ? " on" : ""}`} onClick={() => openTab(f.id)}>
                        <span className={`ficon f-${f.id}`}>{f.icon}</span>{f.name}
                        {problemsFor[f.id].length > 0 && <span className={`badge ${problemsFor[f.id].some((p) => p.severity === "error") ? "err" : "warn"}`}>{problemsFor[f.id].length}</span>}
                      </button>
                    ))}
                  </Section>
                  <Section id="cex" title="Ejemplos en C" open={secs.cex} onToggle={toggleSec}>
                    {C_EXAMPLES.map((e) => <button key={e.id} className="tree-item" onClick={() => openExample("c", e)}><span className="ficon f-c">C</span>{e.name}</button>)}
                  </Section>
                  <Section id="aex" title="Ejemplos en ensamblador" open={secs.aex} onToggle={toggleSec}>
                    {EXAMPLES.map((e) => <button key={e.id} className="tree-item" onClick={() => openExample("asm", e)}><span className="ficon f-asm">S</span>{e.name}</button>)}
                  </Section>
                </div>
              )}

              {view === "sim" && (
                <div className="side-scroll">
                  <Section id="regs" title="Registros" open={secs.regs} onToggle={toggleSec}
                    actions={
                      <div className="seg" role="group" aria-label="Formato numérico">
                        <button className={numMode === "hex" ? "on" : ""} aria-pressed={numMode === "hex"} onClick={() => setNumMode("hex")}>hex</button>
                        <button className={numMode === "dec" ? "on" : ""} aria-pressed={numMode === "dec"} onClick={() => setNumMode("dec")}>dec</button>
                      </div>
                    }>
                    <div className="regs">
                      {st.regs.map((v, i) => {
                        const changed = prevRegs && prevRegs[i] !== v;
                        const cls = `reg${changed ? " changed" : ""}${readRegs.has(i) ? " read" : ""}${destReg === i && i !== 0 ? " dest" : ""}`;
                        return (
                          <div key={i} className={cls} title={`x${i} (${ABI[i]})`}>
                            <span className="rn">x{i}<em>{ABI[i]}</em></span>
                            <span className="rv">{fmtVal(v, numMode)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="legend">
                      <span><i className="lg read" /> se lee</span>
                      <span><i className="lg dest" /> se escribe</span>
                      <span><i className="lg changed" /> cambió</span>
                    </div>
                  </Section>

                  <Section id="imem" title={`Memoria de instrucciones (${program.words.length})`} open={secs.imem} onToggle={toggleSec}
                    actions={breakpoints.size > 0 && <button className="mini-btn txt" onClick={() => setBreakpoints(new Set())} title="Quitar todos los puntos de interrupción">quitar ●</button>}>
                    <div className="imem" ref={imemRef} role="list">
                      {program.words.map((w) => {
                        const m = mnemonicOf(w.word);
                        const ok = SUPPORTED.has(m ?? "?");
                        const isCur = w.addr === st.pc;
                        const isSel = w.addr === anatAddr;
                        const bp = breakpoints.has(w.addr);
                        return (
                          <div key={w.addr} role="listitem" className={`imrow${isCur ? " cur" : ""}${isSel ? " sel" : ""}${ok ? "" : " bad"}`}>
                            <button className={`bp${bp ? " on" : ""}`} onClick={() => toggleBp(w.addr)} title={bp ? "Quitar punto de interrupción" : "Poner punto de interrupción"} aria-label={`Punto de interrupción en 0x${hex(w.addr)}`} aria-pressed={bp} />
                            <button className="imbody" onClick={() => selectInstr(w.addr)} title={`Tipo ${typeOf(w.word)} · clic para ver sus partes${ok ? "" : " · no implementada"}`}>
                              <span className="pcmark" aria-hidden="true">{isCur ? "▶" : ""}</span>
                              <span className="addr">{hex(w.addr, 4)}</span>
                              <span className="code">{hex(w.word)}</span>
                              <span className="asm">{w.src}</span>
                            </button>
                          </div>
                        );
                      })}
                      {program.words.length === 0 && <p className="hint pad">Sin programa cargado.</p>}
                    </div>
                  </Section>

                  <Section id="dmem" title="Memoria de datos" open={secs.dmem} onToggle={toggleSec}>
                    {memEntries.length === 0 ? <p className="hint pad">Vacía. Se llena con <code>sw</code> o con <code># init: mem[...]</code>.</p> : (
                      <div className="dmem">
                        {memEntries.map(([a, v]) => {
                          const w = lastWrite.find((x) => x.kind === "mem" && x.addr === a);
                          const r = okSig && (sig.ctrl.ResultSrc === 1 || sig.ctrl.MemWrite) && (sig.ALUResult & ~3) === a;
                          return <div key={a} className={`reg${w ? " changed" : ""}${r ? " read" : ""}`}><span className="rn">0x{hex(a)}</span><span className="rv">{fmtVal(v, numMode)}</span></div>;
                        })}
                      </div>
                    )}
                  </Section>
                </div>
              )}

              {view === "build" && (
                <div className="side-scroll">
                  <Section id="mini" title="Compilador didáctico" open={secs.mini} onToggle={toggleSec}>
                    <div className="pad col">
                      <p className="hint">Traduce <b>main.c</b> usando solo <code>lw sw add sub and or slt addi andi ori slti beq jal</code>. Admite int, arreglos, punteros, if, while, do, for, break, continue y #define. No admite llamadas, división ni <code>&gt;&gt;</code>.</p>
                      <button className="primary" onClick={() => { doCompileMini(); openTab("c"); }}>Compilar main.c</button>
                    </div>
                  </Section>
                  <Section id="gcc" title="GCC (Compiler Explorer)" open={secs.gcc} onToggle={toggleSec}>
                    <div className="pad col">
                      <div className="row">
                        <label>Lenguaje <select value={gccLang} onChange={(e) => setGccLang(e.target.value)}><option value="c">C</option><option value="cpp">C++</option></select></label>
                        <label>Optimización <select value={gccOpt} onChange={(e) => setGccOpt(e.target.value)}><option>-O0</option><option>-O1</option><option>-O2</option><option>-Os</option></select></label>
                      </div>
                      <button onClick={doCompileGCC} disabled={gccBusy}>{gccBusy ? "Compilando…" : "Compilar main.c con GCC"}</button>
                      <p className="hint">GCC real para <code>-march=rv32i</code>. Necesita Internet y la app en local (<code>npm run dev</code>). Lo que el procesador no tiene queda marcado en PROBLEMAS.</p>
                    </div>
                  </Section>
                </div>
              )}
            </aside>
            <Sash dir="v" onDrag={(d) => setL((l) => ({ side: Math.max(220, Math.min(520, l.side + d)) }))} />
          </>
        )}

        {/* ---------------- área de editores + panel ---------------- */}
        <div className="editor-area">
          <div className="editors">
            {showCode && (
              <>
                <div className="group code-group">
                  <div className="tabbar">
                    <div className="tabs" role="tablist" onWheel={onTabsWheel} ref={tabsRef}>
                      {openTabs.map((id) => FILES.find((f) => f.id === id)).map((f) => {
                        const hasErr = problemsFor[f.id].some((p) => p.severity === "error");
                        return (
                          <div key={f.id} role="tab" tabIndex={0} aria-selected={curFile.id === f.id}
                            className={`etab${curFile.id === f.id ? " on" : ""}${dirty[f.id] ? " dirty" : ""}${hasErr ? " has-err" : ""}`}
                            onClick={() => setTab(f.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab(f.id); } }}
                            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(f.id); } }}
                            title={`${f.name}${dirty[f.id] ? " · modificado desde la última compilación" : ""}`}>
                            <span className={`ficon f-${f.id}`}>{f.icon}</span>
                            <span className="tname">{f.name}</span>
                            <button className="tclose" onClick={(e) => { e.stopPropagation(); closeTab(f.id); }} aria-label={`Cerrar ${f.name}`} title="Cerrar">
                              <span className="tdot" aria-hidden="true" /><Icon name="close" size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="tab-actions">
                      {curFile.id === "hex" && (
                        <label className="basefield" title="Dirección de la primera palabra">base <input value={hexBase} onChange={(e) => setHexBase(e.target.value)} size="7" aria-label="Dirección inicial" /></label>
                      )}
                      <button className="run-btn" onClick={runFile[curFile.id]} title={`${runLabel} (Ctrl+Enter)`}><Icon name="run" size={14} />{runLabel}</button>
                      {curFile.id === "c" && <button className="mini-btn txt" onClick={doCompileGCC} disabled={gccBusy} title="Compilar con GCC en Compiler Explorer">{gccBusy ? "…" : "GCC"}</button>}
                    </div>
                  </div>
                  <div className="breadcrumb">
                    <span>programa</span><Icon name="chevron" size={12} /><span>{curFile.name}</span>
                    {curFile.id === "asm" && origin === "c" && <span className="crumb-note">generado desde main.c</span>}
                    {curFile.id === "asm" && origin === "gcc" && <span className="crumb-note">generado por GCC</span>}
                    {curFile.id === "hex" && <span className="crumb-note">una palabra por línea · $readmemh</span>}
                  </div>
                  <div className="editor-host">
                    {FILES.filter((f) => openTabs.includes(f.id)).map((f) => (
                      <div key={f.id} className="editor-pane" hidden={curFile.id !== f.id}>
                        <CodeEditor ref={editors[f.id]} language={f.id} label={f.name}
                          value={{ c: cSource, asm: source, hex: hexSource }[f.id]}
                          onChange={{ c: setCSource, asm: setSource, hex: setHexSource }[f.id]}
                          diagnostics={problemsFor[f.id]} execLine={execLine[f.id]} onRun={runFile[f.id]}
                          onCursor={(line, col) => setCursor({ line, col })} />
                      </div>
                    ))}
                  </div>
                </div>
                <Sash dir="v" onDrag={(d) => setL((l) => ({ codeW: Math.max(260, Math.min(1100, l.codeW + d)) }))} />
              </>
            )}

            <div className="group dp-group">
              <div className="tabbar">
                <div className="tabs"><span className="etab on static" role="tab" aria-selected="true"><span className="ficon f-dp"><Icon name="chip" size={13} /></span>Ruta de datos</span></div>
                <div className="tab-actions">
                  <button className="mini-btn txt" onClick={doCopySvg} title="Copiar el diagrama como SVG"><Icon name="copy" size={15} />Copiar SVG</button>
                  <button className="mini-btn txt" onClick={doDownloadSvg} title="Descargar el diagrama como SVG (tema claro)"><Icon name="download" size={15} />Descargar SVG</button>
                </div>
              </div>
              <div className="dp-scroll">
                <div className="instr-head">
                  {okSig ? (
                    <>
                      <span className="mnem">{sig.asm}</span>
                      <span className={`fmt-badge k-${typeOf(sig.Instr)}`}>tipo {typeOf(sig.Instr)}</span>
                      <span className="hexw">0x{hex(sig.Instr)} · PC 0x{hex(st.pc)}</span>
                    </>
                  ) : (
                    <span className="halt">{st.message || (sig && sig.error) || "Programa terminado"}</span>
                  )}
                  {cur.selfLoop && <span className="halt">{st.message}</span>}
                </div>
                <ZoomPane innerRef={dpRef}>
                  <Datapath active={active} ctrl={okSig ? sig.ctrl : null} hoverSignal={hoverSignal} onHoverSignal={setHoverSignal} />
                </ZoomPane>
              </div>
            </div>
          </div>

          {layout.panel && (
            <>
              <Sash dir="h" onDrag={(d) => setL((l) => ({ panelH: Math.max(120, Math.min(700, l.panelH - d)) }))} />
              <div className="panel-area">
                <div className="ptabs" role="tablist">
                  {[["formato", "Formato"], ["senales", "Señales"], ["problemas", "Problemas"], ["salida", "Salida"]].map(([k, n]) => (
                    <button key={k} role="tab" aria-selected={panelTab === k} className={`ptab${panelTab === k ? " on" : ""}`} onClick={() => setPanelTab(k)}>
                      {n}{k === "problemas" && problems.length > 0 && <span className="pcount">{problems.length}</span>}
                    </button>
                  ))}
                  <button className="mini-btn close" onClick={() => setL({ panel: false })} title="Cerrar panel" aria-label="Cerrar panel"><Icon name="close" size={15} /></button>
                </div>
                <div className="panel-body">
                  {panelTab === "formato" && (
                    <InstrAnatomy word={anatWord?.word ?? null} addr={anatAddr} isCurrent={selAddr === null || selAddr === st.pc} onFollowPC={() => setSelAddr(null)} />
                  )}
                  {panelTab === "senales" && (
                    <div className="sig-layout">
                      <div className="chips" aria-label="Valores de las señales">
                        {SIGNALS.map((n) => (
                          <div key={n} className={`chip${sigActive[n] ? " on" : ""}${hoverSignal === n ? " hot" : ""}`}
                            onMouseEnter={() => setHoverSignal(n)} onMouseLeave={() => setHoverSignal(null)}>
                            <span>{n}</span><strong>{fmtVal(sigVals[n] ?? null, numMode)}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="explain">
                        <h3>Qué pasa en este ciclo</h3>
                        <ol>{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
                      </div>
                      <div className="ctrl">
                        <h3>Señales de control</h3>
                        <table><tbody>
                          {CTRL_ORDER.map((n) => {
                            const v = okSig ? sig.ctrl[n] : undefined;
                            return (
                              <tr key={n}><th>{n}</th><td>{v === undefined ? "—" : v === null ? "x" : CTRL_FMT[n] ? v.toString(2).padStart(CTRL_FMT[n], "0") : v}</td>
                                <td className="note">{n === "ALUControl" && v !== undefined && v !== null ? ALU_NAME[v] : ""}</td></tr>
                            );
                          })}
                        </tbody></table>
                      </div>
                    </div>
                  )}
                  {panelTab === "problemas" && (
                    problems.length === 0 ? <p className="hint">No hay problemas en el programa.</p> : (
                      <ul className="problems">
                        {problems.map((p, i) => (
                          <li key={i}><button onClick={() => gotoProblem(p)}>
                            <span className={`sev ${p.severity}`}><Icon name={p.severity === "error" ? "error" : "warn"} size={15} /></span>
                            <span className="pmsg">{p.msg}</span><span className="ploc">{p.file.name} [Ln {p.line}]</span>
                          </button></li>
                        ))}
                      </ul>
                    )
                  )}
                  {panelTab === "salida" && (
                    <div className="output" role="log">
                      {log.map((l, i) => <div key={i} className={`oline ${l.kind}`}><span className="otime">[{l.t}]</span> {l.text}</div>)}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------------- barra de estado ---------------- */}
      <footer className="statusbar">
        <div className="sb-left">
          <span className="sb-item strong hide-sm"><Icon name="chip" size={14} />RV32I single-cycle</span>
          <button className="sb-item" onClick={() => { setPanelTab("problemas"); setL({ panel: true }); }} title="Problemas">
            <Icon name="error" size={14} />{nErr}<Icon name="warn" size={14} />{nWarn}
          </button>
          <span className="sb-item">{stateLabel}</span>
        </div>
        <div className="sb-right">
          <span className="sb-item">Ciclo {st.cycle}</span>
          <span className="sb-item">PC 0x{hex(st.pc)}</span>
          {showCode && <span className="sb-item hide-sm">Ln {cursor.line}, Col {cursor.col}</span>}
          {showCode && <span className="sb-item hide-sm">{curFile.lang}</span>}
        </div>
      </footer>

      <input ref={fileRef} type="file" accept=".c,.cpp,.cc,.h,.s,.asm,.txt,.hex,.mem,.dat" hidden onChange={onFile} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
