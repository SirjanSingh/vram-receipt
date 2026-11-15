// Argument parsing, kept free of side effects so tests can import it.

export interface Args {
  gpus: string[];
  ram: number | null;
  paid: number | null;
  png: string | null;
  noPng: boolean;
  json: boolean;
  /** Send to the global cluster without asking. */
  join: boolean;
  /** Never ask, never send. */
  noJoin: boolean;
  /** Remove this install's entry from the cluster and exit. */
  leave: boolean;
  help: boolean;
  version: boolean;
}

export class ArgError extends Error {}

export function parseArgs(argv: string[]): Args {
  const a: Args = { gpus: [], ram: null, paid: null, png: null, noPng: false, json: false, join: false, noJoin: false, leave: false, help: false, version: false };
  const fail = (msg: string): never => {
    throw new ArgError(msg);
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = (): string => inline ?? argv[++i] ?? fail(`${flag} needs a value. See --help.`);
    const positive = (label: string) => {
      const n = Number(value().replace(/[$,]|gb$/gi, ""));
      if (!Number.isFinite(n) || n <= 0) fail(`${label} must be a positive number.`);
      return n;
    };
    switch (flag) {
      case "-h": case "--help": a.help = true; break;
      case "-v": case "--version": a.version = true; break;
      case "--gpu": a.gpus.push(value()); break;
      case "--ram": a.ram = positive("--ram"); break;
      case "--paid": a.paid = positive("--paid"); break;
      case "--png": a.png = value(); break;
      case "--no-png": a.noPng = true; break;
      case "--json": a.json = true; break;
      case "--join": a.join = true; break;
      case "--no-join": a.noJoin = true; break;
      case "--leave": a.leave = true; break;
      default: fail(`Unknown option ${arg}. See --help.`);
    }
  }
  if (a.ram != null && (a.ram < 1 || a.ram > 4096)) fail("--ram is in GB, for example --ram 32.");
  if (a.leave && a.join) fail("Pick one of --leave and --join.");
  if (a.join && a.noJoin) fail("Pick one of --join and --no-join.");
  return a;
}
