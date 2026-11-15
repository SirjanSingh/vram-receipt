import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { receiptSvg, shareCardSvg } from "@vram-receipt/core";
import type { ShareCardInput } from "@vram-receipt/core";
import { FONT_FAMILY, FONT_TTF_BASE64 } from "@vram-receipt/core/src/generated/font";

export type PngResult = { ok: true } | { ok: false; reason: string };

/**
 * Render an SVG to a PNG with resvg. Returns a reason instead of throwing:
 * the text receipt is the product, the images are a convenience.
 * `build` gets the font family name the renderer knows about.
 */
async function svgToPng(build: (fontFamily: string) => string, outPath: string): Promise<PngResult> {
  let Resvg: typeof import("@resvg/resvg-js").Resvg;
  try {
    ({ Resvg } = await import("@resvg/resvg-js"));
  } catch {
    return { ok: false, reason: "the PNG renderer has no prebuilt binary for this platform" };
  }
  // resvg-js loads fonts from file paths only, so the embedded font goes to a temp file.
  const dir = mkdtempSync(join(os.tmpdir(), "vram-receipt-"));
  try {
    const fontPath = join(dir, "font.ttf");
    writeFileSync(fontPath, Buffer.from(FONT_TTF_BASE64, "base64"));
    const png = new Resvg(build(FONT_FAMILY), {
      font: { loadSystemFonts: false, fontFiles: [fontPath], defaultFontFamily: FONT_FAMILY },
    }).render().asPng();
    writeFileSync(outPath, png);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const renderPng = (lines: string[], outPath: string) => svgToPng((fontFamily) => receiptSvg(lines, { fontFamily }), outPath);

/** The "Thanks, Jensen" share card. Only the bundled mono font is available, so it is also the display font. */
export const renderShareCard = (card: Omit<ShareCardInput, "fonts" | "fontFaceSrc">, outPath: string) =>
  svgToPng((fontFamily) => shareCardSvg({ ...card, fonts: { mono: fontFamily } }), outPath);
