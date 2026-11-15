# Method

Short version: every number on a receipt comes from `data/gift-index.csv`, a CPI table, or the
Steam survey. Nothing is estimated, and where there is no source the cell is blank.

## What the price is

`msrp_usd` is the launch list price in US dollars, as stated by Nvidia on the page linked in
`msrp_source_url` (a press release or a GeForce news post). It is **MSRP, not street price**. During
the 2020 to 2022 shortage and at several launches since, almost nobody paid it. There is no price
history we can legally republish (PCPartPicker, camelcamelcamel and eBay terms bar reuse), so the
dataset does not pretend to have one. If you want your own number on the receipt, pass `--paid`.

Details that matter:

- For the 10 series and the first 20 series cards Nvidia quoted two prices: a partner-card
  "starting at" price and a higher Founders Edition price. `msrp_usd` is the starting price and
  `fe_price_usd` holds the Founders Edition price. Later generations quote one price.
- A blank `msrp_usd` means I could not confirm a price on a primary source. It is not zero. Those
  rows still exist so the card is recognised, and the receipt prints no price block for them.
  Eleven rows are blank today (GT 1010, GT 1030, GTX 1050 2 GB / 3 GB, GTX 1050 Ti, GTX 1060 3 GB,
  GTX 1630, RTX 2060 12 GB, RTX 3050 6 GB, RTX 3060 8 GB, RTX 3080 12 GB). Pull requests with a
  primary source are welcome.
- One row per (model, memory size). Revisions that kept the name and size (GTX 1650 GDDR6, RTX 3060
  Ti GDDR6X, RTX 4070 GDDR6) are folded into the original row, with a note.
- Desktop cards only. Laptop GPUs have no list price, so a laptop gets a receipt without a price
  block. Titan cards, the China-only RTX 4090 D and GTX 1060 5 GB, and the RTX 4080 12 GB that was
  announced and never launched are not listed.

## VRAM per launch dollar

    mb_per_dollar = vram_gb * 1024 / msrp_usd

"Gen median" on the receipt is the median `mb_per_dollar` over that generation's rows that have an
MSRP. It is a median of list prices across SKUs, not weighted by how many of each card were sold.

## Inflation

    msrp_real_usd = msrp_usd * cpi_now / cpi_launch

CPI is the US CPI-U, all items, **seasonally adjusted** (BLS series CUSR0000SA0, which FRED
publishes as CPIAUCSL). `cpi_launch` is the index for the launch month and `cpi_now` is October 2026
(337.476). The full monthly table is in `data/cpi.csv`. This is US inflation applied to a US list
price. It says nothing about prices in other countries.

## Steam placement

The receipt shows your bin in the Steam Hardware Survey VRAM table (October 2026) and the line
"more VRAM than X%".

- Your bin is the largest survey bin at or below your card's nominal size. A 6 GB card is in the
  6 GB bin; a 5 GB card would land in the 4 GB bin.
- X is the share of surveyed machines in bins **strictly below** yours.
- The survey's "Other" row (1.38%) has no size, so it is dropped from the denominator.
- Machines in your own bin are not counted as below you. A card in the most common bin gets a
  modest number on purpose.

The survey is an opt-in sample of Steam users, all platforms, and includes integrated graphics. It
is not the whole PC market.

## Detection

- Nvidia: `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`, looked up on
  PATH, then `C:\Windows\System32`, then the old NVSMI folder. nvidia-smi reports a little under the
  nominal size (6141 MiB for a 6 GB card), so the figure is rounded to whole GB.
- A name containing Laptop, Max-Q or Mobile never matches a desktop row. 10, 16 and 20 series
  notebook GPUs report desktop names, so for those the tool also checks whether the machine is a
  laptop.
- Windows with AMD or Intel graphics: the WMI memory figure is a 32-bit field that tops out at 4 GB,
  so it is not used. Pass `--gpu`.
- Apple Silicon: memory is unified, so it is counted once, as system RAM.
- If the tool cannot tell, it says so and asks for `--gpu`. It does not guess.

## Verdict lines

Jokes. Not data.

## Tiers

The tier is picked from the nominal VRAM of the card with the most VRAM, times the number of
identical copies of that card in the machine (an 8x V100 32 GB server counts 256 GB; a 3060 next to a
1050 counts 12 GB). The Steam placement stays per card, because the survey counts single cards. Each
tier starts at a size and runs up to the next one:

| From | Tier |
| --- | --- |
| 0 GB | Spare Change |
| 4 GB | Tip Jar |
| 8 GB | Keynote Ticket |
| 12 GB | Front Row |
| 16 GB | Backstage Pass |
| 24 GB | Leather Jacket |
| 32 GB | The Kitchen |

The cut points are round sizes that cards actually ship with, not percentiles. The tier lines are
jokes and contain no statistics. A machine with no known VRAM size (Apple Silicon, or a card the
tool could not size) gets no tier. Source: `packages/core/src/tiers.ts`.

## Cluster rank

Only for people who chose to add their rig to the global cluster. A rig's total VRAM is its per-card
VRAM times its GPU count (1 to 16). For a rig with `v` GB of total VRAM in a cluster of `N` rigs:

    rank          = 1 + (number of rigs with total VRAM > v)
    more_than_pct = 100 * (number of rigs with total VRAM < v) / N, rounded to 0.1

The pooled VRAM on the page is the sum of every rig's total VRAM.

Rigs with the same VRAM share a rank, and rigs with the same VRAM are not counted as below you, the
same rule as the Steam placement. Each install counts once: running the command again updates your
entry. The computation is the `_placement` function in `supabase/migrations/`.

This is a self-reported, opt-in sample of people who ran a GPU receipt tool and chose to share it.
It leans heavily towards enthusiasts with big cards and is not representative of PCs, gamers or
Steam users. Read the rank as "among the people in this cluster", nothing wider.

## Reproduce

    npm install
    npm run data:build   # recomputes every derived column and fails on any inconsistency
    npm test

## The $500 jar

The page shows six jars, one per generation. Each jar holds

    gb_per_500 = median(mb_per_real_dollar over the generation's priced rows) * 500 / 1024

so it is $500 in October 2026 dollars spent at that generation's median VRAM per CPI-adjusted launch
dollar. It is a median of list prices across SKUs, not a card anyone could buy, and it is not
weighted by sales. All six jars use the same 12 GB scale.

## The revenue bar

The revenue bar near the top of the page is Nvidia's most recent reported quarter, typed in by hand from
Nvidia's earnings release (`web/src/revenue.ts`). From fiscal 2027 Nvidia reports two market
platforms, Data Center and Edge Computing, and no longer reports gaming on its own. Edge Computing
is Nvidia's bucket for PCs, game consoles, workstations, AI-RAN base stations, robotics and
automotive. The bar shows one quarter as published; it is not a trend and does not estimate how much
of Edge Computing is GeForce.
