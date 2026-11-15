// Browser side of the share card: embed the page's own fonts as data URLs so the SVG renders the
// same as an <img> and on a canvas (SVG images can't load external fonts), then export a PNG.
import { SHARE_H, SHARE_W, shareCardSvg } from "@vram-receipt/core";
import type { ShareCardInput } from "@vram-receipt/core";

type CardData = Omit<ShareCardInput, "fonts" | "fontFaceSrc">;

let fontsP: Promise<{ mono?: string; display?: string }> | null = null;

async function toDataUrl(path: string): Promise<string | undefined> {
  try {
    const res = await fetch(path);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((ok, bad) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).replace(/^data:[^;,]*/, "data:font/ttf"));
      r.onerror = () => bad(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

function fonts() {
  fontsP ??= Promise.all([toDataUrl("/fonts/JetBrainsMono-Regular.ttf"), toDataUrl("/fonts/InstrumentSerif-Regular.ttf")]).then(
    ([mono, display]) => ({ mono, display }),
  );
  return fontsP;
}

export async function cardSvg(d: CardData): Promise<string> {
  const f = await fonts();
  return shareCardSvg({
    ...d,
    fonts: { mono: "JetBrains Mono", display: f.display ? "Instrument Serif" : undefined },
    fontFaceSrc: f,
  });
}

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Draw the SVG to a 1200x630 canvas and return a PNG blob. */
export async function cardPng(svg: string): Promise<Blob> {
  const img = new Image();
  img.width = SHARE_W;
  img.height = SHARE_H;
  img.src = svgUrl(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, SHARE_W, SHARE_H);
  // Embedded fonts can land a frame late on the first draw; draw again after a tick.
  await new Promise((r) => setTimeout(r, 120));
  ctx.clearRect(0, 0, SHARE_W, SHARE_H);
  ctx.drawImage(img, 0, 0, SHARE_W, SHARE_H);
  return await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("PNG export failed"))), "image/png"));
}
