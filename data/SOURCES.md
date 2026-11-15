# Sources

All retrieved 2026-11-14.

## gift-index.csv

- **Model list, launch dates, memory size and type:** the English Wikipedia articles
  [GeForce 10 series](https://en.wikipedia.org/wiki/GeForce_10_series),
  [GeForce GTX 16 series](https://en.wikipedia.org/wiki/GeForce_GTX_16_series),
  [GeForce RTX 20 series](https://en.wikipedia.org/wiki/GeForce_RTX_20_series),
  [GeForce RTX 30 series](https://en.wikipedia.org/wiki/GeForce_RTX_30_series),
  [GeForce RTX 40 series](https://en.wikipedia.org/wiki/GeForce_RTX_40_series) and
  [GeForce RTX 50 series](https://en.wikipedia.org/wiki/GeForce_RTX_50_series),
  licensed CC BY-SA 4.0. That is why this file is CC BY-SA 4.0 too.
- **Prices:** each `msrp_usd` was read on the Nvidia page in that row's `msrp_source_url`
  (nvidianews.nvidia.com press releases and nvidia.com GeForce news posts). Wikipedia was used to
  find the page, never as the price source. Where the two disagreed or no Nvidia page stated a
  price, the cell is blank.
- Nothing was taken from the TechPowerUp GPU database.

## cpi.csv

US Bureau of Labor Statistics, CPI for All Urban Consumers, all items, seasonally adjusted, series
`CUSR0000SA0`, from the BLS public API
(`https://api.bls.gov/publicAPI/v2/timeseries/data/CUSR0000SA0`). Public domain. FRED republishes
the same series as [CPIAUCSL](https://fred.stlouisfed.org/series/CPIAUCSL). October 2025 has no
value in the source.

## steam-vram-2026-10.csv, steam-ram-2026-10.csv

[Steam Hardware & Software Survey](https://store.steampowered.com/hwsurvey/), October 2026, the
"VRAM" and "System RAM" tables, all platforms. Copied by hand. Valve publishes these as aggregate
statistics; only the percentages are reproduced here, with attribution.

## Nvidia revenue (web page only)

Retrieved 2026-11-15. Q2 fiscal 2027 (quarter ended July 26, 2026): revenue $96.2 billion, Data
Center $89.0 billion, Edge Computing $7.2 billion, from Nvidia's release "NVIDIA Announces Financial
Results for Second Quarter Fiscal 2027" (Aug 26, 2026, GLOBE NEWSWIRE,
[copy on mfn.se](https://mfn.se/all/a/nvidia/nvidia-announces-financial-results-for-second-quarter-fiscal-2027-0d0c3f31)).
The definition of Edge Computing is from Nvidia's
[Q1 FY27 CFO Commentary](https://s201.q4cdn.com/141608511/files/doc_financials/2027/Q127/Q1FY27-CFO-Commentary.pdf).
Nvidia reports Q3 fiscal 2027 on Nov 17, 2026; update `web/src/revenue.ts` after that.

## Fonts

JetBrains Mono Regular, SIL Open Font License 1.1, from
[github.com/JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono). Licence text in
`assets/fonts/OFL.txt`. Used in the receipt image and on the page.

Instrument Serif Regular (page headlines only), SIL Open Font License 1.1, from
[github.com/Instrument/instrument-serif](https://github.com/Instrument/instrument-serif). Licence
text in `assets/fonts/OFL-InstrumentSerif.txt`.

## web/public/models/leather-jacket.glb

"Leather Jacket" by Commissar_Hal
(https://sketchfab.com/3d-models/leather-jacket-af54b2e2d2ba4fbdafc08856d3d0c77b), licensed
CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changed: textures downscaled from 4096 px
to 1024 px (colour, occlusion/roughness/metal) and 1536 px (normal) and re-encoded as JPEG to cut the
file from 43 MB to 2.3 MB. The page credits the author under the viewer.
