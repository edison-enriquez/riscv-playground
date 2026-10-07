// Pruebas del ensamblador y del modelo single-cycle (node tests/sim.test.mjs)
import { readFileSync } from "node:fs";
import { assemble, loadHex, hex, disassemble } from "../src/sim/isa.js";
import { initialState, step } from "../src/sim/cpu.js";
import { EXAMPLES } from "../src/programs/examples.js";
import { compileC } from "../src/sim/minic.js";
import { INSTRUCTIONS } from "../src/programs/rv32iDoc.js";
import { RV32I } from "../src/sim/isa.js";

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log("FALLA:", msg); } else console.log("ok:", msg); };

// 1. El ensamblador reproduce riscvtest.txt del libro
const expected = readFileSync(new URL("./riscvtest.txt", import.meta.url), "utf8").trim().split(/\s+/);
const p = assemble(EXAMPLES.find((e) => e.id === "riscvtest").src);
check(p.errors.length === 0, "riscvtest ensambla sin errores " + JSON.stringify(p.errors));
check(p.words.map((w) => hex(w.word)).join(" ") === expected.map((x) => x.toUpperCase()).join(" "), "códigos idénticos a riscvtest.txt");

// 2. Figura 7.2: códigos del libro
const f72 = assemble(EXAMPLES[0].src);
check(f72.words.map((w) => hex(w.word)).join(" ") === "FFC4A303 0064A423 0062E233 FE420AE3", "Figura 7.2 codifica igual que el libro");

function run(prog, max = 500) {
  let st = initialState(prog);
  for (let i = 0; i < max; i++) {
    const r = step(prog, st);
    if (r.state.halted) return { st: r.state, error: r.sig.error };
    st = r.state;
    if (r.selfLoop) return { st };
  }
  return { st, error: "no terminó" };
}
// 3. riscvtest escribe 25 en la dirección 100
const r1 = run(p);
check(!r1.error && r1.st.mem[100] === 25, "riscvtest: Mem[100] = 25 " + (r1.error || ""));
check(r1.st.regs[3] === 0x44 && r1.st.regs[9] === 18, "riscvtest: x3 = 0x44, x9 = 18");

// 4. Figura 7.2 tras 4 ciclos
let st = initialState(f72);
for (let i = 0; i < 4; i++) st = step(f72, st).state;
check(st.regs[6] === 10 && st.mem[0x200c] === 10 && st.regs[4] === 14 && st.pc === 0x1000, "Figura 7.2: x6=10, Mem[0x200C]=10, x4=14, PC vuelve a 0x1000");

// 5. Suma de arreglo
const sp = assemble(EXAMPLES[2].src);
const r3 = run(sp);
check(!r3.error && r3.st.mem[0x200] === 24, "suma de arreglo = 24 " + (r3.error || ""));

// 6. Carga de hex y desensamblado
const hx = loadHex(readFileSync(new URL("./riscvtest.txt", import.meta.url), "utf8"));
check(hx.words.length === 21 && disassemble(0x407302b3) === "sub x5, x6, x7", "carga hex y desensambla sub x5, x6, x7");
const r4 = run(hx);
check(r4.st.mem[100] === 25, "riscvtest desde hex: Mem[100] = 25");

// 7. Instrucción no soportada se detiene con mensaje
const bad = assemble("bne x1, x2, 8\n");
const rb = step(bad, initialState(bad));
check(rb.state.halted && /bne/.test(rb.sig.error), "bne se reporta como no implementada");

// 8. Salida típica de gcc -S / Compiler Explorer (directivas y pseudoinstrucciones)
const gcc = assemble(`	.file	"suma.c"
	.text
	.align	2
	.globl	_start
	.type	_start, @function
_start:
	li	a5,10
	mv	a4,zero
.L2:
	add	a4,a4,a5
	addi	a5,a5,-1
	bnez	a5,.L2
	sw	a4,100(zero)
.L3:
	j	.L3
	.size	_start, .-_start
`);
check(gcc.errors.length === 0 && gcc.words.length === 7, "acepta la salida de gcc -S " + JSON.stringify(gcc.errors));
check(hex(gcc.words[4].word) === "FE079CE3", "bnez a5, .L2 codifica como 0xFE079CE3");

// 8. Compilador didáctico de C: solo usa las 13 instrucciones y da el resultado correcto
const SUP = new Set(["lw", "sw", "add", "sub", "and", "or", "slt", "addi", "andi", "ori", "slti", "beq", "jal"]);
const cCases = [
  ["suma 1..10", `int main(){int s=0; for(int i=1;i<=10;i++) s+=i; return s;}`, (st) => st.regs[10] | 0, 55],
  ["arreglo global", `int v[5]={3,-1,7,10,5}; int r; int main(){ int s=0; int i=0; while(i<5){ s = s + v[i]; i++; } r = s; }`, (st) => st.mem[0x114] | 0, 24],
  ["xor, <<, * constante", `int main(){ int a=12, b=10; int x = a ^ b; int y = (a << 3) + a*5 - 7*b; return x*100 + y; }`, (st) => st.regs[10] | 0, 686],
  ["constante grande sin lui", `int main(){ int c = 0x12345678; int d = -5000; return c + d; }`, (st) => st.regs[10] | 0, (0x12345678 - 5000) | 0],
  ["if/else, ==, !=, &&, ||", `int main(){ int n=0; for(int i=0;i<10;i++){ if(i==3 || i==7) n+=100; else if(i!=5 && i>=2) n+=1; } return n; }`, (st) => st.regs[10] | 0, 205],
  ["do/while, break, continue", `int main(){ int k=0, s=0; do { k++; if(k==2) continue; if(k>6) break; s+=k; } while(k<100); return s; }`, (st) => st.regs[10] | 0, 19],
  ["puntero y #define", `#define OUT 0x200\nint main(){ volatile int *p = (int*)OUT; *p = 42; return *p + 1; }`, (st) => (st.regs[10] | 0) * 1000 + (st.mem[0x200] | 0), 43042],
  ["Fibonacci en arreglo", `int f[10]; int main(){ f[0]=0; f[1]=1; for(int i=2;i<10;i++) f[i]=f[i-1]+f[i-2]; return f[9]; }`, (st) => st.regs[10] | 0, 34],
];
for (const [name, c, get, want] of cCases) {
  const r = compileC(c);
  const prog = assemble(r.asm);
  const only = prog.words.every((w) => SUP.has(disassemble(w.word, w.addr).split(/\s+/)[0]));
  const out = r.errors.length || prog.errors.length ? null : run(prog, 20000);
  check(out && !out.error && only && get(out.st) === want, `C: ${name} = ${want}` + (out ? "" : " " + JSON.stringify(r.errors.concat(prog.errors))));
}
check(compileC("int main(){int a=3; return a/2;}").errors.length === 1, "C: la división se rechaza con mensaje");

// 9. La referencia RV32I coincide con la tabla de codificación del ensamblador
{
  const bad = INSTRUCTIONS.filter((d) => RV32I[d.m]).filter((d) => {
    const [, op, f3, f7] = RV32I[d.m];
    return op !== d.op || (f3 !== undefined && f3 !== d.f3) || (f7 !== undefined && f7 !== d.f7);
  }).map((d) => d.m);
  check(bad.length === 0, "referencia RV32I: opcode/funct3/funct7 coinciden con isa.js " + bad.join(","));
  check(INSTRUCTIONS.filter((d) => !d.variant).length === 40, "referencia RV32I: 40 instrucciones base");
}

console.log(fails ? `\n${fails} pruebas fallaron` : "\nTodas las pruebas pasaron");
process.exit(fails ? 1 : 0);
