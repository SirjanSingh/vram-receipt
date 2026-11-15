import { CPI_NOW, SKUS, STEAM_RAM, TIERS, countryFromTimeZone, describePayload, rigLabel, tierFor } from "@vram-receipt/core";
import type { ClusterStats, RigPayload, Sku } from "@vram-receipt/core";
import { mountCheck } from "./turnstile";
import { SITE, UUID_RE, configured, fetchCluster, getRig, leaveCluster, num, shareUrl, submitRig } from "./api";
import { cardPng, cardSvg, svgUrl } from "./card";
import { mountCluster } from "./clusterViz";
import type { Mode } from "./clusterViz";
import { BUDGET, mountGenJars, mountRevenue } from "./jars";
import { QUARTER } from "./revenue";
import { mountJacket } from "./jacket";
import { fmtGb, renderBoards, renderLadder, renderYou } from "./ranks";
import type { YouState } from "./ranks";
import { blankCount, fillTable, mountChart, pricedCount } from "./chart";
import type { Basis } from "./chart";

const OTHER = "other";
const OTHER_VRAM = [2, 3, 4, 6, 8, 10, 11, 12, 16, 20, 24, 32, 48];
/** "RTX 4050 Laptop GPU" -> 40, "GTX 1650 Ti" -> 16; null when the name gives no GeForce series. */
function genFromName(name: string): number | null {
  const m = /\b(?:RTX|GTX)\s*(\d{2})\d{2}\b/i.exec(name);
  const g = m ? Number(m[1]) : NaN;
  return [10, 16, 20, 30, 40, 50].includes(g) ? g : null;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};
