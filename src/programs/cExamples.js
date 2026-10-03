// Ejemplos en C para el compilador didáctico (solo usa las 13 instrucciones del libro)
export const C_EXAMPLES = [
  {
    id: "suma",
    name: "Suma de un arreglo",
    src: `// Suma de los elementos de un arreglo.
// Las variables globales quedan en memoria desde 0x100.
int v[6] = {3, 8, -2, 7, 1, 7};
int total;

int main(void) {
    int s = 0;
    for (int i = 0; i < 6; i++)
        s += v[i];
    total = s;          // sw en la dirección de total
    return s;           // el resultado queda en a0 (x10)
}
`,
  },
  {
    id: "fib",
    name: "Fibonacci",
    src: `// Primeros 12 términos de Fibonacci en un arreglo.
int f[12];

int main(void) {
    f[0] = 0;
    f[1] = 1;
    for (int i = 2; i < 12; i++)
        f[i] = f[i - 1] + f[i - 2];
    return f[11];       // 89
}
`,
  },
  {
    id: "mult",
    name: "Multiplicar con sumas",
    src: `// El procesador no tiene mul: a * b con un lazo de sumas.
// Con una constante (a * 10) el compilador usa desplazamientos y sumas.
int main(void) {
    int a = 7, b = 6;
    int p = 0;
    while (b > 0) {
        p = p + a;
        b--;
    }
    int q = a * 10;     // constante: sumas y duplicaciones
    return p + q;       // 42 + 70 = 112
}
`,
  },
  {
    id: "max",
    name: "Máximo y conteo",
    src: `// Busca el máximo y cuenta los valores pares.
#define N 8
int datos[N] = {12, -4, 33, 7, 18, 33, 0, 21};
int maximo, pares;

int main(void) {
    int m = datos[0];
    int c = 0;
    for (int i = 0; i < N; i++) {
        if (datos[i] > m) m = datos[i];
        if ((datos[i] & 1) == 0) c++;
    }
    maximo = m;         // 33
    pares = c;          // 4
    return m;
}
`,
  },
  {
    id: "gcc",
    name: "Para GCC (_start sin retorno)",
    src: `// Para compilar con GCC (Compiler Explorer): use _start y termine en un lazo,
// así no aparece ret (jalr). Escriba el resultado en una dirección fija.
// Compare: con -O1 GCC calcula la suma al compilar (li a5,55); con -O0 genera
// el lazo, pero usa blt/bge, que este procesador no tiene.
void _start(void) {
    volatile int *res = (int *)100;
    int s = 0;
    for (int i = 10; i != 0; i--)
        s += i;
    *res = s;           // Mem[100] = 55
    for (;;) ;
}
`,
  },
];
