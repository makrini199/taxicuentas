"""Multi-timeframe alignment without look-ahead.

A lower-timeframe (LTF) decision is taken at the CLOSE of the LTF bar
(open + ltf). A higher-timeframe (HTF) bar may be used for that decision only
if its own close time is <= the LTF decision time. Hence an H1 bar opened at
10:00 is invisible to every M5 bar before the one that closes at 11:00.
"""

from __future__ import annotations

import pandas as pd

from xq.utils.timeframes import bar_close_times, tf_delta


def align_htf_to_ltf(
    htf: pd.DataFrame,
    ltf_index: pd.DatetimeIndex,
    ltf_tf: str,
    htf_tf: str,
    columns: list[str] | None = None,
    prefix: str = "htf_",
) -> pd.DataFrame:
    columns = columns or [c for c in ("open", "high", "low", "close", "volume") if c in htf.columns]
    avail = bar_close_times(htf, htf_tf).as_unit("ns")
    right = htf[columns].copy()
    right["htf_bar_time"] = htf.index
    right["available_at"] = avail
    right = right.sort_values("available_at").reset_index(drop=True)
    left = pd.DataFrame({"decision_time": (ltf_index + tf_delta(ltf_tf)).as_unit("ns")})
    merged = pd.merge_asof(left, right, left_on="decision_time", right_on="available_at",
                           direction="backward", allow_exact_matches=True)
    merged.index = ltf_index
    merged = merged.drop(columns=["decision_time"])
    return merged.rename(columns={c: f"{prefix}{c}" for c in columns})
