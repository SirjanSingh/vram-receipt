import { dirname, resolve } from "node:path";
import { buildReceipt, clusterConfigured, leaveCluster, describePayload, shareUrl, submitRig, rigLabel } from "@vram-receipt/core";
import type { GpuInput, RigPayload, SubmitResult } from "@vram-receipt/core";
import { ArgError, parseArgs } from "./args";
import { detect } from "./detect";
import { askYesNo, buildPayload, clientIdFor, readClientId, decideJoin, saveClientId } from "./join";
import { renderPng, renderShareCard } from "./png";

declare const __VERSION__: string;

const HELP = `vram-receipt: a receipt for your GPU and RAM, with a tier and a "Thanks, Jensen" card

  npx vram-receipt                       detect this machine
  npx vram-receipt --gpu "RTX 3060 12GB" skip detection, name the card
  npx vram-receipt --ram 32              set system RAM in GB

Options
  --gpu <name>     card name, with its size if the model came in several
                   (repeat the flag for more than one card)
  --ram <gb>       system RAM in GB
  --paid <usd>     what you paid, printed as you typed it
  --png <path>     where to write the receipt image (default ./vram-receipt.png);
                   the share card thanks-jensen.png goes in the same folder
  --no-png         text only, no images
  --join           add your rig to the farewell cluster without asking
  --no-join        never ask about the farewell cluster
  --leave          remove this machine's entry from the farewell cluster
  --json           print the result as JSON instead of the receipt
  -h, --help       this text
  -v, --version    version

Runs locally. Nothing is sent unless you say yes (or pass --join).
What would be sent is printed before you are asked. Privacy: PRIVACY.md in the repo.
Prices are launch MSRP, not street price. Method: METHOD.md in the repo.
Unofficial fan project, not affiliated with or endorsed by NVIDIA or Jensen Huang.`;

const out = (s: string) => process.stdout.write(s);
const fmt = (n: number) => n.toLocaleString("en-US");

type Joined = { ok: true; value: SubmitResult } | { ok: false; reason: string } | null;

/** Send the payload. Never throws: a failed join is one line, not a crash. */
async function send(payload: RigPayload, idSaved: boolean): Promise<Joined> {
  try {
    // Save the id once the person has agreed and before sending, so a retry after a timeout
    // updates the same entry. Never saved for a no, --no-join, or an unconfigured cluster.
    if (!idSaved) saveClientId(payload.clientId);
    return await submitRig(payload);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof ArgError) {
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }
  if (args.help) return out(`${HELP}\n`);
  if (args.version) return out(`${__VERSION__}\n`);
  if (args.leave) {
    const id = readClientId();
    if (!id) return out("This machine has no cluster entry (no saved id in ~/.vram-receipt).\n");
    const r = await leaveCluster(id);
    if (!r.ok) {
      process.stderr.write(`Could not remove the entry: ${r.reason}\n`);
      process.exit(1);
    }
    return out(r.value.removed > 0 ? "Removed this machine's rig from the farewell cluster.\n" : "No entry for this machine was in the cluster.\n");
  }

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

  const cid = clientIdFor();
  const payload = buildPayload(receipt.best, ramGb, cid.id, undefined, receipt.bestCount);
  const decision = decideJoin({
    join: args.join,
    noJoin: args.noJoin,
    json: args.json,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    configured: clusterConfigured(),
    hasPayload: payload != null,
  });

  if (args.json) {
    const joined = decision === "send" && payload ? await send(payload, cid.saved) : null;
    const cluster = joined?.ok
      ? { id: joined.value.id, rank: joined.value.rank, total: joined.value.total, moreThanPct: joined.value.more_than_pct, shareUrl: shareUrl(joined.value.id) }
      : null;
    const tier = receipt.tier ? { id: receipt.tier.id, name: receipt.tier.name, line: receipt.tier.line } : null;
    // What went over the wire, minus the install id.
    const sent = joined && payload ? (({ clientId: _id, ...rest }) => rest)(payload) : null;
    const body = {
      date, ramGb, tier, gpus: receipt.matches,
      joined: Boolean(joined?.ok), uploaded: Boolean(joined?.ok), sent, cluster,
      ...(joined && !joined.ok ? { joinError: joined.reason } : {}),
    };
    return out(`${JSON.stringify(body, null, 2)}\n`);
  }

  out(`\n${receipt.text}\n\n`);

  let joined: Joined = null;
  if (payload) {
    const preview = describePayload(payload).map((l) => `  ${l}`).join("\n");
    if (decision === "closed") {
      out("The farewell cluster opens soon.\n\n");
    } else if (decision === "hint") {
      out("To add your rig to the farewell cluster, run again with --join.\n\n");
    } else if (decision === "ask") {
      out(`Say goodbye with your GPU. This is what would be sent:\n${preview}\n`);
      const yes = await askYesNo("Add your rig to the farewell cluster? [y/N] ", process.stdin, process.stdout);
      out("\n");
      if (yes) joined = await send(payload, cid.saved);
      else out("Not sent. Nothing left this machine.\n\n");
    } else if (decision === "send") {
      out(`Sending to the farewell cluster (--join):\n${preview}\n\n`);
      joined = await send(payload, cid.saved);
    }
  }
  if (joined?.ok) {
    const r = joined.value;
    out(`You're in the farewell cluster. Thank you, Jensen.\n`);
    if (receipt.tier) out(`  tier     ${receipt.tier.name}\n`);
    out(`  rank     #${fmt(r.rank)} of ${fmt(r.total)}\n`);
    out(`  more VRAM than ${r.more_than_pct}% of the cluster\n`);
    out(`  share    ${shareUrl(r.id)}\n\n`);
  } else if (joined) {
    out(`Could not join the cluster: ${joined.reason}. The receipt above is unaffected.\n\n`);
  }

  if (!args.noPng) {
    const receiptPath = resolve(args.png ?? "vram-receipt.png");
    const res = await renderPng(receipt.lines, receiptPath);
    out(res.ok ? `Receipt image: ${receiptPath}\n` : `(No receipt image: ${res.reason}. The text above is the receipt.)\n`);

    const best = receipt.best;
    if (best && best.vramGb != null && receipt.tier) {
      const cardPath = resolve(dirname(receiptPath), "thanks-jensen.png");
      const r = joined?.ok ? joined.value : null;
      const card = await renderShareCard({
        gpuModel: rigLabel(best.displayName, receipt.bestCount),
        vramGb: best.vramGb * receipt.bestCount,
        ramGb,
        tier: receipt.tier,
        rank: r?.rank ?? null,
        total: r?.total ?? null,
        moreThanPct: r?.more_than_pct ?? null,
        date,
      }, cardPath);
      out(card.ok ? `Share card:    ${cardPath}\n` : `(No share card: ${card.reason}.)\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`vram-receipt failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
