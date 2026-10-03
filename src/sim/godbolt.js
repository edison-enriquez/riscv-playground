// Compilación con GCC real a través de la API pública de Compiler Explorer (godbolt.org).
// Necesita conexión a Internet. En la versión publicada como página única el navegador
// puede bloquear la conexión; con `npm run dev` funciona.
export const GCC_COMPILERS = {
  c: { id: "rv32-cgcc1430", name: "RISC-V rv32gc gcc 14.3 (C)" },
  cpp: { id: "rv32-gcc1430", name: "RISC-V rv32gc g++ 14.3 (C++)" },
};

export const GCC_FLAGS = "-march=rv32i -mabi=ilp32 -ffreestanding -fno-asynchronous-unwind-tables";

export async function compileWithGCC(source, lang = "c", opt = "-O1") {
  const comp = GCC_COMPILERS[lang] || GCC_COMPILERS.c;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(`https://godbolt.org/api/compiler/${comp.id}/compile`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        source,
        lang: lang === "cpp" ? "c++" : "c",
        options: {
          userArguments: `${GCC_FLAGS} ${opt}`,
          filters: { labels: true, directives: true, commentOnly: true, demangle: true, libraryCode: true },
        },
      }),
    });
  } catch (e) {
    throw new Error(
      "No se pudo conectar con Compiler Explorer. Si abrió la app publicada, el navegador bloquea conexiones externas: " +
        "ejecútela localmente (npm run dev) o pegue el ensamblador de godbolt.org en la pestaña Ensamblador."
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Compiler Explorer respondió ${res.status}`);
  const data = await res.json();
  const stderr = (data.stderr || []).map((l) => l.text).join("\n");
  if (data.code !== 0) throw new Error(stderr || "GCC no pudo compilar el programa");
  const asm = (data.asm || []).map((l) => l.text).join("\n");
  return { asm: `# Generado por ${comp.name} con ${GCC_FLAGS} ${opt}\n${asm}\n`, warnings: stderr };
}
