"""Baseline: trade confirmed structure breaks.

On a BOS/CHOCH event at the close of bar t:
  direction = event direction
  stop      = protective swing -/+ stop_buffer
  target    = rr * R from the actual fill
Setups whose stop distance (from the signal close) falls outside
[min_stop, max_stop] are discarded. Optional session filter on bar t.

This is the EXP000 pipeline baseline, deliberately simple. It is NOT the
EXP001 hypothesis (that adds liquidity + volume + session conditions).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.strategies.base import SIGNAL_COLUMNS, Strategy
from xq.structure import detect_structure_events, detect_swings
from xq.utils.sessions import window_mask


class StructureBreakoutStrategy(Strategy):
    name = "structure_breakout_baseline"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        p = self.params
        swings = detect_swings(df, p.get("swing_left", 3), p.get("swing_right", 3))
        events, _ = detect_structure_events(df, swings, p.get("break_mode", "close"))
        if not len(events):
            return self.empty()
        ev = events[events["kind"].isin(p.get("events", ["BOS", "CHOCH"]))].copy()
        ev = ev[ev["protective_price"].notna()]
        buf = float(p.get("stop_buffer", 0.0))
        ev["stop"] = np.where(ev["direction"] > 0, ev["protective_price"] - buf, ev["protective_price"] + buf)
        dist = (ev["close"] - ev["stop"]) * ev["direction"]
        ev = ev[(dist >= p.get("min_stop", 0.0)) & (dist <= p.get("max_stop", np.inf))]
        sess = p.get("session_filter")
        if sess:
            w = self.context["sessions"].sessions[sess]
            ok = window_mask(pd.DatetimeIndex(ev["time"]), w.start, w.end, w.tz)
            ev = ev[ok]
        out = pd.DataFrame(
            {
                "bar_idx": ev["idx"].astype(int).to_numpy(),
                "time": pd.DatetimeIndex(ev["time"]),
                "direction": ev["direction"].astype(int).to_numpy(),
                "stop": ev["stop"].astype(float).to_numpy(),
                "tp_rr": float(p.get("rr", 2.0)),
                "max_bars": int(p.get("max_bars_in_trade", 0)),
                "setup": ev["kind"].to_numpy(),
                "score": 1.0,
            }
        )
        return out[SIGNAL_COLUMNS].reset_index(drop=True)
