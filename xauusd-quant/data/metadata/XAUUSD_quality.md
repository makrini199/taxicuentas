# Data quality — XAUUSD (synthetic)

> **SYNTHETIC DATA.** Useful only to test the pipeline. Says nothing about real XAUUSD.

Overall severity: **INFO**

## Summary

| index | value |
|---|---|
| source | synthetic |
| source_timezone | UTC |
| price_basis | bid |
| volume_type | tick |
| base timeframe | M1 |
| start (UTC) | 2021-01-04 00:00:00+00:00 |
| end (UTC) | 2024-12-31 23:59:00+00:00 |
| bars | 1,437,960 |
| content hash | a235f3f9a21c8a6e |
| files | XAUUSD_M1_synthetic.parquet |

## Diagnostics

| check | severity | message |
|---|---|---|
| timeframe | OK | bars are M1 |
| timezone | OK | weekly close/reopen match 17:00/18:00 New York |
| spread | OK | median spread 0.30 USD/oz |
| spikes | OK | 0 bars with a wick > 20x the local median range (review list, not removed) |
| coverage | OK | lowest yearly coverage 100.0% of nominal trading bars |
| volume | INFO | TICK volume (price updates), not traded volume — interpret accordingly |

## Cleaning

| index | count |
|---|---|
| rows_raw | 1437960 |
| rows_in | 1437960 |
| nat_timestamps_removed | 0 |
| dst_ambiguous_or_nonexistent_dropped | 0 |
| duplicates_removed | 0 |
| duplicate_conflicts | 0 |
| nan_price_rows_removed | 0 |
| invalid_ohlc_rows_removed | 0 |
| rows_out | 1437960 |

## Timezone check

Gold closes Friday 17:00 and reopens Sunday 18:00 New York all year. Offsets of the data from those times (hours; 0 = correct):

| index | hours |
|---|---|
| weekly_close_offset_h_us_dst | 0.000 |
| weekly_reopen_offset_h_us_dst | 0.000 |
| weekly_close_offset_h_us_standard | 0.000 |
| weekly_reopen_offset_h_us_standard | 0.000 |

## Gaps

| index | count |
|---|---|
| daily_break | 834 |
| weekend | 208 |

### Largest unexpected gaps (review: holidays? feed outages?)

_none_

## Coverage (% of nominal trading bars; holidays not modelled)

| index | coverage_pct |
|---|---|
| 2021 | 100.000 |
| 2022 | 100.000 |
| 2023 | 100.000 |
| 2024 | 100.000 |

Bars outside nominal hours: 0

## Activity by hour (Europe/Madrid)

Median per bar. Note: `volume` is **tick** volume.

| hour_Madrid | bars | median_range | median_volume | median_spread |
|---|---|---|---|---|
| 0 | 62520 | 0.530 | 44.000 | 0.740 |
| 1 | 62520 | 0.520 | 44.000 | 0.340 |
| 2 | 62520 | 0.520 | 44.000 | 0.340 |
| 3 | 62520 | 0.520 | 44.000 | 0.340 |
| 4 | 62520 | 0.520 | 43.000 | 0.340 |
| 5 | 62520 | 0.520 | 44.000 | 0.340 |
| 6 | 62520 | 0.540 | 45.000 | 0.330 |
| 7 | 62520 | 0.620 | 52.000 | 0.220 |
| 8 | 62520 | 0.880 | 73.000 | 0.220 |
| 9 | 62520 | 1.070 | 90.000 | 0.220 |
| 10 | 62520 | 0.860 | 72.000 | 0.220 |
| 11 | 62520 | 0.630 | 53.000 | 0.220 |
| 12 | 62520 | 0.690 | 57.000 | 0.220 |
| 13 | 62520 | 1.160 | 98.000 | 0.220 |
| 14 | 62520 | 1.850 | 155.000 | 0.220 |
| 15 | 62520 | 1.820 | 152.000 | 0.220 |
| 16 | 62520 | 1.110 | 93.000 | 0.220 |
| 17 | 62520 | 0.650 | 55.000 | 0.220 |
| 18 | 62520 | 0.540 | 45.000 | 0.320 |
| 19 | 62520 | 0.520 | 44.000 | 0.340 |
| 20 | 62520 | 0.520 | 44.000 | 0.340 |
| 21 | 62520 | 0.530 | 44.000 | 0.340 |
| 22 | 58620 | 0.530 | 44.000 | 0.340 |
| 23 | 3900 | 0.450 | 38.000 | 0.740 |

## Spread

| index | USD/oz |
|---|---|
| median | 0.300 |
| p95 | 0.450 |
| p99 | 0.770 |
| zero_share | 0.000 |

## Suspected bad ticks (review list — nothing removed)

0 bars with a wick > 20x the local median range (review list, not removed)


_none_

## Derived timeframes

| tf | bars | incomplete_bars | unexpected_gaps | hash |
|---|---|---|---|---|
| M1 | 1437960 | 0 | 0 | a235f3f9a21c8a6e |
| M5 | 287592 | 0 | 0 | 03eeb07e5ad51469 |
| M15 | 95864 | 0 | 0 | bf5aa554fb051f23 |
| M30 | 47932 | 0 | 0 | 37812916629d2448 |
| H1 | 23966 | 0 | 0 | 64d9d6b400fad407 |
| H4 | 6460 | 1250 | 0 | 6f8b71fc7b68a601 |
| D1 | 1043 | 2 | 0 | e9101b69e15eddd0 |
