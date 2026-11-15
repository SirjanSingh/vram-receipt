// The live cluster: every rig is a VRAM chip that flies in and docks on one big GPU package.
// Chip size scales with VRAM, colour comes from the tier. Oldest rigs sit in the middle and the
// cluster grows outward in a spiral. Canvas 2D, devicePixelRatio aware, paused when hidden or
// offscreen, and a single static frame under prefers-reduced-motion.
import { tierFor } from "@vram-receipt/core";

export interface RigDot { id: string; gpu_model: string; vram_gb: number; country: string | null }
export interface PreviewChip { vramGb: number; label: string }
export type Mode = "offline" | "empty" | "live" | "error";

interface Chip {
  id: string;
  rig: RigDot | null; // null for the local preview
  slot: number;
  color: string;
  vram: number;
  x: number; y: number; // current centre, in grid units of the package (0..1)
  size: number; // current size in cell units
  // flight
  t0: number; dur: number; fx: number; fy: number; cxp: number; cyp: number;
  docked: boolean; dockAt: number;
  you: boolean; preview: boolean;
  /** When it started fading out (no longer in the latest window, or removed); 0 while it stays. */
  leaving: number;
}
const FADE_MS = 500;

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (p: number) => 1 - Math.pow(1 - p, 3);
const MIN_COLS = 9;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Slot order: a spiral out from the centre cell, so the cluster grows like a die from its core. */
function spiral(cols: number): [number, number][] {
  const c = (cols - 1) / 2;
  const cells: [number, number, number][] = [];
  for (let r = 0; r < cols; r++)
    for (let q = 0; q < cols; q++) {
      const dx = q - c, dy = r - c;
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      const ang = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2);
      cells.push([q, r, ring * 10 + ang]);
    }
  return cells.sort((a, b) => a[2] - b[2]).map(([q, r]) => [q, r]);
}

