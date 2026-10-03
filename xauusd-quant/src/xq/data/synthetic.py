"""Synthetic XAUUSD-like M1 data.

PURPOSE: pipeline testing and NULL-HYPOTHESIS checks only. Prices follow a
driftless random walk with fat tails, volatility clustering and intraday
seasonality. By construction there is NO exploitable edge: any strategy whose
expectancy (before costs) is significantly different from zero on this data
indicates a bug (usually look-ahead), not alpha.

Session structure mimics spot gold: Sun 18:00 -> Fri 17:00 New York, with a
daily 17:00-18:00 New York break.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.utils.timeutils import NY_TZ


def trading_minutes(start: str, end: str) -> pd.DatetimeIndex:
    idx = pd.date_range(pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1),
                        freq="1min", inclusive="left")
    ny = idx.tz_convert(NY_TZ)
    wd = np.asarray(ny.weekday)
    hr = np.asarray(ny.hour)
    closed = (wd == 5) | ((wd == 4) & (hr >= 17)) | ((wd == 6) & (hr < 18)) | (hr == 17)
    return idx[~closed]


def generate_synthetic_m1(
    start: str = "2021-01-04",
    end: str = "2021-12-31",
    seed: int = 42,
    start_price: float = 1850.0,
    annual_vol: float = 0.15,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = trading_minutes(start, end)
    n = len(idx)
    ny = idx.tz_convert(NY_TZ)
    h = np.asarray(ny.hour) + np.asarray(ny.minute) / 60.0
    # Intraday seasonality: London open (~03:00 NY) and US open (~08:30-10:00 NY).
    season = 0.45 + 0.5 * np.exp(-((h - 3.5) ** 2) / 2.0) + 1.3 * np.exp(-((h - 9.0) ** 2) / 2.5)
    season /= season.mean()
    # Slow volatility regime (log-OU), gives clustering and calm/volatile periods.
    ou = np.empty(n)
    ou[0] = 0.0
    eps = rng.standard_normal(n)
    theta, s = 1.0 / (60 * 24 * 3), 0.006
    for i in range(1, n):  # ~1M steps, cheap enough; keeps it explicit
        ou[i] = ou[i - 1] * (1 - theta) + s * eps[i]
    regime = np.exp(ou - ou.mean())
    sigma = annual_vol / np.sqrt(252 * 23 * 60) * season * regime
    t = rng.standard_t(df=4, size=n) / np.sqrt(2.0)  # unit variance for df=4
    r = sigma * t
    close = start_price * np.exp(np.cumsum(r))
    open_ = np.empty(n)
    open_[0] = start_price
    open_[1:] = close[:-1]
    # Reopen gaps after breaks/weekends.
    gap = np.zeros(n, dtype=bool)
    gap[1:] = np.asarray(idx[1:] - idx[:-1] > pd.Timedelta(minutes=1))
    open_[gap] = close[np.flatnonzero(gap) - 1] * np.exp(rng.standard_normal(gap.sum()) * sigma[gap] * 8)
    wick = np.abs(rng.standard_normal((2, n))) * sigma * close * 0.6
    high = np.maximum(open_, close) + wick[0]
    low = np.minimum(open_, close) - wick[1]
    vol = rng.poisson(lam=np.clip(25 * season * regime * (1 + 3 * np.abs(t)), 1, None)).astype(float)
    spread = 0.18 + 0.12 * (season < 0.7) + 0.06 * np.abs(rng.standard_normal(n)) + 0.4 * (np.asarray(ny.hour) == 18)
    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": vol, "spread": spread}, index=idx
    )
    df[["open", "high", "low", "close", "spread"]] = df[["open", "high", "low", "close", "spread"]].round(2)
    df["high"] = df[["open", "high", "close"]].max(axis=1)
    df["low"] = df[["open", "low", "close"]].min(axis=1)
    df.index.name = "timestamp"
    return df
