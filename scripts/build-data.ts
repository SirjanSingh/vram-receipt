// Reads the hand-entered columns of data/gift-index.csv, fills the computed
// columns, validates everything, rewrites the CSV in place and generates the
// modules that the CLI and the page embed (no file or network reads at runtime).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...s: string[]) => join(root, ...s);

const COLUMNS = [
  "sku_id", "model", "generation", "vram_gb", "mem_type", "launch_date", "msrp_usd",
  "fe_price_usd", "msrp_source_url", "cpi_launch", "cpi_now", "msrp_real_usd",
  "mb_per_dollar", "mb_per_real_dollar", "notes",
] as const;
type Col = (typeof COLUMNS)[number];
type Raw = Record<Col, string>;

function readCsv(path: string): { comments: string[]; header: string[]; rows: string[][] } {
  const lines = readFileSync(path, "utf8").replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  const comments = lines.filter((l) => l.startsWith("#"));
  const body = lines.filter((l) => !l.startsWith("#"));
  const [header, ...rows] = body.map((l) => l.split(","));
  if (!header) throw new Error(`${path}: no header row`);
  return { comments, header, rows };
}

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// ---- CPI -------------------------------------------------------------
const cpiFile = readCsv(p("data", "cpi.csv"));
const cpi = new Map<string, number>(cpiFile.rows.map((r) => [r[0]!, Number(r[1])]));
const cpiNowMonth = [...cpi.keys()].sort().at(-1)!;
const cpiNow = cpi.get(cpiNowMonth)!;

// ---- Steam bins ------------------------------------------------------
const steamVram = readCsv(p("data", "steam-vram-2026-10.csv")).rows.map((r) => ({
  bin: r[0]!, vramMb: r[1] ? Number(r[1]) : null, sharePct: Number(r[2]),
}));
const steamRam = readCsv(p("data", "steam-ram-2026-10.csv")).rows.map((r) => ({
  bin: r[0]!, ramGb: r[1] ? Number(r[1]) : null, sharePct: Number(r[2]),
}));
for (const [name, bins] of [["steam-vram", steamVram], ["steam-ram", steamRam]] as const) {
  const sum = bins.reduce((a, b) => a + b.sharePct, 0);
  if (Math.abs(sum - 100) > 0.5) fail(`${name}: shares sum to ${sum.toFixed(2)}, expected about 100`);
}

// ---- Gift index ------------------------------------------------------
const gi = readCsv(p("data", "gift-index.csv"));
if (gi.header.join(",") !== COLUMNS.join(",")) fail("gift-index.csv: header does not match the expected columns");
if (!gi.comments.some((c) => c.includes("CC BY-SA 4.0"))) fail("gift-index.csv: CC BY-SA 4.0 notice missing from header comments");

const seen = new Set<string>();
const seenKey = new Set<string>();
const rows = gi.rows.map((cells, i) => {
  const line = `gift-index.csv row ${i + 1}`;
  if (cells.length !== COLUMNS.length) fail(`${line}: ${cells.length} cells, expected ${COLUMNS.length} (no commas inside cells)`);
  const r = Object.fromEntries(COLUMNS.map((c, j) => [c, (cells[j] ?? "").trim()])) as Raw;
  if (!/^[a-z0-9-]+$/.test(r.sku_id)) fail(`${line}: bad sku_id "${r.sku_id}"`);
  if (seen.has(r.sku_id)) fail(`${line}: duplicate sku_id ${r.sku_id}`);
  seen.add(r.sku_id);
  const key = `${r.model}|${r.vram_gb}`;
  if (seenKey.has(key)) fail(`${line}: duplicate (model, vram_gb) ${key}`);
  seenKey.add(key);
  if (!["10", "16", "20", "30", "40", "50"].includes(r.generation)) fail(`${line}: bad generation ${r.generation}`);
  const vram = Number(r.vram_gb);
  if (!Number.isInteger(vram) || vram <= 0) fail(`${line}: bad vram_gb ${r.vram_gb}`);
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(r.launch_date)) fail(`${line}: bad launch_date ${r.launch_date}`);
  const month = r.launch_date.slice(0, 7);
  const cpiLaunch = cpi.get(month);
  const msrp = r.msrp_usd === "" ? null : Number(r.msrp_usd);
  const fe = r.fe_price_usd === "" ? null : Number(r.fe_price_usd);
  if (msrp !== null) {
    if (!Number.isFinite(msrp) || msrp <= 0) fail(`${line}: bad msrp_usd ${r.msrp_usd}`);
    if (!/^https:\/\//.test(r.msrp_source_url)) fail(`${line}: msrp_usd without an https source URL`);
    if (cpiLaunch === undefined) fail(`${line}: no CPI value for launch month ${month}`);
  } else if (r.msrp_source_url !== "" || fe !== null) {
    fail(`${line}: source URL or FE price present but msrp_usd is blank`);
  }
  if (fe !== null && (!Number.isFinite(fe) || fe <= 0)) fail(`${line}: bad fe_price_usd ${r.fe_price_usd}`);

  const real = msrp !== null && cpiLaunch !== undefined ? (msrp * cpiNow) / cpiLaunch : null;
  const mbPerDollar = msrp !== null ? (vram * 1024) / msrp : null;
  const mbPerRealDollar = real !== null ? (vram * 1024) / real : null;
  r.cpi_launch = msrp !== null && cpiLaunch !== undefined ? cpiLaunch.toFixed(3) : "";
  r.cpi_now = msrp !== null ? cpiNow.toFixed(3) : "";
  r.msrp_real_usd = real !== null ? real.toFixed(2) : "";
  r.mb_per_dollar = mbPerDollar !== null ? mbPerDollar.toFixed(2) : "";
  r.mb_per_real_dollar = mbPerRealDollar !== null ? mbPerRealDollar.toFixed(2) : "";
  return r;
});

