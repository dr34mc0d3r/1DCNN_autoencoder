/**
 * exportUtils.js — helpers for capturing charts and windows as PNG data URLs.
 *
 * captureRechartsSvg  — for any Recharts SVG-based chart
 * renderWindowsCanvas — for the WindowsPage (raw 0-255 pixel arrays)
 * captureElement      — for CSS-grid / non-SVG elements (uses html2canvas)
 */

/**
 * Find the first <svg> inside containerRef.current, render it onto a dark canvas,
 * and return a PNG data URL.
 */
export async function captureRechartsSvg(containerRef, bgColor = "#030712") {
  const container = containerRef?.current;
  if (!container) return null;
  const svg = container.querySelector("svg");
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const w = Math.round(rect.width)  || 800;
  const h = Math.round(rect.height) || 300;

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Render an array of raw window pixel grids (values 0-255) to a single canvas.
 *
 * layout: "contact"   → size=2, grid of ~40 cols
 *         "heatmap"   → size=1, single row
 *         "thumbnail" → size=1, dense grid
 */
export function renderWindowsCanvas(windows, windowSize, nFeatures, layout = "contact") {
  if (!windows || !windows.length) return null;
  const n    = windows.length;
  const size = layout === "contact" ? 2 : 1;
  const cellW = nFeatures * size;
  const cellH = windowSize * size;
  const gap   = layout === "thumbnail" ? 0 : 1;

  const cols = layout === "heatmap"
    ? n
    : Math.min(n, Math.floor(2560 / (cellW + gap)));
  const rows = Math.ceil(n / cols);

  const canvas = document.createElement("canvas");
  canvas.width  = cols * cellW + Math.max(0, cols - 1) * gap;
  canvas.height = rows * cellH + Math.max(0, rows - 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  windows.forEach((win, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x0  = col * (cellW + gap);
    const y0  = row * (cellH + gap);
    const imgData = ctx.createImageData(cellW, cellH);

    for (let r = 0; r < windowSize; r++) {
      for (let c = 0; c < nFeatures; c++) {
        const v = win[r]?.[c] ?? 0;
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const i4 = ((r * size + dy) * cellW + c * size + dx) * 4;
            imgData.data[i4]     = v;
            imgData.data[i4 + 1] = v;
            imgData.data[i4 + 2] = v;
            imgData.data[i4 + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imgData, x0, y0);
  });

  return canvas.toDataURL("image/png");
}

/**
 * Capture an arbitrary DOM element as PNG using html2canvas.
 * Used only for the HourHeatmap (CSS grid — no SVG to grab).
 * html2canvas is loaded lazily to avoid bloating the main bundle.
 */
export async function captureElement(elementRef, bgColor = "#030712") {
  const el = elementRef?.current;
  if (!el) return null;
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, {
    backgroundColor: bgColor,
    scale: 1.5,
    logging: false,
  });
  return canvas.toDataURL("image/png");
}
