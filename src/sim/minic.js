// minic.js — Compilador didáctico de un subconjunto de C a ensamblador RISC-V
// que usa SOLO las instrucciones del procesador single-cycle del libro:
//   lw sw add sub and or slt addi andi ori slti beq jal
// Lo que falta en el hardware se arma con lo que hay:
//   bne       -> beq + jal          a ^ b  -> (a | b) - (a & b)
//   x << k    -> k veces add x,x,x  x * k  -> sumas y duplicaciones (k constante)
//   constante de más de 12 bits -> addi + duplicaciones (no hay lui)
// Limitaciones (a propósito): una sola función (main o _start), sin llamadas
// (necesitarían jalr), sin división, sin >> (no hay srl/sra), solo int.

const KEYWORDS = new Set(["int", "void", "unsigned", "signed", "volatile", "const", "static", "register",
  "if", "else", "while", "for", "do", "break", "continue", "return", "long", "short", "char"]);

// ---------------- léxico ----------------
function preprocess(src) {
  const defines = {};
  const lines = src.split(/\r?\n/).map((ln) => {
    const m = /^\s*#\s*define\s+([A-Za-z_]\w*)\s+(.*)$/.exec(ln);
    if (m) { defines[m[1]] = m[2].replace(/\/\/.*$/, "").trim(); return ""; }
    if (/^\s*#/.test(ln)) return ""; // #include, #pragma… se ignoran
    return ln;
  });
  return { text: lines.join("\n"), defines };
}

function tokenize(text, defines, depth = 0) {
  const toks = [];
  let i = 0, line = 1;
  const push = (t, v) => toks.push({ t, v, line });
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (text.startsWith("//", i)) { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (text.startsWith("/*", i)) {
      const j = text.indexOf("*/", i + 2);
      const end = j < 0 ? text.length : j + 2;
      for (let k = i; k < end; k++) if (text[k] === "\n") line++;
      i = end; continue;
    }
    let m;
    if ((m = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)[uUlL]*/.exec(text.slice(i)))) {
      const s = m[1].toLowerCase();
      const v = s.startsWith("0x") ? parseInt(s.slice(2), 16) : s.startsWith("0b") ? parseInt(s.slice(2), 2) : parseInt(s, 10);
      push("num", v | 0); i += m[0].length; continue;
    }
    if ((m = /^'(\\?.)'/.exec(text.slice(i)))) {
      const ch = m[1].length === 2 ? { n: 10, t: 9, 0: 0, "\\": 92, "'": 39 }[m[1][1]] ?? m[1].charCodeAt(1) : m[1].charCodeAt(0);
      push("num", ch); i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_]\w*/.exec(text.slice(i)))) {
      const w = m[0];
      if (w in defines && depth < 8) {
        const sub = tokenize(defines[w], defines, depth + 1);
        sub.filter((t) => t.t !== "eof").forEach((t) => toks.push({ ...t, line }));
      } else push(KEYWORDS.has(w) ? "kw" : "id", w);
      i += w.length; continue;
    }
    const ops3 = ["<<=", ">>="];
    const ops2 = ["==", "!=", "<=", ">=", "&&", "||", "<<", ">>", "++", "--", "+=", "-=", "&=", "|=", "^=", "*="];
    const o3 = ops3.find((o) => text.startsWith(o, i));
    if (o3) { push("op", o3); i += 3; continue; }
    const o2 = ops2.find((o) => text.startsWith(o, i));
    if (o2) { push("op", o2); i += 2; continue; }
    if ("+-*/%&|^~!<>=()[]{};,?:".includes(c)) { push("op", c); i++; continue; }
    throw cerr(line, `carácter inesperado "${c}"`);
  }
  push("eof", null);
  return toks;
}

function cerr(line, msg) { const e = new Error(msg); e.line = line; return e; }

