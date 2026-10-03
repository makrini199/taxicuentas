"""Cleaning and gap detection.

Cleaning never "repairs" prices silently: invalid rows are DROPPED and counted
in the report, so data quality is always visible in the dataset metadata.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.data.schema import PRICE_COLS
from xq.utils.timeframes import tf_delta
from xq.utils.timeutils import NY_TZ


def clean_ohlcv(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report = {"rows_in": int(len(df))}
    out = df[~df.index.isna()]
    report["nat_timestamps_removed"] = int(len(df) - len(out))
    out = out.sort_index()
    dup = out.index.duplicated(keep="first")
    report["duplicates_removed"] = int(dup.sum())
    out = out[~dup]
    nan_rows = out[PRICE_COLS].isna().any(axis=1)
    report["nan_price_rows_removed"] = int(nan_rows.sum())
    out = out[~nan_rows]
    bad = (
        (out[PRICE_COLS] <= 0).any(axis=1)
        | (out["high"] < np.maximum(out["open"], out["close"]))
        | (out["low"] > np.minimum(out["open"], out["close"]))
    )
    report["invalid_ohlc_rows_removed"] = int(bad.sum())
    out = out[~bad]
    if "volume" in out.columns:
        out = out.assign(volume=out["volume"].fillna(0.0).clip(lower=0.0))
    if "spread" in out.columns:
        report["spread_missing"] = int(out["spread"].isna().sum())
    out.index.name = "timestamp"
    report["rows_out"] = int(len(out))
    return out, report


def _classify_gap(t0_close: pd.Timestamp, t1: pd.Timestamp) -> str:
    """Classify a hole [t0_close, t1) using New York local time.

    XAUUSD (spot/CFD) trades Sun 18:00 -> Fri 17:00 New York with a daily
    17:00-18:00 maintenance break. Anything else is 'unexpected' (holidays,
    feed outages) and must be inspected.
    """
    a, b = t0_close.tz_convert(NY_TZ), t1.tz_convert(NY_TZ)
    dur = t1 - t0_close
    if a.weekday() == 4 and b.weekday() == 6 and dur <= pd.Timedelta(days=2, hours=3):
        return "weekend"
    a_min = a.hour * 60 + a.minute
    if dur <= pd.Timedelta(hours=1, minutes=30) and 16 * 60 + 30 <= a_min <= 18 * 60:
        return "daily_break"
    return "unexpected"


def detect_gaps(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    step = tf_delta(tf)
    idx = df.index
    if len(idx) < 2:
        return pd.DataFrame(columns=["gap_start", "gap_end", "missing_bars", "kind"])
    diffs = idx[1:] - idx[:-1]
    pos = np.flatnonzero(np.asarray(diffs > step))
    rows = []
    for p in pos:
        start = idx[p] + step
        end = idx[p + 1]
        rows.append(
            {
                "gap_start": start,
                "gap_end": end,
                "missing_bars": int((end - start) / step),
                "kind": _classify_gap(start, end),
            }
        )
    return pd.DataFrame(rows, columns=["gap_start", "gap_end", "missing_bars", "kind"])
