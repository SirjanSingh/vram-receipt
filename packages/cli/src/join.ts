// The opt-in global cluster, CLI side. Nothing here sends anything by itself:
// cli.ts calls submitRig only after a yes or an explicit --join.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { countryFromTimeZone } from "@vram-receipt/core";
import type { MatchResult, RigPayload } from "@vram-receipt/core";

/** Largest VRAM the cluster accepts (the table's check constraint). */
export const MAX_VRAM_GB = 192;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const defaultIdDir = () => join(os.homedir(), ".vram-receipt");

/** The saved install id, or null when there is none (or it is not a UUID). Never creates anything. */
export function readClientId(dir = defaultIdDir()): string | null {
  try {
    const id = readFileSync(join(dir, "id"), "utf8").trim();
    return UUID.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Write the id so a later run updates the same entry. Returns false when the folder is not writable. */
export function saveClientId(id: string, dir = defaultIdDir()): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "id"), `${id}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** The saved id, or a fresh one (not saved yet). */
export function clientIdFor(dir = defaultIdDir()): { id: string; saved: boolean } {
  const id = readClientId(dir);
  return id ? { id, saved: true } : { id: randomUUID(), saved: false };
}

/**
 * The payload for the biggest-VRAM card and how many identical copies of it the rig has,
 * or null when there is nothing the cluster can take.
 */
export function buildPayload(best: MatchResult | null, ramGb: number | null, clientId: string, tz?: string, gpuCount = 1): RigPayload | null {
  if (!best || best.vramGb == null || !(best.vramGb > 0) || best.vramGb > MAX_VRAM_GB) return null;
  const ram = ramGb != null ? Math.round(ramGb) : null;
  return {
    clientId,
    gpuModel: best.displayName.slice(0, 60),
    vramGb: best.vramGb,
    gpuCount: Math.min(16, Math.max(1, gpuCount)),
    ramGb: ram != null && ram >= 1 && ram <= 4096 ? ram : null,
    generation: best.generation,
    country: countryFromTimeZone(tz),
    source: "cli",
  };
}

export type JoinDecision =
  | "send" // --join
  | "ask" // interactive terminal, no flag
  | "skip" // --no-join, --json, or nothing to send
  | "hint" // not a terminal: do not ask, say how to join
  | "closed"; // cluster not set up yet

export function decideJoin(o: { join: boolean; noJoin: boolean; json: boolean; interactive: boolean; configured: boolean; hasPayload: boolean }): JoinDecision {
  if (o.noJoin || !o.hasPayload) return "skip";
  if (!o.join && o.json) return "skip";
  if (!o.configured) return o.json ? "skip" : "closed";
  if (o.join) return "send";
  return o.interactive ? "ask" : "hint";
}

/** Ask a yes/no question. Anything but y/yes, or closing the input (Ctrl+C, Ctrl+D), is a no. */
export function askYesNo(question: string, input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input, output, terminal: Boolean((input as { isTTY?: boolean }).isTTY) });
    let done = false;
    const finish = (yes: boolean) => {
      if (done) return;
      done = true;
      rl.close();
      resolve(yes);
    };
    rl.on("SIGINT", () => {
      output.write("\n");
      finish(false);
    });
    rl.on("close", () => finish(false));
    rl.question(question, (answer) => finish(/^\s*y(es)?\s*$/i.test(answer)));
  });
}
