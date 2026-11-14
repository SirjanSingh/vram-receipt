# Privacy

Last updated 2026-11-14.

## The command (`npx vram-receipt`)

Nothing leaves your machine.

- It makes no network requests. The dataset is bundled inside the command.
- It reads three things locally: the GPU name and memory size from `nvidia-smi` (or the operating
  system's graphics listing if that is missing), the total system RAM, and on some older Nvidia
  laptops whether the machine has a laptop chassis or a battery.
- It does not read your username, hostname, serial numbers, files or network details.
- It writes one file, `vram-receipt.png`, in the folder you ran it from (skip it with `--no-png`),
  and a temporary font file that it deletes straight away.
- There is no telemetry, no install script and no background process.

`npx` itself downloads the package from the npm registry, which is a request made by npm, not by
this tool. npm's own privacy policy covers that.

## The web page

A static page. The card and RAM you pick are processed in your browser and are not sent anywhere.
There are no cookies, analytics, trackers or third-party scripts. The host (Cloudflare Pages) keeps
standard server logs, which I do not have access to in identifiable form.

## If this changes

A later version may add an opt-in public tally. If it does, uploading will require an explicit flag,
the exact data will be shown before anything is sent, and this file will list every field first.

## Contact

Open an issue on the repository.
