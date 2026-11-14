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

## Font

JetBrains Mono Regular, SIL Open Font License 1.1, from
[github.com/JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono). Licence text in
`assets/fonts/OFL.txt`.
