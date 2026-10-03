# RISC-V Playground — ruta de datos single-cycle

App en React + Vite para ver, ciclo a ciclo, cómo fluyen los datos por el procesador single-cycle de Harris & Harris (sección 7.3). Usa el mismo diagrama de las diapositivas.

- **Tres entradas:** C/C++, ensamblador y código máquina. Al compilar o ensamblar, la pestaña Código máquina se llena sola (una palabra por línea, lista para `$readmemh`).
- **Compilador didáctico de C** (`src/sim/minic.js`): genera solo las 13 instrucciones del procesador. Lo que falta se arma con lo que hay: `bne` → `beq` + `jal`, `a ^ b` → `(a | b) - (a & b)`, `x << k` y `x * constante` → sumas, constantes grandes sin `lui`. Admite `int`, arreglos globales y locales, punteros, `if/else`, `while`, `do`, `for`, `break`, `continue` y `#define`. No admite llamadas (necesitan `jalr`), división, `>>` ni `char`/`short`, y lo dice con el número de línea.
- **GCC real** desde la misma pestaña, a través de Compiler Explorer (C o C++, `-O0`…`-Os`). Necesita Internet y la app en local (`npm run dev`); en la página publicada el navegador bloquea la conexión.
- **Formato de la instrucción:** clic en cualquier instrucción del listado para ver sus 32 bits separados por campos (op y funct en verde azulado, registros en azul, inmediato en ámbar), el valor de cada campo y cómo Extend arma el inmediato a partir de sus piezas. Incluye la tabla de los seis formatos.
- **Interfaz estilo VS Code:** barra de depuración en la barra de título (ejecutar/pausa F5, paso F10, atrás, reiniciar Mayús+F5, velocidad); barra de actividades con tres vistas (Explorador, Simulación, Compilador); editor de código (CodeMirror) con resaltado de C, ensamblador RISC-V y hexadecimal, números de línea, errores subrayados y la línea en ejecución marcada, también en el C original; ruta de datos al lado; panel inferior con Formato, Señales, Problemas y Salida; barra de estado. Las pestañas se abren y se cierran como en VS Code (× o clic con la rueda; un punto indica cambios sin compilar); compilar main.c abre programa.s, y el Explorador lista los editores abiertos. Las divisiones se arrastran y todo se puede ocultar; la app recuerda el diseño.
- **Vista Simulación:** registros, memoria de instrucciones (con la instrucción del PC marcada y puntos de interrupción con clic en el margen) y memoria de datos.
- **Exportar el diagrama:** "Descargar SVG" guarda la ruta de datos del ciclo actual, con el camino activo resaltado y en tema claro, lista para diapositivas o Inkscape. "Copiar SVG" la deja en el portapapeles.
- **Ensamblador integrado:** acepta RV32I completo, etiquetas y pseudoinstrucciones (`li`, `mv`, `j`, `nop`, `beqz`, `bnez`…). También acepta directamente la salida de `gcc -S` o de Compiler Explorer.
- **Carga de código máquina:** una palabra hexadecimal por línea, como `riscvtest.txt`.
- **En cada ciclo:**
  - el camino activo resaltado en el diagrama;
  - los valores de todas las señales (pase el cursor por un cable o por una ficha);
  - las señales de control y una explicación paso a paso;
  - el banco de registros y la memoria de datos.
- **Paso adelante y atrás, ejecución continua y estado inicial configurable:** por ejemplo, `# init: x5=6, x9=0x2004, mem[0x2000]=10` y `.org 0x1000`.
- **Ejemplos incluidos:** Figura 7.2 del libro, `riscvtest` (Figura 7.64) y suma de un arreglo.

El procesador ejecuta solo las instrucciones del libro: `lw`, `sw`, `add`, `sub`, `and`, `or`, `slt`, `addi`, `andi`, `ori`, `slti`, `beq` y `jal`. Cualquier otra se marca en el listado y detiene la simulación con un mensaje.

## En línea

Cada push a `main` publica la app en GitHub Pages con `.github/workflows/pages.yml` (activar una vez en **Settings → Pages → Source: GitHub Actions**): https://edison-enriquez.github.io/riscv-playground/

## Uso

```bash
npm install
npm run dev            # servidor de desarrollo
npm test               # pruebas del ensamblador y del modelo (Node)
npm run build          # dist/ para publicar (GitHub Pages, etc.)
npm run build:single   # dist-single/index.html: un solo archivo, se abre sin servidor
```

## Estructura

```
src/sim/isa.js          ensamblador, desensamblador, tabla RV32I
src/sim/minic.js        compilador didáctico de C a las 13 instrucciones
src/sim/godbolt.js      compilación con GCC vía Compiler Explorer
src/components/InstrAnatomy.jsx   bits y campos de una instrucción
src/components/CodeEditor.jsx     editor CodeMirror con lenguajes C, RISC-V y hex
src/sim/svgExport.js    exportación del diagrama a SVG
src/sim/cpu.js          Main Decoder, ALU Decoder, Extend, ALU, paso de un ciclo y caminos activos
src/components/Datapath.jsx   diagrama SVG (geometría de las diapositivas)
src/App.jsx             interfaz
src/programs/examples.js      programas de ejemplo
tests/sim.test.mjs      ensamblador (riscvtest.txt, Mem[100] = 25) y compilador de C (8 programas ejecutados en el modelo)
tools/c2hex.sh          compila C a hexadecimal y avisa qué instrucciones no soporta el procesador
```

## Compilar C para este procesador

Use GCC para RISC-V con el conjunto base de enteros:

```bash
riscv64-unknown-elf-gcc -march=rv32i -mabi=ilp32 -O1 -nostdlib -ffreestanding -S programa.c
```

O use el script incluido, que genera el archivo hexadecimal y lista las instrucciones usadas:

```bash
tools/c2hex.sh tools/ejemplos_c/suma.c
```

`-march=rv32i` quita la multiplicación y la división (extensión M), pero no restringe el código al subconjunto del libro. Incluso un lazo simple produce `bne` (ver `tools/ejemplos_c/suma.c`). Además:

- una llamada a función o un `return` usan `jalr`;
- una constante de más de 12 bits usa `lui`;
- los desplazamientos usan `slli`/`srli`.

Hay tres caminos:

1. **Escribir en ensamblador** la parte que se quiere ver en el procesador.
2. **Usar el compilador didáctico de la app** (pestaña C / C++, botón "Compilar para este procesador").
3. **Extender el procesador** con las instrucciones que faltan. `bne`, `lui` y `jalr` son los Ejercicios 7.3 y 7.4 del libro, y es un buen proyecto para los estudiantes.

Sin instalar nada, [Compiler Explorer](https://godbolt.org) con el compilador "RISC-V rv32gc gcc" y las opciones `-march=rv32i -mabi=ilp32 -O1` muestra el ensamblador. Ese texto se puede pegar directamente en la app.