export function mountCluster(canvas: HTMLCanvasElement, tooltip: HTMLElement) {
  const ctx = canvas.getContext("2d")!;
  let W = 0, H = 0, dpr = 1;
  let cols = MIN_COLS;
  let order = spiral(cols);
  const chips = new Map<string, Chip>();
  let preview: Chip | null = null;
  let mode: Mode = "offline";
  let running = false, visible = true, onscreen = true;
  let raf = 0;
  const start = performance.now();
  let hover: Chip | null = null;

  // ---- geometry ----
  const pad = () => Math.max(34, W * 0.075);
  const area = () => W - pad() * 2;
  const cell = () => area() / cols;
  function slotXY(slot: number): [number, number] {
    const [q, r] = order[slot] ?? order[order.length - 1]!;
    return [pad() + (q + 0.5) * cell(), pad() + (r + 0.5) * cell()];
  }
  const sizeFor = (vram: number) => 0.4 + 0.5 * Math.sqrt(Math.min(vram, 48) / 48);

  function capacityFor(n: number) {
    let c = MIN_COLS;
    while (c * c < n + 2) c += 2;
    return c;
  }
  // Slots are stable: a chip keeps its socket for life, and a chip that leaves frees its socket
  // for the next newcomer. So the package never grows past the latest-N window the backend sends,
  // and chips that stay never shuffle around.
  const freeSlots: number[] = [];
  let nextSlot = 0;
  function allocSlot(): number {
    if (freeSlots.length) {
      freeSlots.sort((a, b) => a - b);
      return freeSlots.shift()!; // innermost free socket first
    }
    return nextSlot++;
  }
  function releaseSlot(s: number) {
    freeSlots.push(s);
    // Trailing free sockets shrink the high-water mark, so the package can shrink back.
    while (nextSlot > 0 && freeSlots.includes(nextSlot - 1)) {
      freeSlots.splice(freeSlots.indexOf(nextSlot - 1), 1);
      nextSlot--;
    }
  }
  function relayout() {
    const next = capacityFor(nextSlot);
    if (next !== cols) {
      cols = next;
      order = spiral(cols);
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    kick();
  }

  // ---- chips ----
  function launch(c: Chip, delay: number, now: number) {
    const [tx, ty] = slotXY(c.slot);
    if (reduced) {
      c.docked = true; c.x = tx; c.y = ty; c.dockAt = -1e9;
      return;
    }
    const ang = Math.random() * Math.PI * 2;
    const R = Math.max(W, H) * 0.75;
    c.fx = W / 2 + Math.cos(ang) * R;
    c.fy = H / 2 + Math.sin(ang) * R;
    // Curve sideways so the flights swirl into the package.
    const mx = (c.fx + tx) / 2, my = (c.fy + ty) / 2;
    const nx = -(ty - c.fy), ny = tx - c.fx;
    const k = 0.35 * (Math.random() < 0.5 ? -1 : 1);
    c.cxp = mx + nx * k; c.cyp = my + ny * k;
    c.t0 = now + delay;
    c.dur = 1100 + Math.random() * 700;
    c.docked = false;
    c.x = c.fx; c.y = c.fy;
  }

  function makeChip(id: string, rig: RigDot | null, vram: number, slot: number): Chip {
    return {
      id, rig, slot, vram, color: tierFor(vram).color, x: 0, y: 0, size: sizeFor(vram),
      t0: 0, dur: 0, fx: 0, fy: 0, cxp: 0, cyp: 0, docked: false, dockAt: 0, you: false, preview: false, leaving: 0,
    };
  }

  /**
   * Merge rigs (newest first, as the backend returns them). New ids fly into a free socket;
   * known ids stay put (their size and label update in place); ids that dropped out of the
   * latest window, or were removed, fade out and free their socket. Your own chip stays.
   */
  function setRigs(recent: RigDot[], youId: string | null, intro: boolean) {
    const now = performance.now();
    const ids = new Set(recent.map((r) => r.id));
    for (const c of chips.values()) {
      if (ids.has(c.id) || (youId && c.id === youId) || c.leaving) continue;
      // The socket frees straight away; the chip fades from where it sits.
      releaseSlot(c.slot);
      if (reduced) drop(c);
      else { c.leaving = now; c.you = false; }
    }
    const born: Chip[] = [];
    for (const r of [...recent].reverse()) {
      const known = chips.get(r.id);
      if (known) {
        known.rig = r;
        known.vram = Number(r.vram_gb);
        known.color = tierFor(known.vram).color;
        known.leaving = 0;
        continue;
      }
      // The person's own rig coming back from the backend replaces the preview, never duplicates it.
      if (youId && r.id === youId && preview) {
        promotePreview(r);
        continue;
      }
      const c = makeChip(r.id, r, Number(r.vram_gb), allocSlot());
      c.you = r.id === youId;
      chips.set(r.id, c);
      born.push(c);
    }
    compact();
    relayout();
    // A big batch still lands within a few seconds, well before the next poll.
    const step = intro ? Math.min(45, 2600 / Math.max(1, born.length)) : Math.min(260, 6000 / Math.max(1, born.length));
    born.forEach((c, i) => launch(c, (intro ? 250 : 0) + i * step, now));
    kick();
  }

  function drop(c: Chip) {
    chips.delete(c.id);
    if (hover === c) hover = null;
  }

  /** Close the gaps left by chips that left: everyone glides inward, keeping their order. */
  function compact() {
    const stay = [...chips.values()].filter((c) => !c.leaving).sort((a, b) => a.slot - b.slot);
    stay.forEach((c, i) => { c.slot = i; });
    let n = stay.length;
    if (preview) preview.slot = n++; // the preview stays at the growing edge
    freeSlots.length = 0;
    nextSlot = n;
  }

  function promotePreview(r: RigDot) {
    if (!preview) return;
    preview.id = r.id;
    preview.rig = r;
    preview.vram = Number(r.vram_gb);
    preview.color = tierFor(preview.vram).color;
    preview.preview = false;
    preview.you = true;
    chips.set(r.id, preview); // keeps the socket it already had
    preview = null;
  }

  /** The person's own pick, shown in the next free slot and labelled as not in the cluster. */
  function setPreview(p: PreviewChip | null) {
    const now = performance.now();
    if (!p) {
      preview = null;
      compact();
      relayout();
      kick();
      return;
    }
    if (preview) {
      preview.vram = p.vramGb;
      preview.color = tierFor(p.vramGb).color;
      preview.rig = { id: "preview", gpu_model: p.label, vram_gb: p.vramGb, country: null };
      preview.dockAt = now; // little flash on change
    } else {
      preview = makeChip("preview", { id: "preview", gpu_model: p.label, vram_gb: p.vramGb, country: null }, p.vramGb, allocSlot());
      preview.preview = true;
      relayout();
      launch(preview, reduced ? 0 : 500, now);
    }
    kick();
  }

  /** After a successful join: the preview gives way to a real chip that flies in and docks. */
  function join(id: string, gpu: string, vram: number) {
    const now = performance.now();
    let c = chips.get(id);
    if (c) {
      c.vram = vram;
      c.color = tierFor(vram).color;
      c.rig = { id, gpu_model: gpu, vram_gb: vram, country: c.rig?.country ?? null };
      c.leaving = 0;
    } else {
      // Take over the preview's socket when there is one.
      c = makeChip(id, { id, gpu_model: gpu, vram_gb: vram, country: null }, vram, preview ? preview.slot : allocSlot());
      chips.set(id, c);
    }
    c.you = true;
    preview = null;
    compact();
    relayout();
    launch(c, 0, now);
    kick();
  }

  function setMode(m: Mode) {
    mode = m;
    kick();
  }

  // ---- drawing ----
  function drawPackage(t: number) {
    const p = pad(), a = area();
    // Halo
    const g = ctx.createRadialGradient(W / 2, H / 2, a * 0.05, W / 2, H / 2, a * 0.75);
    g.addColorStop(0, "rgba(198,242,78,0.10)");
    g.addColorStop(1, "rgba(198,242,78,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Substrate
    const sg = ctx.createLinearGradient(p, p, p + a, p + a);
    sg.addColorStop(0, "#1a1a17");
    sg.addColorStop(1, "#10100e");
    rr(ctx, p - 10, p - 10, a + 20, a + 20, 18);
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = "#34332d";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Edge contacts
    ctx.fillStyle = "#3d3c34";
    const nC = Math.max(8, Math.round(a / 22));
    for (let i = 0; i < nC; i++) {
      const o = p + 8 + (i * (a - 16)) / (nC - 1);
      ctx.fillRect(o - 3, p - 17, 6, 4);
      ctx.fillRect(o - 3, p + a + 13, 6, 4);
      ctx.fillRect(p - 17, o - 3, 4, 6);
      ctx.fillRect(p + a + 13, o - 3, 4, 6);
    }
    // Traces between sockets
    const c = cell();
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      ctx.moveTo(p + i * c, p);
      ctx.lineTo(p + i * c, p + a);
      ctx.moveTo(p, p + i * c);
      ctx.lineTo(p + a, p + i * c);
    }
    ctx.stroke();
    // Empty sockets
    const used = new Set<number>();
    for (const ch of chips.values()) used.add(ch.slot);
    if (preview) used.add(preview.slot);
    const waveR = waveRadius(t);
    for (let s = 0; s < order.length; s++) {
      if (used.has(s)) continue;
      const [x, y] = slotXY(s);
      const sz = c * 0.44;
      const boost = waveBoost(x, y, waveR);
      ctx.strokeStyle = `rgba(239,234,224,${0.06 + boost * 0.2})`;
      ctx.lineWidth = 1;
      rr(ctx, x - sz / 2, y - sz / 2, sz, sz, Math.max(1, sz * 0.12));
      ctx.stroke();
    }
    // Labels on the substrate
    ctx.font = `${Math.max(9, Math.min(11, W / 50))}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#8f8a7a";
    ctx.textAlign = "left";
    const ly = p - 28;
    ctx.fillText("VRAM CLUSTER", p - 10, ly);
    ctx.textAlign = "right";
    const tag = mode === "live" ? "LIVE" : mode === "empty" ? "OPEN" : mode === "error" ? "UNREACHABLE" : "OPENS SOON";
    ctx.fillText(tag, p + a - 4, ly);
    const blink = mode === "live" ? 0.55 + 0.45 * Math.sin(t / 380) : 1;
    ctx.fillStyle = mode === "live" ? `rgba(198,242,78,${reduced ? 1 : blink})` : mode === "error" ? "#e7a948" : "#5f5b4f";
    ctx.beginPath();
    ctx.arc(p + a + 6, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Packets: short bursts of light running along the traces toward the core, so the package
  // reads as powered even before anyone has joined.
  interface Packet { line: number; vertical: boolean; dir: 1 | -1; t0: number; dur: number }
  const packets: Packet[] = [];
  function spawnPacket(t: number) {
    const half = Math.floor(cols / 2);
    let line = Math.floor(Math.random() * (cols + 1));
    if (line === half || line === half + 1) line = Math.random() < 0.5 ? half - 1 : half + 2;
    packets.push({ line, vertical: Math.random() < 0.5, dir: Math.random() < 0.5 ? 1 : -1, t0: t, dur: 1400 + Math.random() * 1600 });
  }
  function drawPackets(t: number) {
    if (reduced) return;
    const want = Math.max(6, Math.round(cols * 0.9));
    while (packets.length < want) spawnPacket(t - Math.random() * 2000);
    const p = pad(), a = area(), c = cell();
    for (let i = packets.length - 1; i >= 0; i--) {
      const k = packets[i]!;
      const ph = (t - k.t0) / k.dur;
      if (ph >= 1) { packets.splice(i, 1); continue; }
      if (ph < 0) continue;
      // Run from one edge to the middle of the line, fading as it reaches the core.
      const along = (k.dir === 1 ? ph * 0.5 : 1 - ph * 0.5) * a;
      const fixed = p + k.line * c;
      const x = k.vertical ? fixed : p + along;
      const y = k.vertical ? p + along : fixed;
      const len = c * 1.6 * (k.dir === 1 ? -1 : 1);
      const x2 = k.vertical ? x : x + len, y2 = k.vertical ? y + len : y;
      const alpha = Math.sin(ph * Math.PI) * 0.75;
      const g = ctx.createLinearGradient(x, y, x2, y2);
      g.addColorStop(0, `rgba(198,242,78,${alpha})`);
      g.addColorStop(1, "rgba(198,242,78,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // A power pulse that rolls out from the core every few seconds.
  const WAVE_EVERY = 5200;
  function waveRadius(t: number) {
    if (reduced) return -1e9;
    const ph = ((t - start) % WAVE_EVERY) / WAVE_EVERY;
    return ph * area() * 0.85;
  }
  function waveBoost(x: number, y: number, r: number) {
    const d = Math.hypot(x - W / 2, y - H / 2);
    const k = 1 - Math.abs(d - r) / (cell() * 1.6);
    return k > 0 ? k : 0;
  }

  function drawChip(c: Chip, x: number, y: number, t: number, flying: boolean, boost: number) {
    const s = c.size * cell();
    const r = Math.max(1.5, s * 0.14);
    const half = s / 2;
    if (c.preview) {
      // Not in the cluster: an outlined chip with a breathing glow.
      const br = reduced ? 0.8 : 0.6 + 0.4 * Math.sin(t / 420);
      ctx.save();
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 18 * br;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.5;
      rr(ctx, x - half, y - half, s, s, r);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.28 + 0.12 * br;
      ctx.fillStyle = c.color;
      rr(ctx, x - half, y - half, s, s, r);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    // shadowBlur is expensive; only a limited number of chips glow per frame.
    const glow = c.you || (flying && glowBudget-- > 0);
    if (glow) {
      ctx.save();
      ctx.shadowColor = c.color;
      ctx.shadowBlur = c.you ? 16 : 14;
    }
    ctx.globalAlpha = 0.78 + 0.22 * boost;
    ctx.fillStyle = c.color;
    rr(ctx, x - half, y - half, s, s, r);
    ctx.fill();
    if (glow) ctx.restore();
    ctx.globalAlpha = 1;
    if (s >= 9) {
      // The die and a sheen.
      const d = s * 0.42;
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      rr(ctx, x - d / 2, y - d / 2, d, d, Math.max(1, d * 0.15));
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(x - half + r * 0.6, y - half + 1, s - r * 1.2, Math.max(1, s * 0.08));
    }
    if (s >= 16) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      const pins = 3;
      for (let i = 0; i < pins; i++) {
        const o = -half + (s * (i + 1)) / (pins + 1);
        ctx.fillRect(x + o - 1, y + half - 3, 2, 2);
        ctx.fillRect(x + o - 1, y - half + 1, 2, 2);
      }
    }
    if (boost > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${boost * 0.25})`;
      rr(ctx, x - half, y - half, s, s, r);
      ctx.fill();
    }
  }

  function drawTag(text: string, x: number, y: number, color: string) {
    ctx.font = `600 ${W < 420 ? 10 : 11}px "JetBrains Mono", monospace`;
    const w = ctx.measureText(text).width + 14;
    let tx = Math.min(Math.max(x - w / 2, 4), W - w - 4);
    const above = y - cell() * 0.5 - 24;
    const ty = above < pad() - 6 ? y + cell() * 0.5 + 4 : above;
    ctx.fillStyle = color;
    rr(ctx, tx, ty, w, 19, 4);
    ctx.fill();
    ctx.fillStyle = "#10120a";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, tx + 7, ty + 10);
  }

  let needsAnim = true;
  let glowBudget = 0;
  function frame(t: number) {
    raf = 0;
    glowBudget = 40;
    ctx.clearRect(0, 0, W, H);
    drawPackage(t);
    drawPackets(t);
    const waveR = waveRadius(t);
    let busy = false;
    const flyingList: [Chip, number, number][] = [];
    const all = [...chips.values()];
    if (preview) all.push(preview);
    for (const c of all) {
      if (c.leaving) {
        const k = (t - c.leaving) / FADE_MS;
        if (k >= 1) { drop(c); busy = true; continue; }
        ctx.globalAlpha = 1 - k;
        drawChip(c, c.x, c.y, t, false, 0);
        ctx.globalAlpha = 1;
        busy = true;
        continue;
      }
      const [tx, ty] = slotXY(c.slot);
      // Size morphs toward the target (preview card changes).
      const target = sizeFor(c.vram);
      if (Math.abs(c.size - target) > 0.002) {
        c.size += (target - c.size) * (reduced ? 1 : 0.18);
        busy = true;
      }
      if (!c.docked) {
        if (t < c.t0) { busy = true; continue; }
        const p = Math.min(1, (t - c.t0) / c.dur);
        const e = ease(p);
        const u = 1 - e;
        c.x = u * u * c.fx + 2 * u * e * c.cxp + e * e * tx;
        c.y = u * u * c.fy + 2 * u * e * c.cyp + e * e * ty;
        if (p >= 1) { c.docked = true; c.dockAt = t; c.x = tx; c.y = ty; }
        busy = true;
        if (!c.docked) { flyingList.push([c, c.x, c.y]); continue; }
      } else if (Math.abs(c.x - tx) > 0.3 || Math.abs(c.y - ty) > 0.3) {
        c.x += (tx - c.x) * (reduced ? 1 : 0.12);
        c.y += (ty - c.y) * (reduced ? 1 : 0.12);
        busy = true;
      } else { c.x = tx; c.y = ty; }
      drawChip(c, c.x, c.y, t, false, waveBoost(c.x, c.y, waveR));
      // Dock flash: a ring that expands and fades.
      const since = t - c.dockAt;
      if (!reduced && since >= 0 && since < 650) {
        const k = since / 650;
        ctx.strokeStyle = c.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 1.5;
        const s = c.size * cell() * (1 + k * 1.6);
        rr(ctx, c.x - s / 2, c.y - s / 2, s, s, 3);
        ctx.stroke();
        ctx.globalAlpha = 1;
        busy = true;
      }
    }
    // Flights on top, with a short trail.
    for (const [c, x, y] of flyingList) {
      const p = Math.min(1, (t - c.t0) / c.dur);
      for (let k = 3; k >= 1; k--) {
        const e = ease(Math.max(0, p - k * 0.025));
        const u = 1 - e;
        const [tx, ty] = slotXY(c.slot);
        const gx = u * u * c.fx + 2 * u * e * c.cxp + e * e * tx;
        const gy = u * u * c.fy + 2 * u * e * c.cyp + e * e * ty;
        ctx.globalAlpha = 0.12 * (4 - k);
        ctx.fillStyle = c.color;
        const s = c.size * cell() * (1 - k * 0.15);
        rr(ctx, gx - s / 2, gy - s / 2, s, s, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawChip(c, x, y, t, true, 0);
    }
    // Labels last so nothing covers them.
    const you = all.find((c) => c.you && c.docked);
    if (you) drawTag("YOU", you.x, you.y, you.color);
    if (preview && preview.docked) drawTag("YOU · PREVIEW", preview.x, preview.y, preview.color);
    if (hover && hover.docked) {
      ctx.strokeStyle = "#efeae0";
      ctx.lineWidth = 1.5;
      const s = hover.size * cell() + 4;
      rr(ctx, hover.x - s / 2, hover.y - s / 2, s, s, 3);
      ctx.stroke();
    }
    needsAnim = busy;
    // Ambient pulse keeps running while visible; otherwise stop when nothing moves.
    if (!reduced && visible && onscreen) raf = requestAnimationFrame(frame);
    else if (busy && !reduced) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!W) return;
    if (reduced) {
      // Static: draw one settled frame.
      if (!raf) raf = requestAnimationFrame(frame);
      return;
    }
    if (!visible || !onscreen) return;
    if (!raf) raf = requestAnimationFrame(frame);
    running = true;
  }

  // ---- visibility ----
  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState === "visible";
    if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
    else kick();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => {
      onscreen = es.some((e) => e.isIntersecting);
      if (!onscreen && raf) { cancelAnimationFrame(raf); raf = 0; }
      else kick();
    }).observe(canvas);
  }
  new ResizeObserver(resize).observe(canvas);

  // ---- hover: what is this chip ----
  function chipAt(px: number, py: number): Chip | null {
    const all = [...chips.values()];
    if (preview) all.push(preview);
    for (const c of all) {
      if (!c.docked) continue;
      const h = (c.size * cell()) / 2 + 2;
      if (Math.abs(px - c.x) <= h && Math.abs(py - c.y) <= h) return c;
    }
    return null;
  }
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const c = chipAt(px, py);
    if (c !== hover) {
      hover = c;
      kick();
    }
    if (!c || !c.rig) {
      tooltip.hidden = true;
      return;
    }
    const where = c.rig.country ? `  ${c.rig.country}` : "";
    tooltip.textContent = `${c.rig.gpu_model}  ${Number(c.rig.vram_gb)} GB${where}${c.preview ? "\nyour pick, not in the cluster" : ""}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(Math.max(px, 80), W - 80)}px`;
    tooltip.style.top = `${c.y - (c.size * cell()) / 2}px`;
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    tooltip.hidden = true;
    kick();
  });

  void needsAnim; void running;
  resize();
  return { setRigs, setPreview, setMode, join, count: () => chips.size };
}
