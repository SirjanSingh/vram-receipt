# vram-receipt

*Dedication: thank you, Jensen. 1993 to 2026.*

How much VRAM did each GeForce generation give you per launch dollar? This repo is an open dataset
that answers it for every desktop GeForce card from the 10 series to the 50 series, CPI-adjusted,
plus a small command that prints a receipt for the GPU and RAM in your own machine, gives it a
tier, and makes a "Thanks, Jensen" card you can share.

```
npx vram-receipt
```

```
VRAM RECEIPT                                      2026-11-16
------------------------------------------------------------
Graphics card                                       RTX 3060
  Video memory (VRAM)                                  12 GB
  Price at launch                                       $329
System memory (RAM)                                    32 GB
------------------------------------------------------------
More VRAM than 50% of gamers on Steam.
Good value: 2.3x the memory per dollar of its series.
------------------------------------------------------------
YOUR RANK                                          FRONT ROW
Close enough to see the jacket shine.
------------------------------------------------------------
THANK YOU, JENSEN.                              1993 to 2026
```

It also saves two images in the folder you ran it from: the receipt as `vram-receipt.png` and a
1200x630 share card, `thanks-jensen.png`, with your VRAM, card and tier.

Then, if you are in a terminal, it shows exactly what it would send and asks whether to add your
rig to the farewell VRAM cluster. The default is no. Say yes and you get your rank in the cluster
and a share link, and the rank goes on the card too.

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
npx vram-receipt --join                  # add your rig to the farewell cluster without asking
npx vram-receipt --no-join               # never ask about the cluster
npx vram-receipt --no-png                # text only, no images
npx vram-receipt --json                  # machine-readable, never asks
```

- Needs Node 18 or newer. No install step, no postinstall script.
- **Nothing is sent unless you say yes (or pass `--join`).** The receipt and both images are made
  on your machine; the dataset is bundled inside the command. The only network request the command
  can make is the cluster join, and it prints every field first. Piped, scripted and `--json` runs
  never ask and never send without `--join`. See [PRIVACY.md](PRIVACY.md) for every field.
- Detection reads `nvidia-smi` for Nvidia cards. For AMD and Intel on Windows the system does not
  report VRAM reliably, so pass `--gpu`. If the tool cannot tell what you have, it says so. It
  never guesses a number, and a machine with no known VRAM size gets no tier and is not offered the
  cluster.
- Laptop GPUs, AMD, Intel and Apple Silicon get a receipt without the price block, because the
  dataset only covers desktop GeForce cards.

### Tiers

The tier comes from the VRAM of your biggest card. The lines are jokes, not data.

| VRAM | Tier |
| --- | --- |
| under 4 GB | Spare Change |
| 4 GB | Tip Jar |
| 8 GB | Keynote Ticket |
| 12 GB | Front Row |
| 16 GB | Backstage Pass |
| 24 GB | Leather Jacket |
| 32 GB and up | The Kitchen |

### The farewell cluster

An opt-in, public tally of the rigs people chose to add. Your rank is 1 plus the number of rigs with
more VRAM than yours. It is a self-selected sample, not a survey of PCs; see [METHOD.md](METHOD.md).
Running the command again updates your entry instead of adding a new one. The cluster is not open
yet; until it is, the command says so and sends nothing.

## The page

The web page (chart, a pick-your-card receipt and the cluster) currently lives on a `pages.dev`
address, not a domain of its own. It is a static page with no analytics or cookies. The cluster
numbers come from a small Supabase database (see [PRIVACY.md](PRIVACY.md)).

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