function clientId(): string {
  let id = store.get("vr-client-id");
  if (!id || !UUID_RE.test(id)) {
    id = crypto.randomUUID();
    store.set("vr-client-id", id);
  }
  return id;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---- state ----
const LIVE = configured();
let stats: ClusterStats | null = null;
let failed = false;
let myId: string | null = LIVE ? store.get("vr-rig-id") : null;
if (myId && !UUID_RE.test(myId)) myId = null;
const you: YouState & { sku: Sku; ramGb: number | null } = { vramGb: 12, joined: null, sku: SKUS[0]!, ramGb: 16 };

// ---- static bits (numbers come from the data, never typed into the HTML) ----
$("jars-title").textContent = `What $${BUDGET} of VRAM got you, every generation`;
$("ladder").setAttribute("aria-label", `All ${TIERS.length} tiers`);
{
  const [y, m] = CPI_NOW.month.split("-").map(Number);
  const month = new Date(y!, m! - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
  $("cav-jars").textContent = `Desktop cards only. Jars: $${BUDGET} in ${month} dollars at each generation's median.`;
}
mountRevenue($("revenue"));
mountGenJars($("gen-jars"), $("jars-verdict"), $<HTMLButtonElement>("replay"));

const cmdBtn = $<HTMLButtonElement>("copy-cmd");
cmdBtn.addEventListener("click", async () => {
  const label = cmdBtn.querySelector("span")!;
  label.textContent = (await copy($("cmd-text").textContent ?? "")) ? "Copied" : "Select it";
  setTimeout(() => (label.textContent = "Copy"), 1600);
});

// ---- cluster ----
const viz = mountCluster($<HTMLCanvasElement>("cluster"), $("chip-tip"));
const cap = $("cluster-cap");
const canvas = $("cluster");

function counter(el: HTMLElement, to: number, fmt: (n: number) => string) {
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = String(to);
  if (reduced || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / 1400);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function paintCluster(intro: boolean) {
  let mode: Mode;
  if (!LIVE) mode = "offline";
  else if (failed) mode = "error";
  else if (stats && num(stats.total_rigs) > 0) mode = "live";
  else mode = "empty";
  viz.setMode(mode);

  const total = stats ? num(stats.total_rigs) : 0;
  const vram = stats ? num(stats.total_vram_gb) : 0;
  const countries = stats ? stats.countries.length : 0;
  $("counters").hidden = !LIVE || (failed && !stats);
  if (stats) {
    counter($("c-vram"), vram, fmtGb);
    counter($("c-rigs"), total, (n) => Math.round(n).toLocaleString("en-US"));
    counter($("c-countries"), countries, (n) => String(Math.round(n)));
    viz.setRigs(stats.recent.map((r) => ({ ...r, gpu_model: rigLabel(r.gpu_model, num(r.gpu_count) || 1), vram_gb: num(r.vram_gb) })), myId, intro);
  }

  const shown = stats ? stats.recent.length : 0;
  cap.textContent =
    mode === "offline" ? "Cluster opens soon. Your chip is a preview."
    : mode === "error" ? (stats ? "Cluster unreachable. Showing the last update." : "Cluster unreachable. Your chip is a preview.")
    : mode === "empty" ? "The cluster is empty. Be the first chip."
    : shown < total ? `Latest ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} rigs shown.`
    : "";
  cap.hidden = cap.textContent === "";
  // The "latest N" note would sit on top of chips; it goes under the canvas instead.
  cap.classList.toggle("below", mode === "live" || (mode === "error" && !!stats));
  canvas.setAttribute(
    "aria-label",
    mode === "live"
      ? `The VRAM cluster: ${total.toLocaleString("en-US")} rigs, ${fmtGb(vram)} of VRAM pooled, from ${countries} countries. Your pick is shown as a preview chip.`
      : `The VRAM cluster, ${mode === "offline" ? "not open yet" : mode === "error" ? "unreachable" : "empty"}. Your picked card is shown as a preview chip.`,
  );
}

async function poll(intro = false) {
  if (!LIVE) return;
  const r = await fetchCluster();
  if (r.ok) {
    stats = r.value;
    failed = false;
  } else failed = true;
  paintCluster(intro);
  const key = JSON.stringify([failed, stats?.total_rigs, stats?.countries, stats?.top_cards, stats?.histogram, you.vramGb, you.joined]);
  if (key === lastBoards) return;
  lastBoards = key;
  renderBoards(stats, LIVE, failed);
  renderYou(you, stats, LIVE);
  renderLadder($("ladder"), you.vramGb, stats);
}
let lastBoards = "";

paintCluster(true);
renderBoards(null, LIVE, false);
if (LIVE) {
  void poll(true);
  setInterval(() => {
    if (document.visibilityState === "visible") void poll();
  }, 15000);
}

// ---- pick your card ----
const card = $<HTMLSelectElement>("card");
const GENS = [50, 40, 30, 20, 16, 10];
for (const g of GENS) {
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
{
  // Laptop-only and unlisted cards have no launch price, so they are not in the dataset,
  // but they still get a tier and can join the cluster.
  const group = document.createElement("optgroup");
  group.label = "Not listed";
  const o = document.createElement("option");
  o.value = OTHER;
  o.textContent = "Laptop or other GPU";
  group.append(o);
  card.append(group);
}
const otherBox = $("other-fields");
const otherName = $<HTMLInputElement>("other-name");
const otherVram = $<HTMLSelectElement>("other-vram");
for (const gb of OTHER_VRAM) {
  const o = document.createElement("option");
  o.value = String(gb);
  o.textContent = `${gb} GB`;
  otherVram.append(o);
}
otherVram.value = "6";

/** The picked card, or a stand-in built from the typed name and VRAM. */
function currentSku(): Sku {
  if (card.value !== OTHER) return SKUS.find((s) => s.skuId === card.value) ?? SKUS[0]!;
  const model = otherName.value.replace(/\s+/g, " ").trim().slice(0, 60) || "Unknown GPU";
  const vramGb = Number(otherVram.value);
  return { ...SKUS[0]!, skuId: `${OTHER}|${model}|${vramGb}`, model, vramGb, generation: genFromName(model) as number, msrpUsd: null, msrpRealUsd: null, mbPerDollar: null, mbPerRealDollar: null };
}
card.value = SKUS.some((s) => s.skuId === "rtx-3060-12gb") ? "rtx-3060-12gb" : SKUS[0]!.skuId;

const ram = $<HTMLSelectElement>("ram");
{
  const skip = document.createElement("option");
  skip.value = "";
  skip.textContent = "Don't send RAM";
  ram.append(skip);
  const sizes = new Set<number>([...STEAM_RAM.filter((x) => x.ramGb != null).map((x) => x.ramGb!), 96, 128, 192, 256]);
  for (const gb of [...sizes].sort((a, b) => a - b)) {
    const o = document.createElement("option");
    o.value = String(gb);
    o.textContent = `${gb} GB`;
    ram.append(o);
  }
  ram.value = "16";
}

// ---- share card ----
const shareSlot = $("share-slot");
const shareImg = new Image(1200, 630);
shareImg.className = "card-img";
shareImg.alt = "";
shareImg.decoding = "async";
shareSlot.append(shareImg);
let currentSvg = "";
let cardSeq = 0;

function linkFor() {
  return myId && you.joined ? shareUrl(myId) : SITE;
}
function shareText() {
  const t = tierFor(you.vramGb);
  return you.joined
    ? `Thanks, Jensen. My ${you.sku.model} put ${you.vramGb} GB into the people's VRAM cluster. Rank #${you.joined.rank}. Tier: ${t.name}.`
    : `Thanks, Jensen. My ${you.sku.model} has ${you.vramGb} GB of VRAM. Tier: ${t.name}. npx vram-receipt`;
}

async function renderCard() {
  const seq = ++cardSeq;
  const t = tierFor(you.vramGb);
  const svg = await cardSvg({
    gpuModel: you.sku.model,
    vramGb: you.vramGb,
    ramGb: you.ramGb,
    tier: t,
    rank: you.joined?.rank ?? null,
    total: you.joined?.total ?? null,
    moreThanPct: you.joined?.moreThanPct ?? null,
    date: today(),
  });
  if (seq !== cardSeq) return;
  currentSvg = svg;
  shareImg.src = svgUrl(svg);
  shareImg.alt = `Share card: Thanks, Jensen. ${you.sku.model}, ${you.vramGb} GB, tier ${t.name}${you.joined ? `, rank ${you.joined.rank} of ${you.joined.total}` : ""}.`;
  const url = linkFor();
  $<HTMLAnchorElement>("share-x").href = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(url)}`;
  $<HTMLAnchorElement>("share-in").href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

$("dl").addEventListener("click", async () => {
  const status = $("share-status");
  try {
    if (!currentSvg) await renderCard();
    const blob = await cardPng(currentSvg);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thanks-jensen-${you.vramGb}gb.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status.textContent = "Saved.";
  } catch {
    status.textContent = "This browser blocked the PNG export. Right-click the card to save it.";
  }
});
$("copy-link").addEventListener("click", async () => {
  $("share-status").textContent = (await copy(linkFor())) ? "Link copied." : "Copy blocked. The link is " + linkFor();
});

// ---- tier + preview ----
const tierBox = $("tier");
function pick() {
  otherBox.hidden = card.value !== OTHER;
  const sku = currentSku();
  const changed = sku.skuId !== you.sku.skuId || you.ramGb !== (ram.value === "" ? null : Number(ram.value));
  you.sku = sku;
  you.vramGb = sku.vramGb;
  you.ramGb = ram.value === "" ? null : Number(ram.value);
  // A different card than the one in the cluster is not ranked until it is sent again.
  if (changed && joinedSku && joinedSku !== `${sku.skuId}|${you.ramGb}`) you.joined = null;
  if (joinedSku === `${sku.skuId}|${you.ramGb}` && lastJoin) you.joined = lastJoin;

  const t = tierFor(sku.vramGb);
  tierBox.style.setProperty("--c", t.color);
  $("tier-name").textContent = t.name;
  $("tier-line").textContent = t.line;
  tierBox.classList.remove("pop");
  void tierBox.offsetWidth;
  tierBox.classList.add("pop");
  renderLadder($("ladder"), sku.vramGb, stats);
  renderYou(you, stats, LIVE);
  if (!you.joined) viz.setPreview({ vramGb: sku.vramGb, label: `${sku.model} ${sku.vramGb} GB` });
  else viz.setPreview(null);
  updateJoinUi();
  void renderCard();
}

// ---- join ----
const joinBtn = $<HTMLButtonElement>("join-btn");
const consent = $("consent");
const joinedEl = $("joined");
let joinedSku: string | null = null;
let lastJoin: YouState["joined"] = null;

function payload(): RigPayload {
  return {
    clientId: clientId(),
    gpuModel: you.sku.model,
    vramGb: you.sku.vramGb,
    ramGb: you.ramGb,
    generation: you.sku.generation,
    country: countryFromTimeZone(),
    source: "web",
  };
}

function updateJoinUi() {
  if (!LIVE) {
    joinBtn.disabled = true;
    $("join-note").textContent = "Cluster opens soon. Your card still works below.";
    return;
  }
  joinBtn.disabled = false;
  joinBtn.textContent = you.joined ? "In the cluster" : joinedSku ? "Update my rig" : "Join the cluster";
  joinBtn.disabled = !!you.joined;
  $("join-note").textContent = you.joined ? "" : "Opt in. You'll see what gets sent first.";
  joinedEl.hidden = !you.joined;
  $("leave").hidden = !joinedSku;
  if (you.joined) {
    joinedEl.replaceChildren();
    const b = document.createElement("b");
    b.textContent = `#${you.joined.rank.toLocaleString("en-US")}`;
    const s = document.createElement("span");
    s.textContent = ` of ${you.joined.total.toLocaleString("en-US")}. More VRAM than ${you.joined.moreThanPct}% of the cluster.`;
    joinedEl.append(b, s);
  }
}

// Turnstile token for the next send. Tokens are single-use, so the check resets after each send.
let humanToken: string | null = null;
let resetCheck: (() => void) | null = null;
const sendBtn = $<HTMLButtonElement>("send");
const setToken = (t: string | null) => {
  humanToken = t;
  sendBtn.disabled = !t;
};

joinBtn.addEventListener("click", () => {
  $("payload").textContent = describePayload(payload()).join("\n");
  consent.hidden = false;
  joinBtn.hidden = true;
  $("join-note").textContent = "";
  if (!resetCheck) {
    setToken(null);
    mountCheck($("human-check"), setToken).then(
      (reset) => (resetCheck = reset),
      () => ($("join-note").textContent = "Could not load the human check. Reload and try again."),
    );
  }
  sendBtn.focus();
});
$("cancel").addEventListener("click", () => {
  consent.hidden = true;
  joinBtn.hidden = false;
  joinBtn.focus();
});
$("send").addEventListener("click", async () => {
  const send = $<HTMLButtonElement>("send");
  send.disabled = true;
  send.textContent = "Sending";
  const p = payload();
  const r = await submitRig(p, humanToken ?? undefined);
  send.textContent = "Send it";
  resetCheck?.();
  if (!r.ok) {
    $("join-note").textContent = `Not sent: ${r.reason.replace(/\.$/, "")}.`;
    consent.hidden = true;
    joinBtn.hidden = false;
    return;
  }
  const v = r.value;
  myId = v.id;
  store.set("vr-rig-id", v.id);
  lastJoin = { rank: num(v.rank), total: num(v.total), moreThanPct: num(v.more_than_pct) };
  you.joined = lastJoin;
  joinedSku = `${you.sku.skuId}|${you.ramGb}`;
  consent.hidden = true;
  joinBtn.hidden = false;
  // Bring the cluster into view, then the chip flies in from off the package.
  $("cluster-fig").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  setTimeout(() => viz.join(v.id, p.gpuModel, p.vramGb), reduced ? 0 : 450);
  history.replaceState(null, "", `?rig=${encodeURIComponent(v.id)}`);
  updateJoinUi();
  renderYou(you, stats, LIVE);
  void renderCard();
  void poll();
});

$("leave").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("leave");
  btn.disabled = true;
  const r = await leaveCluster(clientId());
  btn.disabled = false;
  if (!r.ok) {
    $("join-note").textContent = `Not removed: ${r.reason}.`;
    return;
  }
  try { localStorage.removeItem("vr-rig-id"); } catch { /* fine */ }
  myId = null;
  you.joined = null;
  lastJoin = null;
  joinedSku = null;
  history.replaceState(null, "", location.pathname);
  pick();
  $("join-note").textContent = "Removed. Your chip leaves the cluster on the next update.";
  void poll();
});

