"""Canonical OHLCV schema and validation.

Canonical frame:
  index   : tz-aware UTC DatetimeIndex named ``timestamp`` = bar OPEN time,
            strictly increasing, unique
  columns : open, high, low, close (float, price units)
            volume (float; tick OR real volume — see metadata.volume_type)
            spread (optional, price units — NOT points)
            close_time (optional, only on resampled frames with irregular bars)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

PRICE_COLS = ["open", "high", "low", "close"]
REQUIRED_COLS = PRICE_COLS + ["volume"]
OPTIONAL_COLS = ["spread", "close_time"]


class DataValidationError(ValueError):
    pass


def validate_ohlcv(df: pd.DataFrame, raise_on_error: bool = True) -> list[str]:
    issues: list[str] = []
    idx = df.index
    if not isinstance(idx, pd.DatetimeIndex):
        issues.append("index is not a DatetimeIndex")
    else:
        if idx.tz is None:
            issues.append("index is timezone-naive (must be tz-aware UTC)")
        elif str(idx.tz) != "UTC":
            issues.append(f"index timezone is {idx.tz}, expected UTC")
        if not idx.is_monotonic_increasing:
            issues.append("index is not sorted ascending")
        if idx.has_duplicates:
            issues.append(f"{int(idx.duplicated().sum())} duplicated timestamps")
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        issues.append(f"missing columns: {missing}")
    else:
        p = df[PRICE_COLS]
        if p.isna().any().any():
            issues.append(f"{int(p.isna().any(axis=1).sum())} rows with NaN prices")
        if (p <= 0).any().any():
            issues.append("non-positive prices")
        bad_hi = df["high"] < np.maximum(df["open"], df["close"])
        bad_lo = df["low"] > np.minimum(df["open"], df["close"])
        if bad_hi.any() or bad_lo.any():
            issues.append(f"{int((bad_hi | bad_lo).sum())} rows violate low<=open,close<=high")
        if (df["volume"] < 0).any():
            issues.append("negative volume")
    if "spread" in df.columns and (df["spread"] < 0).any():
        issues.append("negative spread")
    if issues and raise_on_error:
        raise DataValidationError("; ".join(issues))
    return issues
