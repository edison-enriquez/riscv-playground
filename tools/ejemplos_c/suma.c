// suma.c — Suma 1 + 2 + ... + 10 y escribe el resultado en la dirección 100.
// Se evita lo que el procesador del libro no tiene: multiplicación, división,
// llamadas a funciones (necesitan jalr) y constantes grandes (necesitan lui).
#define RESULTADO (*(volatile int *)100)

void _start(void) {
  volatile int n = 10;      // volatile: obliga al compilador a calcular de verdad
  int suma = 0;
  for (int i = n; i != 0; i--)
    suma += i;
  RESULTADO = suma;         // sw a la dirección 100
  while (1) ;               // lazo infinito: jal x0, 0
}
