#!/usr/bin/env bash
# Compila un programa en C a código máquina RV32I, una palabra hexadecimal por línea
# (el mismo formato de riscvtest.txt), y avisa qué instrucciones no implementa el
# procesador single-cycle del libro.
#
# Uso: tools/c2hex.sh programa.c [salida.txt]
# Requiere: riscv64-unknown-elf-gcc (Ubuntu/Debian: apt install gcc-riscv64-unknown-elf)
set -e
SRC=${1:?"uso: $0 programa.c [salida.txt]"}
OUT=${2:-${SRC%.c}.txt}
CC=${CC:-riscv64-unknown-elf-gcc}
OBJDUMP=${OBJDUMP:-riscv64-unknown-elf-objdump}
OBJCOPY=${OBJCOPY:-riscv64-unknown-elf-objcopy}
TMP=$(mktemp -d)

# -march=rv32i  : solo el conjunto base de enteros (sin mul/div ni compresión)
# -mabi=ilp32   : int, long y punteros de 32 bits
# -nostdlib -ffreestanding : sin biblioteca estándar ni código de arranque
# -Ttext=0 -e _start       : el programa empieza en la dirección 0, como en imem
$CC -march=rv32i -mabi=ilp32 -O1 -nostdlib -ffreestanding -fno-pic \
    -Wl,-Ttext=0 -Wl,-e,_start -o "$TMP/prog.elf" "$SRC"
$OBJCOPY -O binary -j .text "$TMP/prog.elf" "$TMP/prog.bin"

# binario little-endian -> una palabra hexadecimal por línea
python3 - "$TMP/prog.bin" "$OUT" <<'PY'
import sys, struct
data = open(sys.argv[1], "rb").read()
data += b"\0" * (-len(data) % 4)
with open(sys.argv[2], "w") as f:
    for i in range(0, len(data), 4):
        f.write("%08X\n" % struct.unpack("<I", data[i:i+4])[0])
PY

echo "== Desensamblado ($OUT)"
$OBJDUMP -d -M no-aliases "$TMP/prog.elf" | grep -E '^\s+[0-9a-f]+:'
echo
echo "== Instrucciones usadas"
USED=$($OBJDUMP -d -M no-aliases "$TMP/prog.elf" | awk -F'\t' '/^ +[0-9a-f]+:/{split($3,a," "); print a[1]}' | sort | uniq -c)
echo "$USED"
SUP="lw sw add sub and or slt addi andi ori slti beq jal"
BAD=$(echo "$USED" | awk '{print $2}' | while read -r m; do [[ " $SUP " == *" $m "* ]] || echo "$m"; done | tr '\n' ' ')
if [ -n "$BAD" ]; then
  echo
  echo "AVISO: el procesador single-cycle del libro no implementa: $BAD"
  echo "       Reescriba esa parte en ensamblador o extienda el procesador (Ejercicios 7.3 y 7.4)."
fi
rm -rf "$TMP"