// ---------------- sintaxis ----------------
function parse(toks) {
  let p = 0;
  const peek = (k = 0) => toks[p + k];
  const is = (t, v) => peek().t === t && (v === undefined || peek().v === v);
  const isOp = (v) => is("op", v);
  const next = () => toks[p++];
  const expect = (t, v) => {
    if (!is(t, v)) throw cerr(peek().line, `se esperaba ${v ?? t} y se encontró "${peek().v ?? "fin del archivo"}"`);
    return next();
  };
  const isTypeStart = () => is("kw") && ["int", "void", "unsigned", "signed", "volatile", "const", "static", "register", "long", "short", "char"].includes(peek().v);
  const parseType = () => {
    const line = peek().line;
    let base = null;
    while (isTypeStart()) {
      const w = next().v;
      if (w === "char" || w === "short") throw cerr(line, `solo se admite int (palabras de 32 bits); "${w}" necesitaría lb/sb`);
      if (["int", "void", "long"].includes(w)) base = w === "void" ? "void" : "int";
      else if (["unsigned", "signed"].includes(w) && !base) base = "int";
    }
    let ptr = 0;
    while (isOp("*")) { next(); ptr++; while (is("kw", "volatile") || is("kw", "const")) next(); }
    return { base: base || "int", ptr };
  };

  const globals = [];
  let func = null;
  while (!is("eof")) {
    const line = peek().line;
    if (!isTypeStart()) throw cerr(line, `se esperaba una declaración o una función, no "${peek().v}"`);
    const type = parseType();
    const name = expect("id").v;
    if (isOp("(")) {
      next();
      if (is("kw", "void")) next();
      if (!isOp(")")) throw cerr(line, `la función ${name} no puede recibir parámetros en este compilador`);
      expect("op", ")");
      if (func) throw cerr(line, `solo se admite una función (main o _start); llamar a otras necesitaría jalr, que este procesador no tiene`);
      func = { name, line, body: parseBlock() };
      continue;
    }
    // variables globales (pueden ir varias separadas por coma)
    let cur = name;
    for (;;) {
      const g = { name: cur, line, size: 1, init: [], isArray: false };
      if (isOp("[")) { next(); g.isArray = true; g.size = isOp("]") ? null : constExpr(parseExpr()); expect("op", "]"); }
      if (isOp("=")) {
        next();
        if (isOp("{")) {
          next();
          while (!isOp("}")) { g.init.push(constExpr(parseAssign())); if (isOp(",")) next(); }
          expect("op", "}");
        } else g.init.push(constExpr(parseAssign()));
      }
      if (g.size === null) g.size = g.init.length;
      if (g.isArray && g.size < 1) throw cerr(line, `el arreglo ${g.name} necesita tamaño`);
      globals.push(g);
      if (isOp(",")) { next(); cur = expect("id").v; continue; }
      break;
    }
    expect("op", ";");
    void type;
  }
  if (!func) throw cerr(1, "falta la función main (o _start)");
  return { globals, func };

  function constExpr(e) {
    const v = fold(e);
    if (v.k !== "num") throw cerr(e.line, "se esperaba un valor constante");
    return v.v;
  }

  function parseBlock() {
    expect("op", "{");
    const stmts = [];
    while (!isOp("}")) stmts.push(parseStmt());
    expect("op", "}");
    return { k: "block", stmts };
  }

  function parseStmt() {
    const line = peek().line;
    if (isOp("{")) return parseBlock();
    if (isOp(";")) { next(); return { k: "empty", line }; }
    if (isTypeStart()) return parseDecl();
    if (is("kw", "if")) {
      next(); expect("op", "("); const c = parseExpr(); expect("op", ")");
      const t = parseStmt();
      let e = null;
      if (is("kw", "else")) { next(); e = parseStmt(); }
      return { k: "if", c, t, e, line };
    }
    if (is("kw", "while")) { next(); expect("op", "("); const c = parseExpr(); expect("op", ")"); return { k: "while", c, body: parseStmt(), line }; }
    if (is("kw", "do")) {
      next(); const body = parseStmt(); if (!is("kw", "while")) throw cerr(peek().line, "se esperaba while");
      next(); expect("op", "("); const c = parseExpr(); expect("op", ")"); expect("op", ";");
      return { k: "do", c, body, line };
    }
    if (is("kw", "for")) {
      next(); expect("op", "(");
      let init = null;
      if (isTypeStart()) init = parseDecl(); else { if (!isOp(";")) init = { k: "expr", e: parseExpr(), line }; expect("op", ";"); }
      const c = isOp(";") ? null : parseExpr(); expect("op", ";");
      const step = isOp(")") ? null : parseExpr(); expect("op", ")");
      return { k: "for", init, c, step, body: parseStmt(), line };
    }
    if (is("kw", "break")) { next(); expect("op", ";"); return { k: "break", line }; }
    if (is("kw", "continue")) { next(); expect("op", ";"); return { k: "continue", line }; }
    if (is("kw", "return")) { next(); const e = isOp(";") ? null : parseExpr(); expect("op", ";"); return { k: "return", e, line }; }
    const e = parseExpr(); expect("op", ";");
    return { k: "expr", e, line };
  }

  function parseDecl() {
    const line = peek().line;
    parseType();
    const decls = [];
    for (;;) {
      const name = expect("id").v;
      let size = 0, init = null, list = null;
      if (isOp("[")) { next(); size = constExpr(parseExpr()); expect("op", "]"); }
      if (isOp("=")) {
        next();
        if (isOp("{")) { next(); list = []; while (!isOp("}")) { list.push(constExpr(parseAssign())); if (isOp(",")) next(); } expect("op", "}"); }
        else init = parseAssign();
      }
      decls.push({ name, size, init, list, line });
      if (isOp(",")) { next(); continue; }
      break;
    }
    expect("op", ";");
    return { k: "decl", decls, line };
  }

  function parseExpr() { return parseAssign(); }
  function parseAssign() {
    const line = peek().line;
    const lhs = parseOr();
    const ops = ["=", "+=", "-=", "&=", "|=", "^=", "<<=", ">>=", "*="];
    if (is("op") && ops.includes(peek().v)) {
      const op = next().v;
      const rhs = parseAssign();
      return { k: "assign", op, lhs, rhs, line };
    }
    return lhs;
  }
  function parseOr() { return parseLevel(0); }
  function parseLevel(i) {
    if (i >= LEVELS.length) return parseUnary();
    const ops = LEVELS[i];
    let l = parseLevel(i + 1);
    while (is("op") && ops.includes(peek().v)) { const line = peek().line; const op = next().v; l = { k: "bin", op, l, r: parseLevel(i + 1), line }; }
    return l;
  }
  function parseUnary() {
    const line = peek().line;
    if (is("op") && ["-", "!", "~", "+"].includes(peek().v)) { const op = next().v; return { k: "un", op, e: parseUnary(), line }; }
    if (isOp("++") || isOp("--")) { const op = next().v; return { k: "pre", op, e: parseUnary(), line }; }
    if (isOp("*")) { next(); return { k: "deref", e: parseUnary(), line }; }
    if (isOp("(") && peek(1).t === "kw" && ["int", "unsigned", "volatile", "const", "signed", "long", "void"].includes(peek(1).v)) {
      next(); parseType(); expect("op", ")"); return parseUnary(); // conversión de tipo: se ignora
    }
    return parsePostfix();
  }
  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      const line = peek().line;
      if (isOp("[")) { next(); const i = parseExpr(); expect("op", "]"); e = { k: "index", a: e, i, line }; continue; }
      if (isOp("++") || isOp("--")) { const op = next().v; e = { k: "post", op, e, line }; continue; }
      if (isOp("(")) throw cerr(line, "no se admiten llamadas a funciones: necesitarían jalr, que este procesador no tiene");
      return e;
    }
  }
  function parsePrimary() {
    const t = peek();
    if (t.t === "num") { next(); return { k: "num", v: t.v, line: t.line }; }
    if (t.t === "id") { next(); return { k: "var", name: t.v, line: t.line }; }
    if (isOp("(")) { next(); const e = parseExpr(); expect("op", ")"); return e; }
    throw cerr(t.line, `expresión inválida cerca de "${t.v ?? "fin del archivo"}"`);
  }
}

