// Programas de ejemplo para la app
export const EXAMPLES = [
  {
    id: "fig72",
    name: "Figura 7.2 (libro)",
    description: "El programa con el que el libro construye la ruta de datos: lw, sw, or y beq.",
    src: `# Programa de la Figura 7.2 (Harris & Harris)
# init: x5=6, x9=0x2004, mem[0x2000]=10
.org 0x1000
L7:   lw   x6, -4(x9)     # x6 = Mem[0x2000] = 10
      sw   x6, 8(x9)      # Mem[0x200C] = 10
      or   x4, x5, x6     # x4 = 6 | 10 = 14
      beq  x4, x4, L7     # vuelve siempre a L7
`,
  },
  {
    id: "riscvtest",
    name: "riscvtest (Figura 7.64)",
    description: "Prueba todas las instrucciones; si todo funciona, escribe 25 en la dirección 100.",
    src: `# riscvtest.s — Harris & Harris, Figura 7.64
main:   addi x2, x0, 5           # x2 = 5
        addi x3, x0, 12          # x3 = 12
        addi x7, x3, -9          # x7 = (12 - 9) = 3
        or   x4, x7, x2          # x4 = (3 OR 5) = 7
        and  x5, x3, x4          # x5 = (12 AND 7) = 4
        add  x5, x5, x4          # x5 = 4 + 7 = 11
        beq  x5, x7, end         # no se debe tomar
        slt  x4, x3, x4          # x4 = (12 < 7) = 0
        beq  x4, x0, around      # se debe tomar
        addi x5, x0, 0           # no se debe ejecutar
around: slt  x4, x7, x2          # x4 = (3 < 5) = 1
        add  x7, x4, x5          # x7 = (1 + 11) = 12
        sub  x7, x7, x2          # x7 = (12 - 5) = 7
        sw   x7, 84(x3)          # [96] = 7
        lw   x2, 96(x0)          # x2 = [96] = 7
        add  x9, x2, x5          # x9 = (7 + 11) = 18
        jal  x3, end             # salta a end, x3 = 0x44
        addi x2, x0, 1           # no se debe ejecutar
end:    add  x2, x2, x9          # x2 = (7 + 18) = 25
        sw   x2, 0x20(x3)        # [100] = 25
done:   beq  x2, x2, done        # lazo infinito
`,
  },
  {
    id: "suma",
    name: "Suma de un arreglo",
    description: "Recorre un arreglo en memoria con lw y un lazo hecho solo con beq y jal.",
    src: `# Suma de 4 números guardados desde la dirección 0x100
# init: mem[0x100]=3, mem[0x104]=5, mem[0x108]=7, mem[0x10C]=9
        addi x10, x0, 0x100      # x10 = dirección del arreglo
        addi x11, x0, 4          # x11 = elementos restantes
        addi x12, x0, 0          # x12 = suma
lazo:   beq  x11, x0, fin        # ¿quedan elementos?
        lw   x13, 0(x10)         # x13 = A[i]
        add  x12, x12, x13       # suma += A[i]
        addi x10, x10, 4         # siguiente palabra
        addi x11, x11, -1        # un elemento menos
        jal  x0, lazo            # repetir (j lazo)
fin:    sw   x12, 0x200(x0)      # Mem[0x200] = 24
done:   beq  x0, x0, done
`,
  },
];
