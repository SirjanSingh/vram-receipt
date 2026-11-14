import { WIDTH } from "./receipt";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface SvgOptions {
  fontFamily: string;
  /** Optional @font-face source for browsers (a data: URL). resvg takes the font as a buffer instead. */
  fontFaceSrc?: string;
}

/**
 * One template for the CLI (resvg-js) and the page. Thermal-paper look:
 * off-white paper, near-black ink, a torn bottom edge. No brand colours.
 */
export function receiptSvg(lines: string[], opts: SvgOptions): string {
  const fontSize = 20;
  const charW = fontSize * 0.6; // JetBrains Mono advance width
  const lineH = 30;
  const padX = 44;
  const padTop = 54;
  const padBottom = 64;
  const desk = 28; // margin of "desk" colour around the paper
  const paperW = Math.round(WIDTH * charW + padX * 2);
  const paperH = padTop + lines.length * lineH + padBottom;
  const W = paperW + desk * 2;
  const H = paperH + desk * 2;

  // Torn edge along the bottom of the paper.
  const teeth = 34;
  const step = paperW / teeth;
  let edge = "";
  for (let i = 0; i <= teeth; i++) {
    const x = (paperW - i * step).toFixed(1);
    const y = i % 2 === 0 ? paperH : paperH - 9;
    edge += ` L${x} ${y}`;
  }
  const paper = `M0 0 H${paperW} V${paperH}${edge} Z`;

  const text = lines
    .map((l, i) => {
      const y = padTop + i * lineH;
      // Regular weight only: one bundled face, so the CLI and the page render identically.
      return `<text x="${padX}" y="${y}" xml:space="preserve">${esc(l)}</text>`;
    })
    .join("\n    ");
  const face = opts.fontFaceSrc
    ? `<style>@font-face{font-family:"${opts.fontFamily}";src:url(${opts.fontFaceSrc}) format("truetype");}</style>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="VRAM receipt">
  ${face}
  <rect width="${W}" height="${H}" fill="#d9d2c3"/>
  <g transform="translate(${desk} ${desk})">
    <path d="${paper}" fill="#1f1a14" opacity="0.18" transform="translate(5 7)"/>
    <path d="${paper}" fill="#fbf8f1"/>
    <g font-family="${opts.fontFamily}, monospace" font-size="${fontSize}" fill="#1c1b19">
    ${text}
    </g>
  </g>
</svg>`;
}
