"""Data-quality diagnostics. They REPORT; they never modify data.

Each check returns a dict with at least ``severity`` in {OK, INFO, WARN, FAIL}
and a human-readable ``message``. The pipeline refuses to build a dataset with
a FAIL unless explicitly forced, because these errors (wrong timezone, wrong
timeframe, wrong spread units) silently corrupt every later analysis.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xq.data.calendar import expected_bars
from xq.utils.timeframes import TIMEFRAMES, tf_delta, tf_minutes
from xq.utils.timeutils import NY_TZ

OK, INFO, WARN, FAIL = "OK", "INFO", "WARN", "FAIL"
SEVERITY_ORDER = {OK: 0, INFO: 1, WARN: 2, FAIL: 3}


def worst(severities) -> str:
    return max(severities, key=SEVERITY_ORDER.__getitem__, default=OK)


# --------------------------------------------------------------------------- timeframe
def infer_timeframe(df: pd.DataFrame) -> str | None:
    """Most frequent spacing between consecutive bars, as a known timeframe (or None)."""
    if len(df) < 3:
        return None
    mode = pd.Series(df.index[1:] - df.index[:-1]).mode().iloc[0]
    for tf in TIMEFRAMES:
        if tf_delta(tf) == mode:
            return tf
    return None


def check_timeframe(df: pd.DataFrame, declared: str) -> dict:
    inferred = infer_timeframe(df)
    if inferred == declared:
        return {"severity": OK, "declared": declared, "inferred": inferred, "message": f"bars are {declared}"}
    return {"severity": FAIL, "declared": declared, "inferred": inferred,
            "message": f"data.yaml says base_timeframe={declared} but bars are spaced like {inferred}"}


# --------------------------------------------------------------------------- timezone
def _offset_hours(ts: pd.Series, target_minutes: int) -> np.ndarray:
    """Signed distance (h) of each NY local time-of-day to ``target_minutes``, wrapped to (-12, 12]."""
    ny = pd.DatetimeIndex(ts).tz_convert(NY_TZ)
    mins = np.asarray(ny.hour) * 60 + np.asarray(ny.minute)
    d = (mins - target_minutes + 720) % 1440 - 720
    return d / 60.0


def check_timezone(df: pd.DataFrame, tf: str) -> dict:
    """Gold closes Friday 17:00 New York and reopens Sunday 18:00 New York, all
    year round. If the data's weekly close/reopen sits elsewhere (or moves with
    the season), ``source_timezone`` is wrong.

    Offsets are computed separately for US-DST and US-standard-time weeks: a
    constant offset suggests a wrong fixed zone; an offset that differs between
    seasons suggests the wrong DST rule (e.g. 'UTC' for a NY+7 server)."""
    idx = df.index
    if len(idx) < 3:
        return {"severity": INFO, "message": "not enough data"}
    gaps = np.flatnonzero(np.asarray(idx[1:] - idx[:-1] > pd.Timedelta(hours=30)))
    if len(gaps) < 2:
        return {"severity": INFO, "weekends": int(len(gaps)), "message": "fewer than 2 weekends: cannot verify timezone"}
    close_t = pd.Series(idx[gaps] + tf_delta(tf))
    open_t = pd.Series(idx[gaps + 1])
    close_off = _offset_hours(close_t, 17 * 60)
    open_off = _offset_hours(open_t, 18 * 60)
    dst = np.asarray([bool(t.dst()) for t in pd.DatetimeIndex(close_t).tz_convert(NY_TZ)])
    out = {"weekends": int(len(gaps))}
    meds = []
    for name, mask in (("us_dst", dst), ("us_standard", ~dst)):
        if mask.sum() >= 1:
            c = float(np.median(close_off[mask]))
            o = float(np.median(open_off[mask]))
            out[f"weekly_close_offset_h_{name}"] = round(c, 2)
            out[f"weekly_reopen_offset_h_{name}"] = round(o, 2)
            meds.append(c)
    # Weeks off by exactly one hour while the median is fine: the source zone
    # follows a different DST calendar than New York (e.g. Europe/Athens used
    # for a NY+7 server) — wrong only for the few weeks when US and EU DST differ.
    one_h = np.abs(np.abs(close_off) - 1.0) < 0.25
    out["weeks_off_by_1h"] = [str(t.date()) for t in pd.DatetimeIndex(close_t[one_h]).tz_convert(NY_TZ)][:20]
    # Brokers differ by a few minutes around the close/reopen; 45 min tolerance.
    bad = [m for m in meds if abs(m) > 0.75]
    if not bad and one_h.any():
        out.update(severity=WARN, message=(
            f"{int(one_h.sum())} weekend(s) off by exactly 1h ({', '.join(out['weeks_off_by_1h'][:4])}...): "
            "source_timezone probably follows a different DST calendar than the server"))
    elif not bad:
        out.update(severity=OK, message="weekly close/reopen match 17:00/18:00 New York")
    elif len(meds) == 2 and abs(meds[0] - meds[1]) > 0.75:
        out.update(severity=FAIL, message=(
            f"weekly close is off by {meds[0]:+.1f}h (US summer) / {meds[1]:+.1f}h (US winter): the DST rule of "
            "source_timezone is wrong (e.g. a 'NY+7' server configured as UTC or as a European zone)"))
    else:
        out.update(severity=FAIL, message=(
            f"weekly close is off by {bad[0]:+.1f}h from 17:00 New York: source_timezone is probably wrong "
            f"by {bad[0]:+.0f}h"))
    return out


# --------------------------------------------------------------------------- spread
def check_spread(df: pd.DataFrame, max_reasonable: float = 3.0, min_reasonable: float = 0.01) -> dict:
    """Gold spreads are typically 0.10-0.60 USD/oz. A median far outside
    [min_reasonable, max_reasonable] almost always means wrong point_size."""
    if "spread" not in df.columns:
        return {"severity": INFO, "message": "no spread column: backtests will use fixed spreads from backtest.yaml"}
    s = df["spread"].dropna()
    if not len(s):
        return {"severity": WARN, "message": "spread column is empty"}
    med = float(s.median())
    out = {"median": med, "p95": float(s.quantile(0.95)), "p99": float(s.quantile(0.99)),
           "zero_share": float((s == 0).mean())}
    if med > max_reasonable or med < min_reasonable:
        out.update(severity=FAIL, message=f"median spread {med:.4f} USD/oz is implausible: check point_size "
                                          "(MT5 SPREAD is in points)")
    elif out["zero_share"] > 0.05:
        out.update(severity=WARN, message=f"{out['zero_share']:.0%} of bars have zero spread")
    else:
        out.update(severity=OK, message=f"median spread {med:.2f} USD/oz")
    return out


# --------------------------------------------------------------------------- spikes
def find_spikes(df: pd.DataFrame, k: float = 20.0, window: int = 500, top: int = 20) -> dict:
    """Suspected bad ticks: a wick longer than ``k`` times the local median bar
    range. Real news bars can also trigger this, so the result is a REVIEW LIST;
    nothing is removed automatically."""
    rng = (df["high"] - df["low"]).to_numpy(float)
    ref = pd.Series(rng).rolling(window, center=True, min_periods=window // 5).median().to_numpy()
    ref = np.where(ref > 0, ref, np.nan)
    body_hi = np.maximum(df["open"].to_numpy(float), df["close"].to_numpy(float))
    body_lo = np.minimum(df["open"].to_numpy(float), df["close"].to_numpy(float))
    wick = np.maximum(df["high"].to_numpy(float) - body_hi, body_lo - df["low"].to_numpy(float))
    ratio = wick / ref
    hits = np.flatnonzero(np.nan_to_num(ratio) > k)
    order = hits[np.argsort(-ratio[hits])][:top]
    out = {"count": int(len(hits)), "threshold_x_median_range": k,
           "top": [{"time": str(df.index[i]), "wick": round(float(wick[i]), 4), "x_median": round(float(ratio[i]), 1)}
                   for i in order]}
    share = len(hits) / max(len(df), 1)
    out["severity"] = WARN if share > 1e-4 else (INFO if len(hits) else OK)
    out["message"] = f"{len(hits)} bars with a wick > {k:g}x the local median range (review list, not removed)"
    return out


# --------------------------------------------------------------------------- coverage
def coverage_by_year(df: pd.DataFrame, tf: str) -> dict:
    """Bars present vs bars expected by the nominal calendar (holidays not modelled)."""
    if tf_minutes(tf) > 30 or not len(df):
        return {"severity": INFO, "message": "coverage only computed for base timeframes <= M30"}
    exp = expected_bars(df.index[0], df.index[-1], tf)
    have = pd.Series(1, index=df.index).groupby(df.index.year).size()
    want = pd.Series(1, index=exp).groupby(exp.year).size()
    table = {int(y): round(float(have.get(y, 0) / want[y] * 100), 2) for y in want.index}
    outside = int((~df.index.isin(exp)).sum())
    lo = min(table.values()) if table else 100.0
    sev = OK if lo >= 97 else (WARN if lo >= 85 else FAIL)
    return {"severity": sev, "pct_by_year": table, "bars_outside_nominal_hours": outside,
            "message": f"lowest yearly coverage {lo:.1f}% of nominal trading bars"}


# --------------------------------------------------------------------------- volume
def check_volume(df: pd.DataFrame, volume_type: str) -> dict:
    v = df["volume"]
    zero = float((v == 0).mean())
    out = {"volume_type": volume_type, "zero_share": zero, "median": float(v.median())}
    if volume_type == "none" or zero > 0.5:
        out.update(severity=WARN, message="no usable volume: volume-based research is not possible on this dataset")
    elif volume_type == "tick":
        out.update(severity=INFO, message="TICK volume (price updates), not traded volume — interpret accordingly")
    else:
        out.update(severity=OK, message="real volume")
    return out


def run_all(df: pd.DataFrame, tf: str, volume_type: str) -> dict:
    checks = {
        "timeframe": check_timeframe(df, tf),
        "timezone": check_timezone(df, tf),
        "spread": check_spread(df),
        "spikes": find_spikes(df),
        "coverage": coverage_by_year(df, tf),
        "volume": check_volume(df, volume_type),
    }
    checks["overall"] = worst(c["severity"] for c in checks.values())
    return checks
