import { execFile } from "node:child_process";
import os from "node:os";
import { generationOf, nominalRamGb, parseNvidiaSmi } from "@vram-receipt/core";
import type { GpuInput } from "@vram-receipt/core";

const SMI_ARGS = ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"];
const SMI_PATHS = [
  "nvidia-smi",
  "C:\\Windows\\System32\\nvidia-smi.exe",
  "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
];
const TIMEOUT_MS = 4000;

function run(file: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
    } catch {
      resolve(null);
    }
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms).unref())]);
}

/** nvidia-smi on PATH, then System32, then the old NVSMI folder. */
async function fromNvidiaSmi(): Promise<GpuInput[]> {
  for (const file of SMI_PATHS) {
    if (file !== "nvidia-smi" && process.platform !== "win32") continue;
    const out = await run(file, SMI_ARGS);
    if (out) {
      const gpus = parseNvidiaSmi(out);
      if (gpus.length) return gpus;
    }
  }
  return [];
}

/** 10/16/20 series notebook GPUs report desktop names, so ask the machine whether it is a laptop. */
async function isLaptop(): Promise<boolean> {
  const si = await import("systeminformation");
  const chassis = await withTimeout(si.chassis(), 6000);
  if (chassis && /notebook|laptop|portable|convertible|detachable|tablet|sub notebook/i.test(chassis.type ?? "")) return true;
  const battery = await withTimeout(si.battery(), 6000);
  return Boolean(battery?.hasBattery);
}

async function fromSystemInformation(): Promise<GpuInput[]> {
  const si = await import("systeminformation");
  const g = await withTimeout(si.graphics(), 8000);
  if (!g) return [];
  return g.controllers
    .filter((c) => c.model && !/basic (display|render)|virtual|remote|parsec|citrix|vmware|hyper-v/i.test(c.model))
    .map((c): GpuInput => {
      // On Windows the VRAM figure comes from WMI AdapterRAM, a 32-bit field that
      // caps at 4 GB, so it is not trusted. Elsewhere a positive value is used.
      const trusted = process.platform !== "win32" && typeof c.vram === "number" && c.vram >= 256 && !c.vramDynamic;
      return { name: `${c.vendor ?? ""} ${c.model}`.trim(), vramMb: trusted ? c.vram! : null, source: "systeminformation" };
    });
}

export interface Detection {
  gpus: GpuInput[];
  ramGb: number | null;
}

export async function detect(): Promise<Detection> {
  const total = os.totalmem();
  const ramGb = total > 0 ? nominalRamGb(total) : null;

  // Apple Silicon: one pool of memory. Count it as RAM only.
  if (process.platform === "darwin" && process.arch === "arm64") {
    const chip = os.cpus()[0]?.model?.trim() || "Apple Silicon";
    return { gpus: [{ name: chip, vramMb: null, source: "systeminformation", unified: true }], ramGb };
  }

  let gpus = await fromNvidiaSmi();
  if (gpus.length) {
    const ambiguous = gpus.some((g) => {
      if (/laptop|max-?q|mobile/i.test(g.name)) return false;
      const num = g.name.match(/\b(\d{4})\b/);
      const gen = num ? generationOf(Number(num[1])) : null;
      return gen != null && gen <= 20;
    });
    if (ambiguous && (await isLaptop())) gpus = gpus.map((g) => ({ ...g, mobile: true }));
    return { gpus, ramGb };
  }
  return { gpus: await fromSystemInformation(), ramGb };
}
