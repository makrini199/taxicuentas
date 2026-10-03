"""Execution cost model.

Price convention (price_basis='bid', MT5 default): OHLC are BID prices and
ask = bid + spread.

  LONG  entry (market buy)   : ask_open + slippage_market
  LONG  stop  (sell stop)    : triggers when bid <= stop; fills stop - slippage_stop
                               (or bid open - slippage_stop if the bar gaps through)
  LONG  target (sell limit)  : triggers when bid >= tp; fills at tp (no slippage)
  SHORT entry (market sell)  : bid_open - slippage_market
  SHORT stop  (buy stop)     : triggers when ask = bid + spread >= stop
  SHORT target (buy limit)   : triggers when ask <= tp

With price_basis='mid' half the spread is applied on each side instead.
Commission is charged per lot round turn at exit; swap per lot per rollover.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.config import CostScenario


def spread_series(df: pd.DataFrame, cost: CostScenario) -> tuple[np.ndarray, str]:
    """Effective spread per bar (price units) and a note on where it came from."""
    if cost.spread_source == "data" and "spread" in df.columns and df["spread"].notna().any():
        base = df["spread"].ffill().fillna(cost.fixed_spread).to_numpy(dtype=float)
        note = "data"
    else:
        base = np.full(len(df), cost.fixed_spread, dtype=float)
        note = "fixed" if cost.spread_source == "fixed" else "fixed (no spread column in data)"
    return np.maximum(base * cost.spread_multiplier, cost.min_spread), note
