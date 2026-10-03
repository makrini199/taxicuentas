"""Resampling to higher timeframes.

Bars are labelled by OPEN time (label='left', closed='left'). Each output bar
gets an explicit ``close_time`` = label + timeframe: the earliest instant at
which that bar may be used. A trailing partial bar therefore has a close_time
beyond the end of the data and can never be "seen" by lower-timeframe logic.

D1 uses the gold trading day (17:00 -> 17:00 New York, DST-aware) instead of
UTC midnight; its close_time is the 17:00 New York that ends it.
"""

from __future__ import annotations

import pandas as pd

from xq.utils.timeframes import pandas_rule, tf_delta
from xq.utils.timeutils import NY_TZ


def _agg_map(df: pd.DataFrame) -> dict[str, str]:
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    if "spread" in df.columns:
        agg["spread"] = "mean"
    return agg


def resample_ohlcv(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    if tf == "D1":
        return _resample_trading_day(df)
    out = df[[c for c in _agg_map(df)]].resample(pandas_rule(tf), label="left", closed="left").agg(_agg_map(df))
    counts = df["close"].resample(pandas_rule(tf), label="left", closed="left").count()
    out = out[counts > 0]
    out["n_source_bars"] = counts[counts > 0].astype(int)
    out["close_time"] = out.index + tf_delta(tf)
    out.index.name = "timestamp"
    return out


def _resample_trading_day(df: pd.DataFrame) -> pd.DataFrame:
    ny = df.index.tz_convert(NY_TZ)
    # Trading day D runs from 17:00 NY on D-1 to 17:00 NY on D.
    day = (ny + pd.Timedelta(hours=7)).normalize().tz_localize(None)
    g = df.groupby(day)
    out = g.agg(_agg_map(df))
    first_ts = pd.Series(df.index, index=df.index).groupby(day).first()
    out["n_source_bars"] = g["close"].count().astype(int)
    close_ny = pd.DatetimeIndex(out.index).tz_localize(NY_TZ) + pd.Timedelta(hours=17)
    out["close_time"] = close_ny.tz_convert("UTC")
    out.index = pd.DatetimeIndex(first_ts.to_numpy()).tz_localize("UTC") if pd.DatetimeIndex(first_ts).tz is None else pd.DatetimeIndex(first_ts)
    out.index.name = "timestamp"
    return out
