"""Timeframe definitions.

Convention used everywhere in the project: a bar's timestamp is its OPEN time
(UTC). The bar's information (high/low/close/volume) only becomes available at
``open_time + timeframe`` — its close time.
"""

from __future__ import annotations

import pandas as pd

_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440}
_PANDAS_RULE = {"M1": "1min", "M5": "5min", "M15": "15min", "M30": "30min", "H1": "1h", "H4": "4h", "D1": "1D"}

TIMEFRAMES = tuple(_MINUTES)


def check_tf(tf: str) -> str:
    if tf not in _MINUTES:
        raise ValueError(f"unknown timeframe '{tf}', expected one of {TIMEFRAMES}")
    return tf


def tf_minutes(tf: str) -> int:
    return _MINUTES[check_tf(tf)]


def tf_delta(tf: str) -> pd.Timedelta:
    return pd.Timedelta(minutes=tf_minutes(tf))


def pandas_rule(tf: str) -> str:
    return _PANDAS_RULE[check_tf(tf)]


def bar_close_times(df: pd.DataFrame, tf: str) -> pd.DatetimeIndex:
    """Close time of each bar: explicit ``close_time`` column if present, else open + tf."""
    if "close_time" in df.columns:
        return pd.DatetimeIndex(df["close_time"])
    return df.index + tf_delta(tf)
