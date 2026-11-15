// The shareable "Thanks, Jensen" card: one SVG template for the CLI (resvg -> PNG) and the page.
// Constraints: resvg must render it, so only gradients, paths, rects, text and opacity. No filters,
// no masks, no external images. Text can't be measured in SVG, so every width that matters is
// computed from character counts in the monospace font (0.6 em per glyph), and the layout still
// holds if the display font is missing and the mono font stands in for it.
import type { Tier } from "./tiers";

export interface ShareCardInput {
  gpuModel: string;
  vramGb: number;
  ramGb: number | null;
  tier: Tier;
  /** Null when the person did not join the cluster. */
  rank: number | null;
  total: number | null;
  moreThanPct: number | null;
  date: string;
  /** Font family names available to the renderer. */
  fonts: { mono: string; display?: string };
  /** Browsers only: @font-face src values (data: URLs). */
  fontFaceSrc?: { mono?: string; display?: string };
}

export const SHARE_W = 1200;
export const SHARE_H = 630;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const fmtGb = (gb: number) => (Number.isInteger(gb) ? String(gb) : gb.toFixed(1));
const MONO_EM = 0.6;
const LEFT_W = 600; // usable width of the text column
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Darken or lighten a #rrggbb colour by mixing with black (t < 0) or white (t > 0). */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** A GPU package seen from above: substrate, die, sixteen 2 GB memory modules, lit up to your VRAM. */
function chipMotif(cx: number, cy: number, vramGb: number, color: string): string {
  const S = 372; // substrate size
  const half = S / 2;
  const die = 150;
  const filled = Math.min(16, Math.ceil(vramGb / 2));
  const out: string[] = [];

  out.push(`<circle cx="${cx}" cy="${cy}" r="300" fill="url(#sc-halo)"/>`);
  out.push(`<rect x="${cx - half}" y="${cy - half}" width="${S}" height="${S}" rx="22" fill="url(#sc-sub)" stroke="#3a3933" stroke-width="2"/>`);
  out.push(`<rect x="${cx - half + 12}" y="${cy - half + 12}" width="${S - 24}" height="${S - 24}" rx="14" fill="none" stroke="#2a2925" stroke-width="1.5"/>`);
  // Edge contacts.
  for (let i = 0; i < 15; i++) {
    const o = -half + 32 + i * ((S - 64) / 14);
    out.push(
      `<rect x="${cx + o - 4}" y="${cy - half - 7}" width="8" height="5" rx="1" fill="#4a483f"/>`,
      `<rect x="${cx + o - 4}" y="${cy + half + 2}" width="8" height="5" rx="1" fill="#4a483f"/>`,
      `<rect x="${cx - half - 7}" y="${cy + o - 4}" width="5" height="8" rx="1" fill="#4a483f"/>`,
      `<rect x="${cx + half + 2}" y="${cy + o - 4}" width="5" height="8" rx="1" fill="#4a483f"/>`,
    );
  }

  // Modules: four per side, clockwise from the top left.
  const MW = 54, MD = 34, GAP = 12, RING = 150;
  const run = 4 * MW + 3 * GAP;
  const mods: { x: number; y: number; w: number; h: number; ax: number; ay: number; bx: number; by: number }[] = [];
  for (let i = 0; i < 4; i++) { // top, left to right
    const x = cx - run / 2 + i * (MW + GAP);
    mods.push({ x, y: cy - RING - MD / 2, w: MW, h: MD, ax: x + MW / 2, ay: cy - RING + MD / 2, bx: x + MW / 2, by: cy - die / 2 });
  }
  for (let i = 0; i < 4; i++) { // right, top to bottom
    const y = cy - run / 2 + i * (MW + GAP);
    mods.push({ x: cx + RING - MD / 2, y, w: MD, h: MW, ax: cx + RING - MD / 2, ay: y + MW / 2, bx: cx + die / 2, by: y + MW / 2 });
  }
  for (let i = 0; i < 4; i++) { // bottom, right to left
    const x = cx + run / 2 - MW - i * (MW + GAP);
    mods.push({ x, y: cy + RING - MD / 2, w: MW, h: MD, ax: x + MW / 2, ay: cy + RING - MD / 2, bx: x + MW / 2, by: cy + die / 2 });
  }
  for (let i = 0; i < 4; i++) { // left, bottom to top
    const y = cy + run / 2 - MW - i * (MW + GAP);
    mods.push({ x: cx - RING - MD / 2, y, w: MD, h: MW, ax: cx - RING + MD / 2, ay: y + MW / 2, bx: cx - die / 2, by: y + MW / 2 });
  }
  // Traces converge on the die so corner traces never cross.
  const lim = die / 2 - 14;
  const cl = (v: number, c0: number) => Math.max(c0 - lim, Math.min(c0 + lim, c0 + (v - c0) * 0.6));
  mods.forEach((m, i) => {
    const on = i < filled;
    const bx = m.bx === m.ax ? cl(m.bx, cx) : m.bx, by = m.by === m.ay ? cl(m.by, cy) : m.by;
    out.push(`<path d="M${m.ax} ${m.ay} L${bx} ${by}" stroke="${on ? color : "#34332d"}" stroke-opacity="${on ? 0.55 : 1}" stroke-width="3"/>`);
  });
  mods.forEach((m, i) => {
    const on = i < filled;
    out.push(
      on
        ? `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="4" fill="url(#sc-mod)" stroke="${shade(color, 0.35)}" stroke-width="1.5"/>`
        : `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="4" fill="#191917" stroke="#3a3933" stroke-width="1.5" stroke-dasharray="4 4"/>`,
    );
    if (on) {
      const horiz = m.w > m.h;
      const ix = m.x + (horiz ? 10 : 9), iy = m.y + (horiz ? 9 : 10);
      out.push(`<rect x="${ix}" y="${iy}" width="${m.w - (horiz ? 20 : 18)}" height="${m.h - (horiz ? 18 : 20)}" rx="2" fill="${shade(color, -0.55)}" opacity="0.55"/>`);
    }
  });

  // The die.
  const dx = cx - die / 2, dy = cy - die / 2;
  out.push(`<rect x="${dx - 8}" y="${dy - 8}" width="${die + 16}" height="${die + 16}" rx="10" fill="#0f0f0d" stroke="#3a3933" stroke-width="1.5"/>`);
  out.push(`<rect x="${dx}" y="${dy}" width="${die}" height="${die}" rx="6" fill="url(#sc-die)"/>`);
  for (let i = 1; i < 5; i++) {
    const o = (die / 5) * i;
    out.push(
      `<path d="M${dx + o} ${dy + 6} V${dy + die - 6}" stroke="#000" stroke-opacity="0.22" stroke-width="2"/>`,
      `<path d="M${dx + 6} ${dy + o} H${dx + die - 6}" stroke="#000" stroke-opacity="0.22" stroke-width="2"/>`,
    );
  }
  out.push(`<rect x="${dx}" y="${dy}" width="${die}" height="${die}" rx="6" fill="url(#sc-sheen)"/>`);
  return out.join("\n  ");
}