card.addEventListener("input", () => {
  pick();
  if (card.value === OTHER && !otherName.value) otherName.focus();
});
ram.addEventListener("input", pick);
otherName.addEventListener("input", pick);
otherVram.addEventListener("input", pick);

// ---- returning visitor: they joined before ----
async function restoreMine() {
  if (!LIVE || !myId) return;
  const r = await getRig(myId);
  if (!r.ok || !r.value) return;
  const v = r.value;
  const sku = SKUS.find((s) => s.model === v.gpu_model && s.vramGb === num(v.vram_gb));
  if (sku) card.value = sku.skuId;
  else if (OTHER_VRAM.includes(num(v.vram_gb))) {
    card.value = OTHER;
    otherName.value = v.gpu_model;
    otherVram.value = String(num(v.vram_gb));
  }
  ram.value = v.ram_gb != null && Array.from(ram.options).some((o) => o.value === String(v.ram_gb)) ? String(v.ram_gb) : ram.value;
  lastJoin = { rank: num(v.rank), total: num(v.total), moreThanPct: num(v.more_than_pct) };
  joinedSku = `${currentSku().skuId}|${ram.value === "" ? null : Number(ram.value)}`;
  if (sku || card.value === OTHER) {
    viz.setPreview(null);
    pick();
  }
}

