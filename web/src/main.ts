import { SKUS, STEAM_RAM, buildReceipt } from "@vram-receipt/core";
import { blankCount, fillTable, mountChart, pricedCount } from "./chart";
import type { Basis } from "./chart";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- theme ------------------------------------------------------------
const root = document.documentElement;
const stored = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
if (stored === "light" || stored === "dark") root.dataset.theme = stored;
$("theme").addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch { /* private mode */ }
});

// ---- copy helpers -----------------------------------------------------
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
const cmdBtn = $<HTMLButtonElement>("copy-cmd");
cmdBtn.addEventListener("click", async () => {
  cmdBtn.textContent = (await copy($("cmd-text").textContent ?? "")) ? "Copied" : "Select it";
  setTimeout(() => (cmdBtn.textContent = "Copy"), 1600);
});

// ---- chart ------------------------------------------------------------
const chart = mountChart($("chart-svg"), $("tip"));
fillTable($<HTMLTableElement>("data-table"));
const NOTES: Record<Basis, string> = {
  nominal: "Launch MSRP as announced, in the dollars of the launch year. Higher is more memory for the money.",
  real: "Launch MSRP converted to October 2026 dollars with US CPI. Older cards move down because their dollars were worth more.",
};
$("chart-note").textContent = NOTES.nominal;
$("blank-count").textContent = ` ${pricedCount} cards shown; ${blankCount} more are in the CSV without a confirmed price.`;
document.querySelectorAll<HTMLButtonElement>(".seg button").forEach((b) =>
  b.addEventListener("click", () => {
    const basis = b.dataset.basis as Basis;
    document.querySelectorAll<HTMLButtonElement>(".seg button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    chart.render(basis);
    $("chart-note").textContent = NOTES[basis];
  }),
);

// ---- receipt ----------------------------------------------------------
const card = $<HTMLSelectElement>("card");
for (const g of [50, 40, 30, 20, 16, 10]) {
  const group = document.createElement("optgroup");
  group.label = `${g} series`;
  for (const s of SKUS.filter((x) => x.generation === g)) {
    const o = document.createElement("option");
    o.value = s.skuId;
    o.textContent = `${s.model} ${s.vramGb} GB`;
    group.append(o);
  }
  card.append(group);
}
card.value = "rtx-3060-12gb";

const ram = $<HTMLSelectElement>("ram");
for (const b of STEAM_RAM.filter((x) => x.ramGb != null)) {
  const o = document.createElement("option");
  o.value = String(b.ramGb);
  o.textContent = `${b.ramGb} GB`;
  ram.append(o);
}
for (const extra of [96, 128, 192, 256]) {
  const o = document.createElement("option");
  o.value = String(extra);
  o.textContent = `${extra} GB`;
  ram.append(o);
}
ram.value = "16";

const paid = $<HTMLInputElement>("paid");
const out = $("receipt-out");
function render() {
  const sku = SKUS.find((s) => s.skuId === card.value)!;
  const p = Number(paid.value);
  const receipt = buildReceipt({
    gpus: [{ name: `${sku.model} ${sku.vramGb}GB`, vramMb: null, source: "picked on the page" }],
    ramGb: Number(ram.value),
    paidUsd: paid.value !== "" && Number.isFinite(p) && p > 0 ? p : null,
    date: new Date().toISOString().slice(0, 10),
  });
  // Nothing is uploaded from the page either, so the header line stays true.
  out.textContent = receipt.text.replace("(local run, not uploaded)", "(in your browser, not uploaded)");
}
[card, ram, paid].forEach((e) => e.addEventListener("input", render));
render();

$("copy-receipt").addEventListener("click", async () => {
  const ok = await copy(out.textContent ?? "");
  $("copy-status").textContent = ok ? "Copied. Paste it anywhere that keeps a monospace font." : "Copy was blocked by the browser. Select the receipt text and copy it by hand.";
});
