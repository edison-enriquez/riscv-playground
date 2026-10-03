// Exporta el diagrama SVG como archivo independiente: copia los estilos calculados
// (colores del tema, grosores, tipografía) en atributos, para que se vea igual fuera de la app.
const PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap", "stroke-dasharray", "stroke-opacity",
  "opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline",
];

export function svgToString(svg, { theme = "light" } = {}) {
  const root = document.documentElement;
  const prev = root.getAttribute("data-theme");
  root.classList.add("no-anim");
  if (theme) root.setAttribute("data-theme", theme);
  try {
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll("*")];
    const dst = [clone, ...clone.querySelectorAll("*")];
    const drop = [];
    src.forEach((el, i) => {
      const d = dst[i];
      if (el.classList?.contains("wire-hit") || el.tagName.toLowerCase() === "title") { drop.push(d); return; }
      const cs = getComputedStyle(el);
      let style = "";
      for (const p of PROPS) {
        const v = cs.getPropertyValue(p);
        if (v && v !== "normal" && v !== "auto") style += `${p}:${v};`;
      }
      d.removeAttribute("class");
      if (i > 0) d.setAttribute("style", style);
    });
    drop.forEach((d) => d.remove());
    const v0 = svg.viewBox.baseVal;
    const vb = { x: v0.x - 16, y: v0.y - 12, width: v0.width + 56, height: v0.height + 24 }; // margen para las etiquetas del borde
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
    clone.setAttribute("width", vb.width);
    clone.setAttribute("height", vb.height);
    clone.removeAttribute("style");
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", vb.x); bg.setAttribute("y", vb.y);
    bg.setAttribute("width", vb.width); bg.setAttribute("height", vb.height);
    bg.setAttribute("fill", getComputedStyle(root).getPropertyValue("--surface").trim() || "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  } finally {
    root.classList.remove("no-anim");
    if (prev === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prev);
  }
}

export function downloadText(text, filename, type = "image/svg+xml") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
