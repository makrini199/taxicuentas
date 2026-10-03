"""Raw data loaders. Each returns (canonical_df, info_dict) — not yet cleaned.

Supported sources (selected in config/data.yaml, never hardcoded):
  - mt5_csv     : MetaTrader 5 "Export bars" file (<DATE> <TIME> <OPEN> ... <TICKVOL> <VOL> <SPREAD>)
  - generic_csv : any CSV with a column map
  - parquet     : already-canonical parquet (e.g. synthetic data)
"""

from __future__ import annotations

import glob
from pathlib import Path

import numpy as np
import pandas as pd

from xq.utils.timeutils import localize_to_utc


def _finish(df: pd.DataFrame, naive_ts, source_tz: str, info: dict) -> tuple[pd.DataFrame, dict]:
    idx, n_bad = localize_to_utc(pd.DatetimeIndex(naive_ts), source_tz)
    df = df.set_axis(idx)
    df = df[~df.index.isna()]
    df.index.name = "timestamp"
    info["dst_ambiguous_or_nonexistent_dropped"] = n_bad
    return df, info


def load_mt5_csv(path: Path | str, source_timezone: str, point_size: float) -> tuple[pd.DataFrame, dict]:
    raw = pd.read_csv(path, sep=None, engine="python")
    raw.columns = [c.strip().strip("<>").lower() for c in raw.columns]
    ts = pd.to_datetime(raw["date"].astype(str) + " " + raw["time"].astype(str), format="mixed")
    tickvol = raw.get("tickvol", pd.Series(0, index=raw.index)).astype(float)
    realvol = raw.get("vol", pd.Series(0, index=raw.index)).astype(float)
    # Real volume only if the broker actually reports it; CFD gold almost never does.
    if (realvol > 0).mean() > 0.5:
        volume, vtype = realvol, "real"
    elif (tickvol > 0).any():
        volume, vtype = tickvol, "tick"
    else:
        volume, vtype = tickvol, "none"
    df = pd.DataFrame(
        {
            "open": raw["open"].astype(float).to_numpy(),
            "high": raw["high"].astype(float).to_numpy(),
            "low": raw["low"].astype(float).to_numpy(),
            "close": raw["close"].astype(float).to_numpy(),
            "volume": volume.to_numpy(),
        }
    )
    if "spread" in raw.columns:
        df["spread"] = raw["spread"].astype(float).to_numpy() * point_size  # points -> price
    return _finish(df, ts, source_timezone, {"volume_type_detected": vtype, "rows_raw": int(len(raw))})


def load_generic_csv(
    path: Path | str, column_map: dict[str, str], source_timezone: str
) -> tuple[pd.DataFrame, dict]:
    """``column_map`` maps canonical name -> CSV column. It must contain either
    'timestamp' or both 'date' and 'time'."""
    raw = pd.read_csv(path, sep=None, engine="python")
    if "timestamp" in column_map:
        ts = pd.to_datetime(raw[column_map["timestamp"]], format="mixed")
    elif {"date", "time"} <= column_map.keys():
        ts = pd.to_datetime(raw[column_map["date"]].astype(str) + " " + raw[column_map["time"]].astype(str),
                            format="mixed")
    else:
        raise ValueError("csv_column_map needs 'timestamp' or 'date' + 'time'")
    cols = {k: raw[v].astype(float).to_numpy() for k, v in column_map.items() if k not in ("timestamp", "date", "time")}
    missing = [c for c in ("open", "high", "low", "close") if c not in cols]
    if missing:
        raise ValueError(f"csv_column_map is missing {missing}")
    if "volume" not in cols:
        cols["volume"] = np.zeros(len(raw))
    df = pd.DataFrame(cols)
    if ts.dt.tz is not None:
        df = df.set_axis(pd.DatetimeIndex(ts).tz_convert("UTC"))
        df.index.name = "timestamp"
        return df, {"rows_raw": int(len(raw)), "dst_ambiguous_or_nonexistent_dropped": 0}
    return _finish(df, ts, source_timezone, {"rows_raw": int(len(raw))})


def expand_paths(pattern: Path | str) -> list[Path]:
    """A path or a glob ('data/raw/XAUUSD_M1_*.csv'). Sorted, so the merge order is deterministic."""
    pattern = str(pattern)
    if any(ch in pattern for ch in "*?["):
        paths = sorted(Path(p) for p in glob.glob(pattern))
    else:
        paths = [Path(pattern)]
    missing = [p for p in paths if not p.exists()]
    if not paths or missing:
        raise FileNotFoundError(f"no raw data at {pattern}")
    return paths


def load_many(paths: list[Path], loader) -> tuple[pd.DataFrame, dict]:
    """Concatenate several raw files in order. Overlaps are resolved later by
    cleaning (earlier file wins, conflicts are counted)."""
    frames, infos = [], []
    for p in paths:
        df, info = loader(p)
        frames.append(df)
        infos.append({"file": p.name, **info})
    out = pd.concat(frames) if len(frames) > 1 else frames[0]
    merged = {"files": infos, "rows_raw": int(sum(i.get("rows_raw", 0) for i in infos)),
              "dst_ambiguous_or_nonexistent_dropped": int(sum(i.get("dst_ambiguous_or_nonexistent_dropped", 0) for i in infos))}
    vtypes = {i.get("volume_type_detected") for i in infos} - {None}
    if len(vtypes) > 1:
        raise ValueError(f"raw files disagree on volume type: {vtypes}; never mix tick and real volume")
    if vtypes:
        merged["volume_type_detected"] = vtypes.pop()
    return out, merged


def load_parquet(path: Path | str) -> tuple[pd.DataFrame, dict]:
    df = pd.read_parquet(path)
    if df.index.tz is None:
        raise ValueError("parquet index must be tz-aware")
    df.index = df.index.tz_convert("UTC")
    df.index.name = "timestamp"
    return df, {"rows_raw": int(len(df))}
