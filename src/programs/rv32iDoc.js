// Referencia del conjunto base RV32I (versión 2.1), tomada de la especificación oficial
// "The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA", capítulo RV32I,
// edición v20260120: https://docs.riscv.org/reference/isa/v20260120/unpriv/rv32.html
// Textos traducidos y resumidos al español; la referencia normativa es el documento oficial.

export const SPEC_URL = "https://docs.riscv.org/reference/isa/v20260120/unpriv/rv32.html";
export const SPEC_NAME = "RISC-V Unprivileged ISA, cap. RV32I v2.1 (edición 20260120)";

// Campos de cada formato, del bit 31 al 0. kind: op | fn | reg | imm
export const FORMAT_FIELDS = {
  R: [["funct7", 31, 25, "fn"], ["rs2", 24, 20, "reg"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
  I: [["imm[11:0]", 31, 20, "imm"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
  S: [["imm[11:5]", 31, 25, "imm"], ["rs2", 24, 20, "reg"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["imm[4:0]", 11, 7, "imm"], ["opcode", 6, 0, "op"]],
  B: [["imm[12|10:5]", 31, 25, "imm"], ["rs2", 24, 20, "reg"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["imm[4:1|11]", 11, 7, "imm"], ["opcode", 6, 0, "op"]],
  U: [["imm[31:12]", 31, 12, "imm"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
  J: [["imm[20|10:1|11|19:12]", 31, 12, "imm"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
  // variantes de I usadas en la referencia
  SH: [["funct7", 31, 25, "fn"], ["shamt", 24, 20, "imm"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
  FENCE: [["fm", 31, 28, "fn"], ["pred", 27, 24, "imm"], ["succ", 23, 20, "imm"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
  SYS: [["funct12", 31, 20, "fn"], ["rs1", 19, 15, "reg"], ["funct3", 14, 12, "fn"], ["rd", 11, 7, "reg"], ["opcode", 6, 0, "op"]],
};

export const FORMAT_INFO = {
  R: "Operaciones entre registros: rd ← rs1 op rs2.",
  I: "Inmediato de 12 bits con signo: operaciones con inmediato, cargas y jalr.",
  S: "Almacenamientos: el inmediato se parte en dos para dejar rs1 y rs2 en su lugar.",
  B: "Variante de S para saltos condicionales: inmediato en múltiplos de 2 (±4 KiB).",
  U: "Inmediato de 20 bits en la parte alta (lui, auipc).",
  J: "Variante de U para jal: inmediato en múltiplos de 2 (±1 MiB).",
};

// Cómo se forma el inmediato de 32 bits de cada tipo (Figura "Types of immediate produced by RISC-V instructions").
// Cada pieza: [bits del inmediato, origen en la instrucción]
export const IMM_LAYOUT = {
  I: [["31–11", "[31] signo"], ["10–5", "[30:25]"], ["4–1", "[24:21]"], ["0", "[20]"]],
  S: [["31–11", "[31] signo"], ["10–5", "[30:25]"], ["4–1", "[11:8]"], ["0", "[7]"]],
  B: [["31–12", "[31] signo"], ["11", "[7]"], ["10–5", "[30:25]"], ["4–1", "[11:8]"], ["0", "0"]],
  U: [["31", "[31]"], ["30–20", "[30:20]"], ["19–12", "[19:12]"], ["11–0", "0"]],
  J: [["31–20", "[31] signo"], ["19–12", "[19:12]"], ["11", "[20]"], ["10–5", "[30:25]"], ["4–1", "[24:21]"], ["0", "0"]],
};

// Secciones del capítulo, en el orden del documento
export const SECTIONS = [
  { id: "alu-imm", title: "Operaciones con inmediato", spec: "1.1.4.1",
    intro: "Usan el formato I (o U para lui/auipc). Ninguna instrucción entera produce excepciones aritméticas: el desbordamiento se ignora y se guardan los 32 bits bajos del resultado." },
  { id: "alu-reg", title: "Operaciones entre registros", spec: "1.1.4.2",
    intro: "Usan el formato R. funct7 y funct3 eligen la operación; el bit 30 distingue add/sub y srl/sra." },
  { id: "jump", title: "Saltos incondicionales", spec: "1.1.5.1",
    intro: "No hay ranura de retardo (delay slot). Ambas guardan pc+4 en rd; con rd = x0 el enlace se descarta. Si el destino no está alineado a 4 bytes se produce una excepción de dirección de instrucción desalineada." },
  { id: "branch", title: "Saltos condicionales", spec: "1.1.5.2",
    intro: "Formato B. Comparan rs1 y rs2 y, si se cumple la condición, saltan a pc + desplazamiento (múltiplo de 2, ±4 KiB). bgt, bgtu, ble y bleu se obtienen intercambiando los operandos de blt, bltu, bge y bgeu." },
  { id: "mem", title: "Cargas y almacenamientos", spec: "1.1.6",
    intro: "Arquitectura load-store: solo estas instrucciones acceden a memoria. Dirección efectiva = rs1 + inmediato de 12 bits con signo. Espacio de 32 bits direccionado por byte. Los accesos alineados nunca causan excepción por desalineación." },
  { id: "fence", title: "Orden de memoria", spec: "1.1.7",
    intro: "FENCE ordena los accesos a memoria (R, W) y a dispositivos (I, O) entre hilos y dispositivos externos. pred y succ indican qué accesos anteriores y posteriores quedan ordenados." },
  { id: "sys", title: "Llamada al entorno y punto de ruptura", spec: "1.1.8",
    intro: "Instrucciones SYSTEM. Ambas causan una trampa precisa solicitada por el programa." },
];

// Instrucciones RV32I. f7 en las de formato R/SH; f12 en ECALL/EBREAK.
export const INSTRUCTIONS = [
  // ---- operaciones con inmediato
  { m: "addi", sec: "alu-imm", fmt: "I", op: 0b0010011, f3: 0, syntax: "addi rd, rs1, imm", rtl: "rd ← rs1 + sext(imm)",
    desc: "Suma el inmediato de 12 bits con signo a rs1. El desbordamiento se ignora. addi rd, rs1, 0 es la pseudoinstrucción mv." },
  { m: "slti", sec: "alu-imm", fmt: "I", op: 0b0010011, f3: 2, syntax: "slti rd, rs1, imm", rtl: "rd ← (rs1 < sext(imm)) ? 1 : 0",
    desc: "Pone 1 en rd si rs1 es menor que el inmediato, comparando con signo; si no, 0." },
  { m: "sltiu", sec: "alu-imm", fmt: "I", op: 0b0010011, f3: 3, syntax: "sltiu rd, rs1, imm", rtl: "rd ← (rs1 <u sext(imm)) ? 1 : 0",
    desc: "Como slti, pero sin signo. El inmediato se extiende con signo y luego se compara como número sin signo. sltiu rd, rs, 1 es seqz (1 si rs = 0)." },
  { m: "xori", sec: "alu-imm", fmt: "I", op: 0b0010011, f3: 4, syntax: "xori rd, rs1, imm", rtl: "rd ← rs1 ^ sext(imm)",
    desc: "XOR bit a bit con el inmediato. xori rd, rs1, -1 es not (complemento bit a bit)." },
  { m: "ori", sec: "alu-imm", fmt: "I", op: 0b0010011, f3: 6, syntax: "ori rd, rs1, imm", rtl: "rd ← rs1 | sext(imm)",
    desc: "OR bit a bit con el inmediato extendido con signo." },
  { m: "andi", sec: "alu-imm", fmt: "I", op: 0b0010011, f3: 7, syntax: "andi rd, rs1, imm", rtl: "rd ← rs1 & sext(imm)",
    desc: "AND bit a bit con el inmediato extendido con signo." },
  { m: "slli", sec: "alu-imm", fmt: "SH", op: 0b0010011, f3: 1, f7: 0b0000000, syntax: "slli rd, rs1, shamt", rtl: "rd ← rs1 << shamt",
    desc: "Desplazamiento lógico a la izquierda por una constante. La cantidad (shamt) son los 5 bits bajos del campo del inmediato; se insertan ceros." },
  { m: "srli", sec: "alu-imm", fmt: "SH", op: 0b0010011, f3: 5, f7: 0b0000000, syntax: "srli rd, rs1, shamt", rtl: "rd ← rs1 >>u shamt",
    desc: "Desplazamiento lógico a la derecha: entran ceros por la izquierda." },
  { m: "srai", sec: "alu-imm", fmt: "SH", op: 0b0010011, f3: 5, f7: 0b0100000, syntax: "srai rd, rs1, shamt", rtl: "rd ← rs1 >>s shamt",
    desc: "Desplazamiento aritmético a la derecha: se copia el bit de signo. El bit 30 de la instrucción distingue srai de srli." },
  { m: "lui", sec: "alu-imm", fmt: "U", op: 0b0110111, syntax: "lui rd, imm", rtl: "rd ← imm << 12",
    desc: "Carga el inmediato de 20 bits en los bits 31–12 de rd y pone en cero los 12 bits bajos. Con addi permite formar cualquier constante de 32 bits." },
  { m: "auipc", sec: "alu-imm", fmt: "U", op: 0b0010111, syntax: "auipc rd, imm", rtl: "rd ← pc + (imm << 12)",
    desc: "Suma al pc de la propia auipc el inmediato de 20 bits desplazado 12 lugares. Sirve para direcciones relativas al pc; con jalr alcanza cualquier dirección de 32 bits." },
  // ---- operaciones entre registros
  { m: "add", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 0, f7: 0b0000000, syntax: "add rd, rs1, rs2", rtl: "rd ← rs1 + rs2",
    desc: "Suma. El desbordamiento se ignora y se escriben los 32 bits bajos." },
  { m: "sub", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 0, f7: 0b0100000, syntax: "sub rd, rs1, rs2", rtl: "rd ← rs1 − rs2",
    desc: "Resta rs2 de rs1. El desbordamiento se ignora. sub rd, x0, rs es neg." },
  { m: "sll", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 1, f7: 0b0000000, syntax: "sll rd, rs1, rs2", rtl: "rd ← rs1 << rs2[4:0]",
    desc: "Desplazamiento lógico a la izquierda; la cantidad son los 5 bits bajos de rs2." },
  { m: "slt", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 2, f7: 0b0000000, syntax: "slt rd, rs1, rs2", rtl: "rd ← (rs1 < rs2) ? 1 : 0",
    desc: "Comparación con signo: 1 si rs1 < rs2, si no 0." },
  { m: "sltu", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 3, f7: 0b0000000, syntax: "sltu rd, rs1, rs2", rtl: "rd ← (rs1 <u rs2) ? 1 : 0",
    desc: "Comparación sin signo. sltu rd, x0, rs pone 1 si rs ≠ 0 (pseudoinstrucción snez)." },
  { m: "xor", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 4, f7: 0b0000000, syntax: "xor rd, rs1, rs2", rtl: "rd ← rs1 ^ rs2", desc: "XOR bit a bit." },
  { m: "srl", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 5, f7: 0b0000000, syntax: "srl rd, rs1, rs2", rtl: "rd ← rs1 >>u rs2[4:0]",
    desc: "Desplazamiento lógico a la derecha; la cantidad son los 5 bits bajos de rs2." },
  { m: "sra", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 5, f7: 0b0100000, syntax: "sra rd, rs1, rs2", rtl: "rd ← rs1 >>s rs2[4:0]",
    desc: "Desplazamiento aritmético a la derecha (conserva el signo)." },
  { m: "or", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 6, f7: 0b0000000, syntax: "or rd, rs1, rs2", rtl: "rd ← rs1 | rs2", desc: "OR bit a bit." },
  { m: "and", sec: "alu-reg", fmt: "R", op: 0b0110011, f3: 7, f7: 0b0000000, syntax: "and rd, rs1, rs2", rtl: "rd ← rs1 & rs2", desc: "AND bit a bit." },
  // ---- saltos
  { m: "jal", sec: "jump", fmt: "J", op: 0b1101111, syntax: "jal rd, offset", rtl: "rd ← pc + 4;  pc ← pc + sext(offset)",
    desc: "Salta a pc + desplazamiento (múltiplo de 2, ±1 MiB) y guarda la dirección de retorno. Convención: rd = x1 (ra) para llamar a funciones; jal x0, destino es la pseudoinstrucción j." },
  { m: "jalr", sec: "jump", fmt: "I", op: 0b1100111, f3: 0, syntax: "jalr rd, offset(rs1)", rtl: "t ← pc + 4;  pc ← (rs1 + sext(offset)) & ~1;  rd ← t",
    desc: "Salto indirecto: el destino es rs1 + inmediato con el bit 0 en cero (el inmediato no se multiplica por 2). jalr x0, 0(x1) es ret; jalr x0, 0(rs) es jr." },
  { m: "beq", sec: "branch", fmt: "B", op: 0b1100011, f3: 0, syntax: "beq rs1, rs2, offset", rtl: "if (rs1 == rs2) pc ← pc + sext(offset)", desc: "Salta si son iguales." },
  { m: "bne", sec: "branch", fmt: "B", op: 0b1100011, f3: 1, syntax: "bne rs1, rs2, offset", rtl: "if (rs1 ≠ rs2) pc ← pc + sext(offset)", desc: "Salta si son distintos." },
  { m: "blt", sec: "branch", fmt: "B", op: 0b1100011, f3: 4, syntax: "blt rs1, rs2, offset", rtl: "if (rs1 < rs2) pc ← pc + sext(offset)", desc: "Salta si rs1 < rs2 (con signo). bgt rs1, rs2 se escribe como blt rs2, rs1." },
  { m: "bge", sec: "branch", fmt: "B", op: 0b1100011, f3: 5, syntax: "bge rs1, rs2, offset", rtl: "if (rs1 ≥ rs2) pc ← pc + sext(offset)", desc: "Salta si rs1 ≥ rs2 (con signo). ble rs1, rs2 se escribe como bge rs2, rs1." },
  { m: "bltu", sec: "branch", fmt: "B", op: 0b1100011, f3: 6, syntax: "bltu rs1, rs2, offset", rtl: "if (rs1 <u rs2) pc ← pc + sext(offset)", desc: "Salta si rs1 < rs2 (sin signo). Útil para comprobar límites de arreglos." },
  { m: "bgeu", sec: "branch", fmt: "B", op: 0b1100011, f3: 7, syntax: "bgeu rs1, rs2, offset", rtl: "if (rs1 ≥u rs2) pc ← pc + sext(offset)", desc: "Salta si rs1 ≥ rs2 (sin signo)." },
  // ---- memoria
  { m: "lb", sec: "mem", fmt: "I", op: 0b0000011, f3: 0, syntax: "lb rd, offset(rs1)", rtl: "rd ← sext(M[rs1 + sext(offset)][7:0])", desc: "Carga un byte y lo extiende con signo." },
  { m: "lh", sec: "mem", fmt: "I", op: 0b0000011, f3: 1, syntax: "lh rd, offset(rs1)", rtl: "rd ← sext(M[rs1 + sext(offset)][15:0])", desc: "Carga media palabra (16 bits) y la extiende con signo." },
  { m: "lw", sec: "mem", fmt: "I", op: 0b0000011, f3: 2, syntax: "lw rd, offset(rs1)", rtl: "rd ← M[rs1 + sext(offset)][31:0]", desc: "Carga una palabra de 32 bits." },
  { m: "lbu", sec: "mem", fmt: "I", op: 0b0000011, f3: 4, syntax: "lbu rd, offset(rs1)", rtl: "rd ← zext(M[rs1 + sext(offset)][7:0])", desc: "Carga un byte y lo extiende con ceros." },
  { m: "lhu", sec: "mem", fmt: "I", op: 0b0000011, f3: 5, syntax: "lhu rd, offset(rs1)", rtl: "rd ← zext(M[rs1 + sext(offset)][15:0])", desc: "Carga media palabra y la extiende con ceros." },
  { m: "sb", sec: "mem", fmt: "S", op: 0b0100011, f3: 0, syntax: "sb rs2, offset(rs1)", rtl: "M[rs1 + sext(offset)][7:0] ← rs2[7:0]", desc: "Guarda el byte bajo de rs2." },
  { m: "sh", sec: "mem", fmt: "S", op: 0b0100011, f3: 1, syntax: "sh rs2, offset(rs1)", rtl: "M[rs1 + sext(offset)][15:0] ← rs2[15:0]", desc: "Guarda los 16 bits bajos de rs2." },
  { m: "sw", sec: "mem", fmt: "S", op: 0b0100011, f3: 2, syntax: "sw rs2, offset(rs1)", rtl: "M[rs1 + sext(offset)][31:0] ← rs2", desc: "Guarda la palabra completa de rs2." },
  // ---- orden de memoria
  { m: "fence", sec: "fence", fmt: "FENCE", op: 0b0001111, f3: 0, fm: 0b0000, syntax: "fence pred, succ", rtl: "ordenar accesos pred antes que succ",
    desc: "Ningún otro hilo ni dispositivo observa un acceso del conjunto succ (posteriores) antes que uno del conjunto pred (anteriores). Cada conjunto combina I, O, R, W. rs1 y rd están reservados y deben ser x0." },
  { m: "fence.tso", variant: true, sec: "fence", fmt: "FENCE", op: 0b0001111, f3: 0, fm: 0b1000, pred: 0b0011, succ: 0b0011, syntax: "fence.tso", rtl: "fence rw,rw sin ordenar escritura→lectura",
    desc: "Ordena las cargas antes de todos los accesos posteriores y los almacenamientos antes de los almacenamientos posteriores (modelo TSO). Puede implementarse como fence rw,rw." },
  // ---- sistema
  { m: "ecall", sec: "sys", fmt: "SYS", op: 0b1110011, f3: 0, f12: 0, syntax: "ecall", rtl: "trampa: solicitud al entorno de ejecución",
    desc: "Pide un servicio al entorno de ejecución (por ejemplo, al sistema operativo). La forma de pasar parámetros la define el entorno (EEI)." },
  { m: "ebreak", sec: "sys", fmt: "SYS", op: 0b1110011, f3: 0, f12: 1, syntax: "ebreak", rtl: "trampa: devolver el control al depurador",
    desc: "Usada por los depuradores. La secuencia slli x0,x0,0x1f · ebreak · srai x0,x0,7 se reserva para semihosting." },
];

// Pseudoinstrucciones mencionadas en el capítulo (y otras habituales que acepta el ensamblador de la app)
export const PSEUDOS = [
  { p: "nop", base: "addi x0, x0, 0", spec: true },
  { p: "mv rd, rs", base: "addi rd, rs, 0", spec: true },
  { p: "not rd, rs", base: "xori rd, rs, -1", spec: true },
  { p: "neg rd, rs", base: "sub rd, x0, rs" },
  { p: "seqz rd, rs", base: "sltiu rd, rs, 1", spec: true },
  { p: "snez rd, rs", base: "sltu rd, x0, rs", spec: true },
  { p: "li rd, imm", base: "addi rd, x0, imm  ·  lui + addi si no cabe en 12 bits" },
  { p: "j offset", base: "jal x0, offset", spec: true },
  { p: "jal offset", base: "jal x1, offset" },
  { p: "jr rs", base: "jalr x0, 0(rs)", spec: true },
  { p: "ret", base: "jalr x0, 0(x1)", spec: true },
  { p: "beqz rs, offset", base: "beq rs, x0, offset" },
  { p: "bnez rs, offset", base: "bne rs, x0, offset" },
  { p: "bgt rs, rt, offset", base: "blt rt, rs, offset", spec: true },
  { p: "ble rs, rt, offset", base: "bge rt, rs, offset", spec: true },
  { p: "bgtu rs, rt, offset", base: "bltu rt, rs, offset", spec: true },
  { p: "bleu rs, rt, offset", base: "bgeu rt, rs, offset", spec: true },
];

// Pistas para la pila de direcciones de retorno (RAS) según rd y rs1 de jalr
export const RAS_HINTS = [
  ["no", "no", "—", "Ninguna"],
  ["no", "sí", "—", "Sacar (pop)"],
  ["sí", "no", "—", "Meter (push)"],
  ["sí", "sí", "no", "Sacar y luego meter"],
  ["sí", "sí", "sí", "Meter"],
];
