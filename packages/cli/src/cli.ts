import { resolve } from "node:path";
import { buildReceipt } from "@vram-receipt/core";
import type { GpuInput } from "@vram-receipt/core";
import { detect } from "./detect";
import { renderPng } from "./png";

declare const __VERSION__: string;

const HELP = `vram-receipt: a receipt for your GPU and RAM

  npx vram-receipt                       detect this machine
  npx vram-receipt --gpu "RTX 3060 12GB" skip detection, name the card
  npx vram-receipt --ram 32              set system RAM in GB

Options
  --gpu <name>     card name, with its size if the model came in several
                   (repeat the flag for more than one card)
  --ram <gb>       system RAM in GB
  --paid <usd>     what you paid, printed as you typed it
  --png <path>     where to write the image (default ./vram-receipt.png)
  --no-png         text only
  --json           print the result as JSON instead of the receipt
  -h, --help       this text
  -v, --version    version

Runs locally. Nothing is uploaded and there are no network calls.
Prices are launch MSRP, not street price. Method: METHOD.md in the repo.
Unofficial fan project, not affiliated with or endorsed by NVIDIA or Jensen Huang.`;

interface Args {
  gpus: string[];
  ram: number | null;
  paid: number | null;
  png: string | null;
  noPng: boolean;
  json: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const a: Args = { gpus: [], ram: null, paid: null, png: null, noPng: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => inline ?? argv[++i] ?? fail(`${flag} needs a value. See --help.`);
    const positive = (label: string) => {
      const n = Number(String(value()).replace(/[$,]|gb$/gi, ""));
      if (!Number.isFinite(n) || n <= 0) fail(`${label} must be a positive number.`);
      return n;
    };
    switch (flag) {
      case "-h": case "--help": process.stdout.write(`${HELP}\n`); process.exit(0);
      case "-v": case "--version": process.stdout.write(`${__VERSION__}\n`); process.exit(0);
      case "--gpu": a.gpus.push(String(value())); break;
      case "--ram": a.ram = positive("--ram"); break;
      case "--paid": a.paid = positive("--paid"); break;
      case "--png": a.png = String(value()); break;
      case "--no-png": a.noPng = true; break;
      case "--json": a.json = true; break;
      default: fail(`Unknown option ${arg}. See --help.`);
    }
  }
  if (a.ram != null && (a.ram < 1 || a.ram > 4096)) fail("--ram is in GB, for example --ram 32.");
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let gpus: GpuInput[] = args.gpus.map((name) => ({ name, vramMb: null, source: "--gpu flag" }));
  let ramGb = args.ram;
  if (gpus.length === 0 || ramGb == null) {
    const d = await detect();
    if (gpus.length === 0) gpus = d.gpus;
    if (ramGb == null) ramGb = d.ramGb;
  }

  const date = new Date().toISOString().slice(0, 10);
  const receipt = buildReceipt({ gpus, ramGb, paidUsd: args.paid, date });

  // Detection failed if there is no card with a known size, a dataset match or unified memory.
  const usable = receipt.matches.some((m, i) => m.vramGb != null || m.sku != null || gpus[i]?.unified);
  if (!usable) {
    const saw = gpus.length ? ` (saw: ${gpus.map((g) => g.name).join("; ")})` : "";
    const multi = receipt.matches.find((m) => m.kind === "known-model-other-vram" && m.vramGb == null);
    process.stderr.write(
      multi
        ? `${multi.displayName} came in more than one memory size. Pass it with the size, for example --gpu "${multi.displayName} 12GB"\n`
        : `couldn't detect your GPU's VRAM${saw}, pass --gpu "RTX 3060 12GB"\n`,
    );
    process.exit(2);
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ date, ramGb, gpus: receipt.matches, uploaded: false }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`\n${receipt.text}\n\n`);
  if (!args.noPng) {
    const out = resolve(args.png ?? "vram-receipt.png");
    const res = await renderPng(receipt.lines, out);
    process.stdout.write(res.ok ? `Image saved: ${out}\n` : `(No image: ${res.reason}. The text above is the receipt.)\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`vram-receipt failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
