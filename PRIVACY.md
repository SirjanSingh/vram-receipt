# Privacy

Last updated 2026-11-15.

## The command (`npx vram-receipt`)

The receipt is made on your machine. Nothing is sent unless you say yes (or pass `--join`).

- It reads three things locally: the GPU name and memory size from `nvidia-smi` (or the operating
  system's graphics listing if that is missing), the total system RAM, and on some older Nvidia
  laptops whether the machine has a laptop chassis or a battery.
- It does not read your username, hostname, files or network details. The laptop check asks the
  operating system for chassis details, which can include a serial number; the tool looks only at
  the chassis type and throws the rest away.
- The dataset is bundled inside the command. Printing the receipt and saving the images makes no
  network request.
- After the receipt, it may offer to add your rig to the global cluster (below). It only asks when
  you run it in an interactive terminal, and it prints exactly what would be sent before asking. The
  default answer is no. With `--no-join` it never asks. When the output is piped or scripted, and
  with `--json`, it never asks and never sends unless you passed `--join`.
- It writes two images in the folder you ran it from: `vram-receipt.png` and the share card
  `thanks-jensen.png` (skip both with `--no-png`), plus a temporary font file that it deletes
  straight away.
- Only when you agree to join (a yes, or `--join`), it saves a random id in `~/.vram-receipt/id`,
  just before sending, so that running it again updates your entry instead of adding a second one.
  Delete that folder to forget it.
- There is no telemetry, no install script and no background process.
- For transparency: the command bundles the open-source `systeminformation` library to read the
  graphics listing. That library also contains code for a website check and for talking to Docker.
  This tool never calls either. A test in the repo fails if any source file of the command, other
  than the cluster client (`packages/core/src/cluster.ts`), uses a network API.

`npx` itself downloads the package from the npm registry, which is a request made by npm, not by
this tool. npm's own privacy policy covers that.

## The global cluster

The cluster is an opt-in, public tally of rigs: total VRAM, a rank, and counts by card and country.
You join from the command (by answering yes, or with `--join`) or from the web page.

### What is sent

Exactly these fields, and nothing else:

| Field | Example | Notes |
| --- | --- | --- |
| GPU model | `RTX 3060` | The cleaned name of your card with the most VRAM. |
| VRAM | `12` GB | That card's memory size. |
| GPU count | `8` | How many identical copies of that card the machine has (1 to 16), so a multi-GPU server counts all of them. Always 1 from the web page. |
| System RAM | `32` GB | Left out if it was not detected. |
| Generation | `30` | The GeForce series, or empty for other cards. |
| Country | `IN` | Guessed from your computer's time zone setting, not from your IP address. Left out when the time zone does not point to one country (for example UTC). |
| Install id | a random UUID | Made up on your machine. It is not derived from your hardware, account or network. It lets a re-run update your entry. It is never shown publicly. |
| Source | `cli` or `web` | Whether the entry came from the command or the page. |

Your username, hostname, IP address, serial numbers and files are not part of it.

### What is public

Treat everything in the table above except the install id as public. The page shows cluster
totals, counts by card and country, a VRAM histogram, and a list of the 500 most recent entries
(card, VRAM, country, date and each entry's public id). Anyone can look up an entry by its public id
and see its card, VRAM, RAM, generation, country, date and rank. Joining gives you a share link with
your entry's public id. The install id is never returned.

### Where it is stored

In a Postgres database hosted by Supabase. The table cannot be read or written directly from the
outside. Reads go through three functions (read the totals, read one entry by its share id, remove
your own entry). Adding or updating an entry goes through one server function that limits how many
joins can come from one network.

To enforce that limit, the server keeps a one-way hash of your IP address (salted with a secret, so
it cannot be turned back into the address), the install id, and the time of the join. These records
are deleted after 24 hours and are never public. Your IP address itself is not stored. Supabase's
infrastructure may log requests, including IP addresses, under Supabase's own privacy policy, and I
do not use those logs.

The "Say thank you" button on the page works the same way: a click sends nothing but the request
itself, the server keeps a salted hash of your IP for 24 hours so one network can add at most five a
day, and only the running total is kept. Your browser remembers that you clicked (localStorage).

### Updating and deleting

- Running the command again with `--join` (or answering yes again) updates the same entry, because
  it reuses the id in `~/.vram-receipt/id`.
- To delete your entry, run `npx vram-receipt --leave` on the same machine. Only the private id in
  `~/.vram-receipt/id` can remove an entry; the public id in share links cannot. If you no longer
  have that machine, open an issue on the repository and I will delete it by hand. Deleting
  `~/.vram-receipt` alone does not remove the entry; it only means the next join creates a new one.

## The web page

A static page. The card and RAM you pick are processed in your browser. The page
loads the public cluster totals from the same Supabase database when you open it. Adding your rig
from the page is opt-in, sends the fields listed above (with `web` as the source), and uses a random
id kept in your browser (localStorage). If you choose "Laptop or other GPU", the card name you
type is sent as the GPU model (letters, digits and basic punctuation only), so don't type anything
personal there. "Remove my rig from the cluster" on the page deletes your entry using that id.

There are no cookies, analytics, trackers or advertising scripts. The host
(Cloudflare Pages) keeps standard server logs, which I do not have access to in identifiable form.

## If this changes

Any new field will be listed here before it is sent, and the command will keep showing the exact
data before asking.

## Contact

Open an issue on the repository.
