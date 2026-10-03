"""Nominal XAUUSD (spot/CFD) trading calendar.

Sunday 18:00 -> Friday 17:00 New York, with a daily 17:00-18:00 New York
maintenance break. Exchange holidays are NOT modelled: on real data they show
up as 'unexpected' gaps and as coverage below 100%, which is the honest
outcome (they must be reviewed, not hidden).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.utils.timeframes import pandas_rule
from xq.utils.timeutils import NY_TZ


def is_market_open(index: pd.DatetimeIndex) -> np.ndarray:
    """True where a bar OPENING at that instant lies inside nominal trading hours."""
    ny = index.tz_convert(NY_TZ)
    wd = np.asarray(ny.weekday)
    hr = np.asarray(ny.hour)
    closed = (wd == 5) | ((wd == 4) & (hr >= 17)) | ((wd == 6) & (hr < 18)) | (hr == 17)
    return ~closed


def expected_bars(start: pd.Timestamp, end: pd.Timestamp, tf: str = "M1") -> pd.DatetimeIndex:
    """Bar open times the nominal calendar expects in [start, end]."""
    grid = pd.date_range(start.floor(pandas_rule(tf)), end, freq=pandas_rule(tf))
    return grid[is_market_open(grid)]


def trading_minutes(start: str, end: str) -> pd.DatetimeIndex:
    """All nominal trading minutes from ``start`` (00:00 UTC) to the end of ``end`` (UTC)."""
    idx = pd.date_range(pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1),
                        freq="1min", inclusive="left")
    return idx[is_market_open(idx)]