// precedencias de C, de menor a mayor
const LEVELS = [["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];

// ---------------- plegado de constantes ----------------
function fold(n) {
  if (!n) return n;
  if (n.k === "bin") {
    const l = fold(n.l), r = fold(n.r);
    if (l.k === "num" && r.k === "num") {
      const a = l.v, b = r.v;
      const v = { "+": a + b, "-": a - b, "*": Math.imul(a, b), "/": b ? (a / b) | 0 : null, "%": b ? a % b : null,
        "&": a & b, "|": a | b, "^": a ^ b, "<<": a << b, ">>": a >> b, "<": +(a < b), ">": +(a > b), "<=": +(a <= b),
        ">=": +(a >= b), "==": +(a === b), "!=": +(a !== b), "&&": +(!!a && !!b), "||": +(!!a || !!b) }[n.op];
      if (v !== null && v !== undefined) return { k: "num", v: v | 0, line: n.line };
    }
    return { ...n, l, r };
  }
  if (n.k === "un") {
    const e = fold(n.e);
    if (e.k === "num") return { k: "num", v: { "-": -e.v, "~": ~e.v, "!": +!e.v, "+": e.v }[n.op] | 0, line: n.line };
    return { ...n, e };
  }
  return n;
}

// ---------------- generación de código ----------------
const fits12 = (v) => v >= -2048 && v <= 2047;
const LOCAL_REGS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"];
const TEMP_REGS = ["t0", "t1", "t2", "t3", "t4", "t5", "t6", "ra", "gp", "tp"];
const DATA_BASE = 0x100;

export function compileC(src) {
  try {
    const { text, defines } = preprocess(src);
    const toks = tokenize(text, defines);
    const ast = parse(toks);
    return generate(ast, src);
  } catch (e) {
    return { asm: "", errors: [{ line: e.line ?? 1, msg: e.message }] };
  }
}


function generate(ast, src) {
  const srcLines = src.split(/\r?\n/);
  const out = [];
  const initMem = [];
  const emit = (s) => out.push("        " + s);
  const label = (l) => out.push(`${l}:`);
  let nlab = 0;
  const newLabel = (base) => `${base}${nlab}`;

  // memoria de datos: globales y arreglos
  const sym = {}; // name -> {kind:'reg'|'mem'|'arr', reg, addr, size}
  let nextAddr = DATA_BASE;
  const allocMem = (name, size, init, line) => {
    const addr = nextAddr;
    nextAddr += 4 * size;
    if (nextAddr > 0x800) throw cerr(line, "no hay más espacio de datos (0x100–0x7FF): use arreglos más pequeños");
    init.forEach((v, i) => { if (v) initMem.push([addr + 4 * i, v]); });
    return addr;
  };
  for (const g of ast.globals) {
    if (sym[g.name]) throw cerr(g.line, `${g.name} ya fue declarada`);
    const addr = allocMem(g.name, g.size, g.init, g.line);
    sym[g.name] = { kind: g.isArray ? "arr" : "mem", addr, size: g.size };
  }

  // registros
  const freeLocals = LOCAL_REGS.slice();
  const freeTemps = TEMP_REGS.slice();
  const isTemp = (r) => TEMP_REGS.includes(r);
  const allocTemp = (line) => {
    if (!freeTemps.length) throw cerr(line, "expresión demasiado compleja: no quedan registros temporales");
    return freeTemps.shift();
  };
  const free = (r) => { if (isTemp(r) && !freeTemps.includes(r)) freeTemps.unshift(r); };
  const scopes = [{}];
  const lookup = (name, line) => {
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i][name]) return scopes[i][name];
    if (sym[name]) return sym[name];
    throw cerr(line, `variable no declarada: ${name}`);
  };

  // si la última instrucción escribió el temporal v, se redirige a d (evita una copia)
  function retarget(v, d) {
    if (!isTemp(v)) return false;
    const last = out[out.length - 1] || "";
    const m = /^(\s+)([a-z]+)(\s+)([a-z0-9]+),(.*)$/.exec(last);
    if (!m || m[4] !== v || ["sw", "beq"].includes(m[2])) return false;
    out[out.length - 1] = `${m[1]}${m[2]}${m[3]}${d},${m[5]}`;
    return true;
  }

  // cargar una constante cualquiera sin lui
  function loadConst(d, v) {
    v |= 0;
    if (fits12(v)) { emit(`addi ${d}, x0, ${v}`); return; }
    const u = v >>> 0;
    const groups = [u >>> 22, (u >>> 11) & 0x7ff, u & 0x7ff];
    let started = false;
    emit(`# constante ${v} (0x${u.toString(16)}): sin lui, se arma con addi y duplicaciones`);
    for (const g of groups) {
      if (!started) { if (g === 0) continue; emit(`addi ${d}, x0, ${g}`); started = true; continue; }
      for (let k = 0; k < 11; k++) emit(`add ${d}, ${d}, ${d}`);
      if (g) emit(`addi ${d}, ${d}, ${g}`);
    }
  }

  // dirección de un elemento de arreglo -> {base: reg, off: imm}
  function elemAddr(n) {
    if (n.a.k !== "var") throw cerr(n.line, "solo se admite indexar arreglos declarados");
    const s = lookup(n.a.name, n.line);
    if (s.kind !== "arr") throw cerr(n.line, `${n.a.name} no es un arreglo`);
    const i = fold(n.i);
    if (i.k === "num") {
      const a = s.addr + 4 * i.v;
      if (fits12(a)) return { base: "x0", off: a };
      const t = allocTemp(n.line); loadConst(t, a); return { base: t, off: 0 };
    }
    const ri = genExpr(i);
    const t = allocTemp(n.line);
    emit(`add ${t}, ${ri}, ${ri}       # índice * 2`);
    emit(`add ${t}, ${t}, ${t}       # índice * 4 (bytes)`);
    free(ri);
    if (fits12(s.addr)) return { base: t, off: s.addr };
    const b = allocTemp(n.line); loadConst(b, s.addr); emit(`add ${t}, ${t}, ${b}`); free(b);
    return { base: t, off: 0 };
  }
  function derefAddr(n) {
    const e = fold(n.e);
    if (e.k === "num" && fits12(e.v)) return { base: "x0", off: e.v };
    const r = genExpr(e);
    if (r === "x0") return { base: "x0", off: 0 };
    return { base: r, off: 0 };
  }

  // normaliza a 0/1 (x != 0)
  function toBool(r, line) {
    const d = isTemp(r) ? r : allocTemp(line);
    const t = allocTemp(line);
    emit(`slt ${t}, x0, ${r}`);
    emit(`slt ${d}, ${r}, x0`);
    emit(`or  ${d}, ${d}, ${t}        # ${d} = (valor != 0)`);
    free(t);
    return d;
  }
  function notBool(r, line) { // r es 0/1 -> 1 - r
    const one = allocTemp(line);
    const d = isTemp(r) ? r : allocTemp(line);
    emit(`addi ${one}, x0, 1`);
    emit(`sub ${d}, ${one}, ${r}`);
    free(one);
    return d;
  }
  const BOOL_OPS = new Set(["<", ">", "<=", ">=", "==", "!=", "&&", "||"]);
  const isBoolExpr = (n) => (n.k === "bin" && BOOL_OPS.has(n.op)) || (n.k === "un" && n.op === "!") || (n.k === "num" && (n.v === 0 || n.v === 1));

  function dest(a, b, line) {
    if (isTemp(a)) { if (b !== a) free(b); return a; }
    if (isTemp(b)) return b;
    return allocTemp(line);
  }

  function genExpr(n0) {
    const n = fold(n0);
    switch (n.k) {
      case "num": {
        if (n.v === 0) return "x0";
        const d = allocTemp(n.line); loadConst(d, n.v); return d;
      }
      case "var": {
        const s = lookup(n.name, n.line);
        if (s.kind === "reg") return s.reg;
        if (s.kind === "mem") { const d = allocTemp(n.line); emit(`lw  ${d}, ${s.addr}(x0)      # ${n.name}`); return d; }
        // nombre de arreglo como valor: su dirección
        const d = allocTemp(n.line); loadConst(d, s.addr); return d;
      }
      case "index": {
        const { base, off } = elemAddr(n);
        const d = isTemp(base) ? base : allocTemp(n.line);
        emit(`lw  ${d}, ${off}(${base})`);
        return d;
      }
      case "deref": {
        const { base, off } = derefAddr(n);
        const d = isTemp(base) ? base : allocTemp(n.line);
        emit(`lw  ${d}, ${off}(${base})`);
        return d;
      }
      case "assign": return genAssign(n, true);
      case "pre": case "post": {
        const delta = n.op === "++" ? 1 : -1;
        if (n.k === "post") {
          const old = genExpr(n.e);
          const keep = allocTemp(n.line);
          emit(`addi ${keep}, ${old}, 0`);
          free(old);
          genAssign({ k: "assign", op: "=", lhs: n.e, rhs: { k: "bin", op: "+", l: n.e, r: { k: "num", v: delta, line: n.line }, line: n.line }, line: n.line }, false);
          return keep;
        }
        return genAssign({ k: "assign", op: "=", lhs: n.e, rhs: { k: "bin", op: "+", l: n.e, r: { k: "num", v: delta, line: n.line }, line: n.line }, line: n.line }, true);
      }
      case "un": {
        const a = genExpr(n.e);
        if (n.op === "+") return a;
        if (n.op === "-") { const d = isTemp(a) ? a : allocTemp(n.line); emit(`sub ${d}, x0, ${a}`); return d; }
        if (n.op === "~") { const d = isTemp(a) ? a : allocTemp(n.line); emit(`sub ${d}, x0, ${a}`); emit(`addi ${d}, ${d}, -1     # ~x = -x - 1`); return d; }
        if (n.op === "!") { const b = isBoolExpr(n.e) ? a : toBool(a, n.line); return notBool(b, n.line); }
        break;
      }
      case "bin": return genBin(n);
      default: break;
    }
    throw cerr(n.line, "expresión no soportada");
  }

  function genBin(n) {
    const { op, line } = n;
    const r = n.r;
    if (op === "/" || op === "%") throw cerr(line, `"${op}" necesita división, que este procesador no tiene`);
    if (op === ">>") throw cerr(line, "este procesador no tiene desplazamiento a la derecha (srl/sra)");
    if (op === "<<") {
      if (r.k !== "num") throw cerr(line, "<< solo con una cantidad constante (se hace con sumas)");
      const a = genExpr(n.l);
      const d = isTemp(a) ? a : allocTemp(line);
      if (d !== a) emit(`addi ${d}, ${a}, 0`);
      for (let k = 0; k < (r.v & 31); k++) emit(`add ${d}, ${d}, ${d}       # << 1`);
      return d;
    }
    if (op === "*") {
      let x = n.l, c = r;
      if (x.k === "num" && c.k !== "num") [x, c] = [c, x];
      if (c.k !== "num") throw cerr(line, "* entre dos variables necesita multiplicación (extensión M); escriba un lazo de sumas");
      return mulConst(genExpr(x), c.v, line);
    }
    if (["+", "-", "&", "|"].includes(op) && r.k === "num" && fits12(op === "-" ? -r.v : r.v)) {
      const a = genExpr(n.l);
      const d = isTemp(a) ? a : allocTemp(line);
      const ins = { "+": "addi", "-": "addi", "&": "andi", "|": "ori" }[op];
      emit(`${ins} ${d}, ${a}, ${op === "-" ? -r.v : r.v}`);
      return d;
    }
    if (op === "<=" && r.k === "num" && fits12(r.v + 1)) {
      const a = genExpr(n.l); const d = isTemp(a) ? a : allocTemp(line);
      emit(`slti ${d}, ${a}, ${r.v + 1}      # a <= ${r.v}  es  a < ${r.v + 1}`); return d;
    }
    if (op === ">=" && r.k === "num" && fits12(r.v)) {
      const a = genExpr(n.l); const d = isTemp(a) ? a : allocTemp(line);
      emit(`slti ${d}, ${a}, ${r.v}`); return notBool(d, line);
    }
    if (op === "<" && r.k === "num" && fits12(r.v)) {
      const a = genExpr(n.l); const d = isTemp(a) ? a : allocTemp(line);
      emit(`slti ${d}, ${a}, ${r.v}`); return d;
    }
    if (op === "&&" || op === "||") {
      let a = genExpr(n.l); if (!isBoolExpr(n.l)) a = toBool(a, line);
      if (!isTemp(a)) { const t = allocTemp(line); emit(`addi ${t}, ${a}, 0`); a = t; }
      let b = genExpr(n.r); if (!isBoolExpr(n.r)) b = toBool(b, line);
      emit(`${op === "&&" ? "and" : "or "} ${a}, ${a}, ${b}`);
      free(b);
      return a;
    }
    const a = genExpr(n.l);
    let aa = a;
    if (!isTemp(a) && a !== "x0") { /* variable: se puede leer sin copiar */ }
    const b = genExpr(n.r);
    switch (op) {
      case "+": { const d = dest(aa, b, line); emit(`add ${d}, ${aa}, ${b}`); return d; }
      case "-": { const d = dest(aa, b, line); emit(`sub ${d}, ${aa}, ${b}`); return d; }
      case "&": { const d = dest(aa, b, line); emit(`and ${d}, ${aa}, ${b}`); return d; }
      case "|": { const d = dest(aa, b, line); emit(`or  ${d}, ${aa}, ${b}`); return d; }
      case "^": {
        const t = allocTemp(line);
        emit(`and ${t}, ${aa}, ${b}`);
        const d = dest(aa, b, line);
        emit(`or  ${d}, ${aa}, ${b}`);
        emit(`sub ${d}, ${d}, ${t}       # a ^ b = (a | b) - (a & b)`);
        free(t);
        return d;
      }
      case "<": { const d = dest(aa, b, line); emit(`slt ${d}, ${aa}, ${b}`); return d; }
      case ">": { const d = dest(aa, b, line); emit(`slt ${d}, ${b}, ${aa}`); return d; }
      case "<=": { const d = dest(aa, b, line); emit(`slt ${d}, ${b}, ${aa}`); return notBool(d, line); }
      case ">=": { const d = dest(aa, b, line); emit(`slt ${d}, ${aa}, ${b}`); return notBool(d, line); }
      case "==": case "!=": {
        const d = dest(aa, b, line);
        emit(`sub ${d}, ${aa}, ${b}`);
        const f = toBool(d, line);
        return op === "!=" ? f : notBool(f, line);
      }
      default: throw cerr(line, `operador ${op} no soportado`);
    }
  }

  function mulConst(a, c, line) {
    c |= 0;
    if (c === 0) { free(a); return "x0"; }
    const neg = c < 0;
    let m = Math.abs(c) >>> 0;
    const acc = allocTemp(line);
    const p = allocTemp(line);
    emit(`# multiplicar por ${c} con sumas (no hay mul)`);
    emit(`addi ${p}, ${a}, 0`);
    let first = true;
    while (m) {
      if (m & 1) { emit(first ? `addi ${acc}, ${p}, 0` : `add ${acc}, ${acc}, ${p}`); first = false; }
      m >>>= 1;
      if (m) emit(`add ${p}, ${p}, ${p}`);
    }
    if (neg) emit(`sub ${acc}, x0, ${acc}`);
    free(p); free(a);
    return acc;
  }

  function genAssign(n, wantValue) {
    let rhs = n.rhs;
    if (n.op !== "=") {
      const op = n.op.slice(0, -1);
      rhs = { k: "bin", op, l: n.lhs, r: n.rhs, line: n.line };
    }
    const L = n.lhs;
    if (L.k === "var") {
      const s = lookup(L.name, n.line);
      if (s.kind === "reg") {
        const v = genExpr(rhs);
        if (v !== s.reg && !retarget(v, s.reg)) emit(`addi ${s.reg}, ${v}, 0      # ${L.name} = …`);
        free(v);
        return s.reg;
      }
      if (s.kind === "mem") {
        const v = genExpr(rhs);
        emit(`sw  ${v}, ${s.addr}(x0)      # ${L.name}`);
        return wantValue ? v : (free(v), "x0");
      }
      throw cerr(n.line, `no se puede asignar al arreglo ${L.name} completo`);
    }
    if (L.k === "index" || L.k === "deref") {
      const v = genExpr(rhs);
      const keepV = isTemp(v) ? v : null;
      const { base, off } = L.k === "index" ? elemAddr(L) : derefAddr(L);
      emit(`sw  ${v}, ${off}(${base})`);
      free(base);
      if (wantValue) return v;
      if (keepV) free(keepV);
      return "x0";
    }
    throw cerr(n.line, "lado izquierdo de la asignación inválido");
  }

  // ---- sentencias ----
  const loops = [];
  const END = "fin";
  function genCondFalse(c, Lfalse) {
    const f = fold(c);
    if (f.k === "num") { if (!f.v) emit(`jal x0, ${Lfalse}`); return; }
    if (f.k === "bin" && f.op === "!=") {
      const a = genExpr(f.l), b = genExpr(f.r);
      emit(`beq ${a}, ${b}, ${Lfalse}      # si son iguales, la condición es falsa`);
      free(a); free(b); return;
    }
    if (f.k === "bin" && f.op === "==") {
      const a = genExpr(f.l), b = genExpr(f.r);
      const Lok = `${Lfalse}_si`;
      emit(`beq ${a}, ${b}, ${Lok}`);
      emit(`jal x0, ${Lfalse}      # no hay bne: beq + jal`);
      out.push(`${Lok}:`);
      free(a); free(b); return;
    }
    const v = genExpr(f);
    emit(`beq ${v}, x0, ${Lfalse}`);
    free(v);
  }
  let lastComment = 0;
  function comment(line) {
    if (line === lastComment) return;
    lastComment = line;
    const t = (srcLines[line - 1] || "").trim();
    if (t) out.push(`        # C ${line}: ${t}`);
  }
  function genStmt(s) {
    switch (s.k) {
      case "block": scopes.push({}); s.stmts.forEach(genStmt); { const sc = scopes.pop(); for (const k in sc) if (sc[k].kind === "reg") freeLocals.unshift(sc[k].reg); } return;
      case "empty": return;
      case "decl":
        comment(s.line);
        for (const d of s.decls) {
          const scope = scopes[scopes.length - 1];
          if (scope[d.name]) throw cerr(d.line, `${d.name} ya fue declarada`);
          if (d.size) {
            const addr = allocMem(d.name, d.size, d.list || [], d.line);
            scope[d.name] = { kind: "arr", addr, size: d.size };
            continue;
          }
          if (!freeLocals.length) throw cerr(d.line, "demasiadas variables locales (máximo 20 en registros)");
          const reg = freeLocals.shift();
          scope[d.name] = { kind: "reg", reg };
          const v = d.init ? genExpr(d.init) : "x0";
          if (!retarget(v, reg)) emit(`addi ${reg}, ${v}, 0      # ${d.name}`);
          free(v);
        }
        return;
      case "expr": comment(s.line); { const v = genExpr(s.e.k === "post" ? { ...s.e, k: "pre" } : s.e); free(v); } return;
      case "if": {
        comment(s.line);
        nlab++;
        const Lelse = newLabel("sino"), Lend = newLabel("finsi");
        genCondFalse(s.c, s.e ? Lelse : Lend);
        genStmt(s.t);
        if (s.e) { emit(`jal x0, ${Lend}`); label(Lelse); genStmt(s.e); }
        label(Lend);
        return;
      }
      case "while": {
        comment(s.line);
        nlab++;
        const Ltop = newLabel("mientras"), Lend = newLabel("finmientras");
        label(Ltop);
        genCondFalse(s.c, Lend);
        loops.push({ brk: Lend, cont: Ltop });
        genStmt(s.body);
        loops.pop();
        lastComment = 0; comment(s.line);
        emit(`jal x0, ${Ltop}`);
        label(Lend);
        return;
      }
      case "do": {
        comment(s.line);
        nlab++;
        const Ltop = newLabel("hacer"), Lcont = newLabel("condicion"), Lend = newLabel("finhacer");
        label(Ltop);
        loops.push({ brk: Lend, cont: Lcont });
        genStmt(s.body);
        loops.pop();
        label(Lcont);
        lastComment = 0; comment(s.line);
        genCondFalse(s.c, Lend);
        emit(`jal x0, ${Ltop}`);
        label(Lend);
        return;
      }
      case "for": {
        comment(s.line);
        nlab++;
        scopes.push({});
        if (s.init) genStmt(s.init);
        const Ltop = newLabel("para"), Lcont = newLabel("paso"), Lend = newLabel("finpara");
        label(Ltop);
        if (s.c) genCondFalse(s.c, Lend);
        loops.push({ brk: Lend, cont: Lcont });
        genStmt(s.body);
        loops.pop();
        label(Lcont);
        lastComment = 0; comment(s.line);
        if (s.step) { const v = genExpr(s.step.k === "post" ? { ...s.step, k: "pre" } : s.step); free(v); }
        emit(`jal x0, ${Ltop}`);
        label(Lend);
        const sc = scopes.pop(); for (const k in sc) if (sc[k].kind === "reg") freeLocals.unshift(sc[k].reg);
        return;
      }
      case "break": if (!loops.length) throw cerr(s.line, "break fuera de un lazo"); emit(`jal x0, ${loops[loops.length - 1].brk}`); return;
      case "continue": if (!loops.length) throw cerr(s.line, "continue fuera de un lazo"); emit(`jal x0, ${loops[loops.length - 1].cont}`); return;
      case "return": comment(s.line); if (s.e) { const v = genExpr(s.e); if (v !== "a0") emit(`addi a0, ${v}, 0      # valor de retorno en a0`); free(v); } emit(`jal x0, ${END}`); return;
      default: throw cerr(s.line, "sentencia no soportada");
    }
  }

  const body = [];
  genStmt(ast.func.body);
  body.push(...out);
  out.length = 0;

  const header = [
    `# Generado por el compilador didáctico de la app a partir de C.`,
    `# Usa solo: lw sw add sub and or slt addi andi ori slti beq jal`,
  ];
  for (let i = 0; i < initMem.length; i += 6) {
    header.push(`# init: ${initMem.slice(i, i + 6).map(([a, v]) => `mem[0x${a.toString(16)}]=${v}`).join(", ")}`);
  }
  const symLines = Object.entries(sym).map(([k, s]) => `#   ${k} @ 0x${s.addr.toString(16)}${s.kind === "arr" ? ` (${s.size} palabras)` : ""}`);
  if (symLines.length) header.push(`# Datos en memoria:`, ...symLines);
  const asm = [...header, `${ast.func.name}:`, ...body, `${END}:    beq x0, x0, ${END}      # fin del programa (lazo infinito)`, ""].join("\n");
  return { asm, errors: [] };
}
