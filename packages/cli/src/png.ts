import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { receiptSvg } from "@vram-receipt/core";
import { FONT_FAMILY, FONT_TTF_BASE64 } from "@vram-receipt/core/src/generated/font";

/**
 * Render the receipt to a PNG with resvg. Returns null (with a reason) instead
 * of throwing: the text receipt is the product, the image is a convenience.
 */
export async function renderPng(lines: string[], outPath: string): Promise<{ ok: true } | { ok: false; reason: string }> {
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
    const svg = receiptSvg(lines, { fontFamily: FONT_FAMILY });
    const png = new Resvg(svg, {
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