// ---- someone else's rig: ?rig=<id> ----
async function showTheirs() {
  const id = new URLSearchParams(location.search).get("rig");
  if (!id) return;
  const sec = $("their");
  sec.hidden = false;
  const title = $("their-title");
  const tierEl = $("their-tier");
  const rankEl = $("their-rank");
  if (!UUID_RE.test(id)) {
    title.textContent = "That link looks broken.";
    tierEl.textContent = "Pick your own card below.";
    return;
  }
  if (id === myId) {
    sec.hidden = true; // it's yours; the join section already shows it
    return;
  }
  if (!LIVE) {
    title.textContent = "This rig lives in the cluster.";
    tierEl.textContent = "The cluster opens soon. Check back, or make your own card below.";
    return;
  }
  const r = await getRig(id);
  if (!r.ok) {
    title.textContent = "Couldn't load that rig.";
    tierEl.textContent = `The cluster said: ${r.reason}.`;
    return;
  }
  if (!r.value) {
    title.textContent = "That rig isn't in the cluster.";
    tierEl.textContent = "It may have been removed. Add yours below.";
    return;
  }
  const v = r.value;
  const count = num(v.gpu_count) || 1;
  const vram = v.total_vram_gb != null ? num(v.total_vram_gb) : num(v.vram_gb);
  const name = rigLabel(v.gpu_model, count);
  const t = tierFor(vram);
  sec.style.setProperty("--c", t.color);
  title.textContent = count > 1 ? `${name}, ${vram} GB in all.` : `${name}, ${vram} GB.`;
  tierEl.textContent = `${t.name}. ${t.line}`;
  rankEl.textContent = `#${num(v.rank).toLocaleString("en-US")} of ${num(v.total).toLocaleString("en-US")}. More VRAM than ${num(v.more_than_pct)}% of the cluster.`;
  const svg = await cardSvg({
    gpuModel: name, vramGb: vram, ramGb: v.ram_gb, tier: t,
    rank: num(v.rank), total: num(v.total), moreThanPct: num(v.more_than_pct), date: v.created_at.slice(0, 10),
  });
  const img = new Image(1200, 630);
  img.className = "card-img";
  img.alt = `Their card: ${name}, ${vram} GB, tier ${t.name}.`;
  img.src = svgUrl(svg);
  $("their-slot").replaceChildren(img);
}

// ---- data drawer: build the chart only when opened ----
const data = $<HTMLDetailsElement>("data");
let chartReady = false;
data.addEventListener("toggle", () => {
  if (!data.open || chartReady) return;
  chartReady = true;
  const chart = mountChart($("chart-svg"), $("tip"));
  fillTable($<HTMLTableElement>("data-table"));
  $("blank-count").textContent = `${pricedCount} cards with a confirmed price; ${blankCount} more are in the CSV without one.`;
  document.querySelectorAll<HTMLButtonElement>(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>(".seg button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      chart.render(b.dataset.basis as Basis);
    }),
  );
});
if (location.hash === "#data") data.open = true;

pick();
void restoreMine();
void showTheirs();

// ---- the thank-you note: numbers come from the same data as the revenue bar ----
$("why-dc").textContent = `$${QUARTER.dataCenterB.toFixed(1)}B`;
$("why-edge").textContent = `$${QUARTER.edgeB.toFixed(1)}B`;
mountJacket($("jacket"));