if (errors.length) {
  console.error(errors.map((e) => `  - ${e}`).join("\n"));
  console.error(`\n${errors.length} data error(s). Nothing was written.`);
  process.exit(1);
}

// ---- Write CSV back --------------------------------------------------
const csvOut = [...gi.comments, COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => r[c]).join(","))].join("\n") + "\n";
writeFileSync(p("data", "gift-index.csv"), csvOut);

// ---- Generated modules ----------------------------------------------
const num = (s: string) => (s === "" ? null : Number(s));
const skus = rows.map((r) => ({
  skuId: r.sku_id,
  model: r.model,
  generation: Number(r.generation),
  vramGb: Number(r.vram_gb),
  memType: r.mem_type,
  launchDate: r.launch_date,
  msrpUsd: num(r.msrp_usd),
  fePriceUsd: num(r.fe_price_usd),
  msrpSourceUrl: r.msrp_source_url || null,
  msrpRealUsd: num(r.msrp_real_usd),
  mbPerDollar: num(r.mb_per_dollar),
  mbPerRealDollar: num(r.mb_per_real_dollar),
  notes: r.notes,
}));

const outDir = p("packages", "core", "src", "generated");
mkdirSync(outDir, { recursive: true });
const banner = "// GENERATED by scripts/build-data.ts from data/*.csv. Do not edit.\n";
writeFileSync(
  join(outDir, "data.ts"),
  banner +
    `import type { Sku, SteamVramBin, SteamRamBin } from "../types";\n\n` +
    `export const CPI_NOW = ${JSON.stringify({ month: cpiNowMonth, value: cpiNow })} as const;\n` +
    `export const STEAM_SURVEY_LABEL = "Oct 2026";\n\n` +
    `export const SKUS: Sku[] = ${JSON.stringify(skus, null, 2)};\n\n` +
    `export const STEAM_VRAM: SteamVramBin[] = ${JSON.stringify(steamVram, null, 2)};\n\n` +
    `export const STEAM_RAM: SteamRamBin[] = ${JSON.stringify(steamRam, null, 2)};\n`,
);
const font = readFileSync(p("assets", "fonts", "JetBrainsMono-Regular.ttf"));
writeFileSync(
  join(outDir, "font.ts"),
  banner + `// JetBrains Mono Regular, SIL Open Font License 1.1 (assets/fonts/OFL.txt).\n` +
    `export const FONT_FAMILY = "JetBrains Mono";\nexport const FONT_TTF_BASE64 =\n  "${font.toString("base64")}";\n`,
);

// The page serves the CSV files as static downloads.
const webData = p("web", "public", "data");
mkdirSync(webData, { recursive: true });
for (const f of ["gift-index.csv", "cpi.csv", "steam-vram-2026-10.csv", "steam-ram-2026-10.csv"]) {
  writeFileSync(join(webData, f), readFileSync(p("data", f)));
}

const priced = skus.filter((s) => s.msrpUsd !== null).length;
console.log(`gift-index: ${skus.length} SKUs (${priced} with MSRP, ${skus.length - priced} blank). CPI now ${cpiNowMonth} = ${cpiNow}.`);
