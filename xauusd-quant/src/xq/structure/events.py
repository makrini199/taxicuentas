"""BOS / CHOCH detection — a sequential state machine over bars.

State at each bar t uses ONLY swings with confirm_idx <= t and prices up to
bar t (close). Processing order inside bar t:
  1. register swings confirmed at t
  2. test for breaks of the active levels with bar t

Definitions:
  active_high : most recently confirmed swing high not yet broken
  active_low  : most recently confirmed swing low not yet broken
  bullish break at t : close[t] > active_high   (break_mode='close')
                       high[t]  > active_high   (break_mode='wick')
  BOS   : break in the direction of the current trend, or when trend is
          undefined (first break establishes it)
  CHOCH : break against the current trend (trend flips)

Each swing level can be broken at most once. Emitted events are immutable:
later bars never rewrite an earlier event (no repainting).

``protective_price`` is the most recent confirmed swing on the opposite side at
the event time (swing low for bullish events, swing high for bearish), i.e. the
structural invalidation level available at that moment. NaN if none exists.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

EVENT_COLUMNS = [
    "idx", "time", "direction", "kind", "level", "swing_pivot_idx",
    "protective_price", "protective_pivot_idx", "close",
]


def detect_structure_events(
    df: pd.DataFrame, swings: pd.DataFrame, break_mode: str = "close"
) -> tuple[pd.DataFrame, pd.Series]:
    if break_mode not in ("close", "wick"):
        raise ValueError("break_mode must be 'close' or 'wick'")
    n = len(df)
    close = df["close"].to_numpy(dtype=float)
    up_px = close if break_mode == "close" else df["high"].to_numpy(dtype=float)
    dn_px = close if break_mode == "close" else df["low"].to_numpy(dtype=float)

    sw = swings.sort_values(["confirm_idx", "pivot_idx"], kind="stable")
    s_conf = sw["confirm_idx"].to_numpy()
    s_kind = sw["kind"].to_numpy()
    s_price = sw["price"].to_numpy(dtype=float)
    s_piv = sw["pivot_idx"].to_numpy()
    k, m = 0, len(sw)

    active_high = active_low = None  # (price, pivot_idx)
    last_high = last_low = None      # most recent confirmed, broken or not
    trend = 0
    trend_arr = np.zeros(n, dtype=np.int8)
    events = []
    for t in range(n):
        while k < m and s_conf[k] <= t:
            rec = (s_price[k], int(s_piv[k]))
            if s_kind[k] == "high":
                active_high = last_high = rec
            else:
                active_low = last_low = rec
            k += 1
        if active_high is not None and up_px[t] > active_high[0]:
            kind = "CHOCH" if trend == -1 else "BOS"
            prot = last_low if last_low is not None else (np.nan, -1)
            events.append((t, 1, kind, active_high[0], active_high[1], prot[0], prot[1], close[t]))
            trend, active_high = 1, None
        if active_low is not None and dn_px[t] < active_low[0]:
            kind = "CHOCH" if trend == 1 else "BOS"
            prot = last_high if last_high is not None else (np.nan, -1)
            events.append((t, -1, kind, active_low[0], active_low[1], prot[0], prot[1], close[t]))
            trend, active_low = -1, None
        trend_arr[t] = trend
    ev = pd.DataFrame(
        [(e[0], df.index[e[0]], *e[1:]) for e in events], columns=EVENT_COLUMNS
    )
    if not len(ev):
        ev = pd.DataFrame(columns=EVENT_COLUMNS)
    return ev, pd.Series(trend_arr, index=df.index, name="trend")
