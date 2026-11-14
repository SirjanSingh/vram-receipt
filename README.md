# vram-receipt

*Dedication: thanks, Jensen.*

How much VRAM did each GeForce generation give you per launch dollar? This repo is an open dataset
that answers it for every desktop GeForce card from the 10 series to the 50 series, CPI-adjusted,
plus a small command that prints a receipt for the GPU and RAM in your own machine.

```
npx vram-receipt
```

```
VRAM RECEIPT                       (local run, not uploaded)
DATE 2026-11-16                          MACHINE: --gpu flag
------------------------------------------------------------
GPU    RTX 3060 (12 GB)                       GEN: 30-series
       launch MSRP $329 (MSRP, not street price)
       = $421 in today's dollars (CPI)
       VRAM per launch dollar                      37.4 MB/$
       vs gen median MSRP                          16.4 MB/$
------------------------------------------------------------
SYSTEM RAM   32 GB
------------------------------------------------------------
STEAM  your VRAM bin: 12 GB
       12.91% of Steam survey machines (Oct 2026)
       more VRAM than 50.5% (method: METHOD.md)
VERDICT  Survived the shortage. Kept the card.
------------------------------------------------------------
Data: github.com/SirjanSingh/vram-receipt (CC BY-SA 4.0)
unofficial fan project, not affiliated with or endorsed by
NVIDIA or Jensen Huang
```

It also saves the receipt as `vram-receipt.png` in the folder you ran it from.

## The data

[`data/gift-index.csv`](data/gift-index.csv) is the actual product: 55 desktop cards, one row per
model and memory size, each with its launch date, launch MSRP, the Nvidia page that states that
price, the CPI-adjusted price, and VRAM per dollar. Use it for anything; it is CC BY-SA 4.0.

Read this before quoting a number:

- **Prices are launch MSRP, not street price.** Plenty of these cards never sold at MSRP. There is
  no price history that can be legally republished, so this dataset does not include one.
- 11 of the 55 rows have no price because I could not confirm one on a primary source. Blank means
  unknown.
- Inflation uses US CPI. The comparison against other machines uses the Steam survey, which is an
  opt-in sample.

The full method, including the exact formulas, is in [METHOD.md](METHOD.md). Sources are in
[data/SOURCES.md](data/SOURCES.md).

## The command

```
npx vram-receipt                         # detect this machine
npx vram-receipt --gpu "RTX 3060 12GB"   # name the card yourself
npx vram-receipt --ram 32 --paid 450     # set RAM, add what you paid
npx vram-receipt --no-png                # text only
npx vram-receipt --json                  # machine-readable
```

- Needs Node 18 or newer. No install step, no postinstall script.
- **Nothing leaves your machine.** The command makes no network calls; the dataset is bundled
  inside it. See [PRIVACY.md](PRIVACY.md).
- Detection reads `nvidia-smi` for Nvidia cards. For AMD and Intel on Windows the system does not
  report VRAM reliably, so pass `--gpu`. If the tool cannot tell what you have, it says so. It
  never guesses a number.
- Laptop GPUs, AMD, Intel and Apple Silicon get a receipt without the price block, because the
  dataset only covers desktop GeForce cards.

## The page

The web page (chart plus a pick-your-card receipt) currently lives on a `pages.dev` address, not a
domain of its own. It is a static page with no backend, analytics or cookies.

## Develop

```
npm install
npm run data:build    # recompute derived columns, regenerate the embedded data
npm test
npm run build         # CLI bundle in packages/cli/dist
npm run dev:web       # the page
```

Corrections are welcome, especially a primary source for a blank price. Open an issue or a pull
request and include the link.

## Disclaimer

This is an unofficial fan project. It is not affiliated with, sponsored by or endorsed by NVIDIA
Corporation or Jensen Huang. NVIDIA, GeForce, GTX and RTX are trademarks of NVIDIA Corporation and
are used here only to name the products the data describes. Steam is a trademark of Valve
Corporation.

## Licence

Code: MIT ([LICENSE](LICENSE)). Data in `data/`: CC BY-SA 4.0 ([data/LICENSE](data/LICENSE)).
Bundled font: JetBrains Mono, SIL OFL 1.1.
