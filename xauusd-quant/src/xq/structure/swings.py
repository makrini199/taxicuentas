"""Swing (pivot) detection with explicit confirmation lag.

Definition (fractal of order L/R), for bar i:

  swing high  <=>  high[i] >  max(high[i-L .. i-1])   (strictly above the L bars before)
              and  high[i] >= max(high[i+1 .. i+R])   (not exceeded by the R bars after)
  swing low   <=>  mirror image with lows.

Tie rule: the strict/non-strict asymmetry makes the FIRST of several equal
highs the pivot — deterministic, no ambiguity.

ANTI LOOK-AHEAD: a pivot at bar i needs the R following bars, so it is only
KNOWN at the close of bar ``confirm_idx = i + R``. Every consumer must use a
swing only from ``confirm_idx`` onwards. The pivot timestamp is kept for
reference/plots but is never a decision time.

Swings are not forced to alternate high/low; consecutive highs are allowed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SWING_COLUMNS = ["pivot_idx", "pivot_time", "kind", "price", "confirm_idx", "confirm_time"]


def _rolling_max_prev(x: np.ndarray, w: int) -> np.ndarray:
    """max(x[i-w .. i-1]); NaN where fewer than w values exist."""
    return pd.Series(x).shift(1).rolling(w, min_periods=w).max().to_numpy()


def _rolling_max_next(x: np.ndarray, w: int) -> np.ndarray:
    """max(x[i+1 .. i+w]); NaN where fewer than w values exist."""
    return pd.Series(x[::-1]).shift(1).rolling(w, min_periods=w).max().to_numpy()[::-1]


def detect_swings(df: pd.DataFrame, left: int = 3, right: int = 3) -> pd.DataFrame:
    if left < 1 or right < 1:
        raise ValueError("left and right must be >= 1")
    h = df["high"].to_numpy(dtype=float)
    lo = df["low"].to_numpy(dtype=float)
    is_high = (h > _rolling_max_prev(h, left)) & (h >= _rolling_max_next(h, right))
    neg = -lo
    is_low = (neg > _rolling_max_prev(neg, left)) & (neg >= _rolling_max_next(neg, right))
    rows = []
    for kind, mask, prices in (("high", is_high, h), ("low", is_low, lo)):
        for i in np.flatnonzero(mask):
            rows.append((int(i), kind, float(prices[i]), int(i + right)))
    out = pd.DataFrame(rows, columns=["pivot_idx", "kind", "price", "confirm_idx"])
    out["pivot_time"] = df.index[out["pivot_idx"].to_numpy()] if len(out) else pd.DatetimeIndex([], tz="UTC")
    out["confirm_time"] = df.index[out["confirm_idx"].to_numpy()] if len(out) else pd.DatetimeIndex([], tz="UTC")
    out = out.sort_values(["confirm_idx", "pivot_idx", "kind"], kind="stable").reset_index(drop=True)
    return out[SWING_COLUMNS]


def label_swings(swings: pd.DataFrame, equal_tolerance: float = 0.0) -> pd.DataFrame:
    """Add HH/LH/EH (highs) and HL/LL/EL (lows) relative to the previous swing of
    the same kind, in CONFIRMATION order (so labels are also look-ahead free).
    The first swing of each kind is labelled 'H'/'L' (no reference)."""
    labels = []
    prev = {"high": None, "low": None}
    for kind, price in zip(swings["kind"], swings["price"]):
        p = prev[kind]
        if p is None:
            lab = "H" if kind == "high" else "L"
        elif abs(price - p) <= equal_tolerance:
            lab = "EH" if kind == "high" else "EL"
        elif kind == "high":
            lab = "HH" if price > p else "LH"
        else:
            lab = "HL" if price > p else "LL"
        labels.append(lab)
        prev[kind] = price
    out = swings.copy()
    out["label"] = labels
    return out
