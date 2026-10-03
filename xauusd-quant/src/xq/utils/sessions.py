"""Session / time-window detection, DST-aware.

A bar belongs to a window if its OPEN time, converted to the window's own
timezone, falls in [start, end). Windows that cross midnight are supported.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.config import SessionsConfig, SessionWindow
from xq.utils.timeutils import parse_hhmm


def window_mask(index: pd.DatetimeIndex, start: str, end: str, tz: str) -> np.ndarray:
    local = index.tz_convert(tz)
    minutes = np.asarray(local.hour) * 60 + np.asarray(local.minute)
    s, e = parse_hhmm(start), parse_hhmm(end)
    if s == e:
        return np.ones(len(index), dtype=bool)
    if s < e:
        return (minutes >= s) & (minutes < e)
    return (minutes >= s) | (minutes < e)  # crosses midnight


def session_flags(index: pd.DatetimeIndex, cfg: SessionsConfig) -> pd.DataFrame:
    return pd.DataFrame(
        {name: window_mask(index, w.start, w.end, w.tz) for name, w in cfg.sessions.items()},
        index=index,
    )


def primary_session(index: pd.DatetimeIndex, cfg: SessionsConfig, default: str = "other") -> pd.Series:
    labels = np.full(len(index), default, dtype=object)
    assigned = np.zeros(len(index), dtype=bool)
    for name in cfg.primary_order:
        w: SessionWindow = cfg.sessions[name]
        m = window_mask(index, w.start, w.end, w.tz) & ~assigned
        labels[m] = name
        assigned |= m
    return pd.Series(labels, index=index, name="session")
