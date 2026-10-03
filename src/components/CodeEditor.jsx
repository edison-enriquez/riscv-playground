import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  Decoration, gutter, GutterMarker, highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from "@codemirror/language";
import { cpp } from "@codemirror/lang-cpp";
import { setDiagnostics, lintGutter } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { RV32I } from "../sim/isa.js";

// ---------- lenguaje: ensamblador RISC-V ----------
const PSEUDO = new Set(["nop", "mv", "not", "neg", "j", "jr", "ret", "beqz", "bnez", "bgt", "ble", "li", "la", "call", "tail", "seqz", "snez", "bltz", "bgez", "blez", "bgtz", "bgtu", "bleu"]);
const REG = /^(x([12]?\d|3[01])|zero|ra|sp|gp|tp|fp|t[0-6]|s([0-9]|1[01])|a[0-7])\b/;
const riscvAsm = StreamLanguage.define({
  name: "riscv",
  startState: () => ({ op: true }),
  token(stream, st) {
    if (stream.sol()) st.op = true;
    if (stream.eatSpace()) return null;
    if (stream.match(/^#\s*init:/)) { stream.skipToEnd(); return "meta"; }
    if (stream.match("#") || stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^[A-Za-z_.$][\w.$]*:/)) return "labelName";
    if (stream.match(/^\.[A-Za-z_]\w*/)) { st.op = false; return "meta"; }
    if (stream.match(/^-?(0x[0-9a-fA-F]+|0b[01]+|\d+)\b/)) return "number";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (st.op) {
      const m = stream.match(/^[A-Za-z][\w.]*/);
      if (m) { st.op = false; return RV32I[m[0].toLowerCase()] || PSEUDO.has(m[0].toLowerCase()) ? "keyword" : "variableName"; }
    }
    if (stream.match(REG)) return "atom";
    if (stream.match(/^%(hi|lo|pcrel_hi|pcrel_lo)\b/)) return "meta";
    if (stream.match(/^[A-Za-z_.$][\w.$]*/)) return "variableName";
    if (stream.match(/^[(),]/)) return "punctuation";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
});

// ---------- lenguaje: código máquina en hexadecimal ----------
const hexLang = StreamLanguage.define({
  name: "hex",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("#") || stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^@[0-9a-fA-F]+/)) return "meta";
    if (stream.match(/^(0x)?[0-9a-fA-F]{1,8}\b/)) return "number";
    stream.next();
    return "invalid";
  },
  languageData: { commentTokens: { line: "#" } },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: "var(--syn-kw)" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "var(--syn-type)" },
  { tag: [t.number, t.bool], color: "var(--syn-num)" },
  { tag: [t.lineComment, t.blockComment, t.comment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.string, t.character], color: "var(--syn-str)" },
  { tag: t.labelName, color: "var(--syn-label)", fontWeight: "600" },
  { tag: t.atom, color: "var(--syn-reg)" },
  { tag: [t.meta, t.processingInstruction, t.macroName], color: "var(--syn-meta)" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: "var(--syn-fn)" },
  { tag: [t.operator, t.derefOperator, t.arithmeticOperator, t.compareOperator, t.logicOperator, t.bitwiseOperator], color: "var(--syn-op)" },
  { tag: t.invalid, color: "var(--accent)", textDecoration: "underline wavy" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--editor-bg)", color: "var(--ink)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-gutters": { backgroundColor: "var(--editor-bg)", color: "var(--gutter)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection) !important" },
  ".cm-selectionMatch": { backgroundColor: "var(--selection-match)" },
  ".cm-matchingBracket": { backgroundColor: "var(--selection-match)", outline: "1px solid var(--line)" },
  ".cm-exec-line": { backgroundColor: "var(--exec-bg)", boxShadow: "inset 2px 0 0 var(--exec-mark)" },
  ".cm-exec-gutter": { width: "14px" },
  ".cm-exec-arrow": { color: "var(--exec-mark)", fontSize: "11px", lineHeight: "inherit", paddingLeft: "2px" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--accent)" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--warn)" },
  ".cm-tooltip": { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--ink)" },
});

// ---------- línea en ejecución (como el depurador de VS Code) ----------
const setExec = StateEffect.define();
const execField = StateField.define({
  create: () => 0,
  update(v, tr) { for (const e of tr.effects) if (e.is(setExec)) return e.value; return v; },
});
const execDeco = EditorView.decorations.compute([execField, "doc"], (state) => {
  const n = state.field(execField);
  const b = new RangeSetBuilder();
  if (n >= 1 && n <= state.doc.lines) { const l = state.doc.line(n); b.add(l.from, l.from, Decoration.line({ class: "cm-exec-line" })); }
  return b.finish();
});
class Arrow extends GutterMarker { toDOM() { const s = document.createElement("span"); s.className = "cm-exec-arrow"; s.textContent = "▶"; return s; } }
const arrow = new Arrow();
const execGutter = gutter({
  class: "cm-exec-gutter",
  lineMarker(view, line) { return view.state.doc.lineAt(line.from).number === view.state.field(execField) ? arrow : null; },
  lineMarkerChange: (u) => u.startState.field(execField) !== u.state.field(execField),
});

const LANGS = { c: () => cpp(), asm: () => riscvAsm, hex: () => hexLang };

const CodeEditor = forwardRef(function CodeEditor({ value, onChange, language, diagnostics, execLine, onRun, onCursor, label }, ref) {
  const host = useRef(null);
  const view = useRef(null);
  const cb = useRef({});
  cb.current = { onChange, onRun, onCursor };

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), execGutter, lintGutter(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
        indentOnInput(), bracketMatching(), closeBrackets(), highlightActiveLine(), highlightSelectionMatches(),
        LANGS[language](), syntaxHighlighting(highlight), theme, execField, execDeco,
        EditorState.tabSize.of(language === "asm" ? 8 : 4),
        keymap.of([
          { key: "Mod-Enter", run: () => { cb.current.onRun?.(); return true; } },
          { key: "Mod-b", run: () => { cb.current.onRun?.(); return true; } },
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cb.current.onChange?.(u.state.doc.toString());
          if (u.selectionSet || u.docChanged || u.focusChanged) {
            const pos = u.state.selection.main.head;
            const line = u.state.doc.lineAt(pos);
            cb.current.onCursor?.(line.number, pos - line.from + 1);
          }
        }),
        EditorView.contentAttributes.of({ "aria-label": label || "Editor" }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => view.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // valor externo -> editor
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  // diagnósticos
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const ds = (diagnostics || []).filter((d) => d.line >= 1 && d.line <= doc.lines).map((d) => {
      const l = doc.line(d.line);
      const from = l.from + (l.text.length - l.text.trimStart().length);
      return { from: Math.min(from, l.to), to: l.to, severity: d.severity || "error", message: d.msg };
    });
    v.dispatch(setDiagnostics(v.state, ds));
  }, [diagnostics, value]);

  // línea en ejecución
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const n = execLine || 0;
    const effects = [setExec.of(n)];
    if (n >= 1 && n <= v.state.doc.lines) effects.push(EditorView.scrollIntoView(v.state.doc.line(n).from, { y: "nearest", yMargin: 40 }));
    v.dispatch({ effects });
  }, [execLine, value]);

  useImperativeHandle(ref, () => ({
    gotoLine(n) {
      const v = view.current;
      if (!v) return;
      const l = v.state.doc.line(Math.max(1, Math.min(n, v.state.doc.lines)));
      v.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
      v.focus();
    },
  }));

  return <div className="code-editor" ref={host} />;
});

export default CodeEditor;
