"""Timezone helpers. All internal timestamps are tz-aware UTC."""

from __future__ import annotations

import numpy as np
import pandas as pd

NY_TZ = "America/New_York"
SERVER_NY_PLUS_7 = "NY+7"


def parse_hhmm(s: str) -> int:
    """'14:30' -> minutes since midnight."""
    h, m = s.split(":")
    h, m = int(h), int(m)
    if not (0 <= h <= 24 and 0 <= m < 60) or h * 60 + m > 1440:
        raise ValueError(f"bad HH:MM '{s}'")
    return h * 60 + m


def localize_to_utc(naive: pd.DatetimeIndex, source_tz: str) -> tuple[pd.DatetimeIndex, int]:
    """Interpret naive timestamps in ``source_tz`` and convert to UTC.

    Ambiguous (DST fall-back) or non-existent (spring-forward) local times are
    returned as NaT; the caller must drop them and report the count. We never
    guess.

    ``source_tz == "NY+7"`` handles MT5 servers whose clock is New York + 7h.
    """
    naive = pd.DatetimeIndex(naive)
    if naive.tz is not None:
        return naive.tz_convert("UTC"), 0
    if source_tz == SERVER_NY_PLUS_7:
        ny = (naive - pd.Timedelta(hours=7)).tz_localize(NY_TZ, ambiguous="NaT", nonexistent="NaT")
        out = ny.tz_convert("UTC")
    else:
        out = naive.tz_localize(source_tz, ambiguous="NaT", nonexistent="NaT").tz_convert("UTC")
    return out, int(np.asarray(out.isna()).sum())


def ensure_utc_index(df: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(df.index, pd.DatetimeIndex) or df.index.tz is None:
        raise ValueError("index must be a tz-aware DatetimeIndex")
    if str(df.index.tz) != "UTC":
        df = df.copy()
        df.index = df.index.tz_convert("UTC")
    return df


def count_rollovers(entry: pd.Timestamp, exit_: pd.Timestamp, triple_weekday: int = 2) -> int:
    """Number of swap nights charged between entry and exit.

    The rollover instant is 17:00 New York (DST-aware). Each rollover in
    (entry, exit] counts once; the rollover on ``triple_weekday`` (Wednesday by
    default, NY local) counts three times to cover the weekend.
    """
    if exit_ <= entry:
        return 0
    e = entry.tz_convert(NY_TZ) - pd.Timedelta(hours=17)
    x = exit_.tz_convert(NY_TZ) - pd.Timedelta(hours=17)
    days = pd.date_range(e.normalize() + pd.Timedelta(days=1), x.normalize(), freq="D")
    total = 0
    for d in days:  # d is the NY calendar day of the rollover
        if d.weekday() >= 5:  # no rollover Sat/Sun (market closed)
            continue
        total += 3 if d.weekday() == triple_weekday else 1
    return total