export function shareCardSvg(c: ShareCardInput): string {
  const mono = esc(c.fonts.mono);
  const hasDisplay = c.fonts.display != null;
  const display = esc(c.fonts.display ?? c.fonts.mono);
  const col = c.tier.color;
  const X = 72;

  const faces: string[] = [];
  if (c.fontFaceSrc?.mono) faces.push(`@font-face{font-family:"${mono}";src:url(${c.fontFaceSrc.mono});}`);
  if (c.fontFaceSrc?.display && c.fonts.display) faces.push(`@font-face{font-family:"${display}";src:url(${c.fontFaceSrc.display});}`);
  const style = faces.length ? `<style>${faces.join("")}</style>` : "";

  const joined = c.rank != null && c.total != null;
  const kicker = joined ? "ADDED TO THE GLOBAL VRAM CLUSTER" : "MY VRAM, BY THE GIGABYTE";

  // Big number, sized so "NN GB" fits the column even in the mono fallback.
  const n = fmtGb(c.vramGb);
  const unitSize = 64;
  const numSize = Math.min(220, Math.floor((LEFT_W - 40 - unitSize * MONO_EM * 2 - 16) / (n.length * MONO_EM)));

  const model = clip(c.gpuModel, Math.floor(LEFT_W / (30 * MONO_EM)));
  const tierName = c.tier.name.toUpperCase();
  const pillFont = 22, pillTrack = 3;
  const pillW = Math.round(tierName.length * (pillFont * MONO_EM + pillTrack) + 40);

  const rankText = joined
    ? `#${c.rank!.toLocaleString("en-US")} of ${c.total!.toLocaleString("en-US")}` +
      (c.moreThanPct != null ? `  ·  more VRAM than ${fmtGb(Math.round(c.moreThanPct * 10) / 10)}%` : "")
    : c.tier.line;
  const rankLine = clip(rankText, Math.floor(LEFT_W / (20 * MONO_EM)));

  const titleSize = hasDisplay ? 84 : 66;
  const footRight = clip(`unofficial fan project  ·  ${c.date}`, 40);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_W}" height="${SHARE_H}" viewBox="0 0 ${SHARE_W} ${SHARE_H}">
  ${style}
  <defs>
    <radialGradient id="sc-halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${col}" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="${col}" stop-opacity="0.06"/>
      <stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sc-wash" cx="0.12" cy="0.95" r="0.7">
      <stop offset="0" stop-color="${col}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sc-sub" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f1f1b"/><stop offset="1" stop-color="#121210"/>
    </linearGradient>
    <linearGradient id="sc-die" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(col, 0.15)}"/><stop offset="1" stop-color="${shade(col, -0.45)}"/>
    </linearGradient>
    <linearGradient id="sc-mod" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(col, 0.1)}"/><stop offset="1" stop-color="${shade(col, -0.3)}"/>
    </linearGradient>
    <linearGradient id="sc-sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="sc-rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${col}" stop-opacity="0.9"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${SHARE_W}" height="${SHARE_H}" fill="#0d0d0b"/>
  <rect width="${SHARE_W}" height="${SHARE_H}" fill="url(#sc-wash)"/>
  <rect x="20" y="20" width="${SHARE_W - 40}" height="${SHARE_H - 40}" rx="18" fill="none" stroke="#2d2c27" stroke-width="1.5"/>
  ${chipMotif(918, 300, c.vramGb, col)}
  <text x="${X}" y="92" font-family="${mono}" font-size="17" letter-spacing="3" fill="#aba596">${kicker}</text>
  <text x="${X}" y="${hasDisplay ? 176 : 168}" font-family="${display}" font-size="${titleSize}" fill="#efeae0">Thanks, Jensen.</text>
  <text x="${X - 6}" y="${hasDisplay ? 372 : 362}" fill="${col}"><tspan font-family="${display}" font-size="${numSize}">${esc(n)}</tspan><tspan font-family="${mono}" font-size="${unitSize}" dx="16">GB</tspan></text>
  <text x="${X}" y="424" font-family="${mono}" font-size="30" fill="#efeae0">${esc(model)}</text>
  <rect x="${X}" y="452" width="${pillW}" height="46" rx="23" fill="${col}"/>
  <text x="${X + 20}" y="483" font-family="${mono}" font-size="${pillFont}" letter-spacing="${pillTrack}" fill="#10120a">${esc(tierName)}</text>
  <text x="${X}" y="538" font-family="${mono}" font-size="20" fill="${joined ? "#efeae0" : "#aba596"}">${esc(rankLine)}</text>
  <rect x="${X}" y="566" width="420" height="2" fill="url(#sc-rule)"/>
  <text x="${X}" y="600" font-family="${mono}" font-size="20" fill="${col}">$ npx vram-receipt</text>
  <text x="${SHARE_W - 64}" y="600" font-family="${mono}" font-size="15" fill="#8f8a7a" text-anchor="end">${esc(footRight)}</text>
</svg>`;
}
