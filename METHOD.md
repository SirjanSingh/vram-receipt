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

## Reproduce

    npm install
    npm run data:build   # recomputes every derived column and fails on any inconsistency
    npm test
