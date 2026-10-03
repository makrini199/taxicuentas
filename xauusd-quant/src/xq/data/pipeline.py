"""RAW -> CLEAN -> VALIDATE -> METADATA -> RESAMPLE -> STORE."""

from __future__ import annotations

import pandas as pd

from xq.config import DataConfig, resolve_path
from xq.data.cleaning import clean_ohlcv, detect_gaps
from xq.data.loaders import load_generic_csv, load_mt5_csv, load_parquet
from xq.data.metadata import build_metadata
from xq.data.resample import resample_ohlcv
from xq.data.schema import validate_ohlcv
from xq.data.store import save_dataset


def load_raw(cfg: DataConfig) -> tuple[pd.DataFrame, dict]:
    path = resolve_path(cfg.raw_path)
    if cfg.source == "mt5_csv":
        return load_mt5_csv(path, cfg.source_timezone, cfg.point_size)
    if cfg.source == "generic_csv":
        if not cfg.csv_column_map:
            raise ValueError("generic_csv requires csv_column_map in data.yaml")
        return load_generic_csv(path, cfg.csv_column_map, cfg.source_timezone)
    return load_parquet(path)  # synthetic & parquet


def _quality(df: pd.DataFrame, tf: str, base: dict) -> dict:
    gaps = detect_gaps(df, tf)
    q = dict(base)
    q["gaps_by_kind"] = gaps["kind"].value_counts().to_dict() if len(gaps) else {}
    unexpected = gaps[gaps["kind"] == "unexpected"].sort_values("missing_bars", ascending=False)
    q["largest_unexpected_gaps"] = [
        {"start": str(r.gap_start), "end": str(r.gap_end), "missing_bars": int(r.missing_bars)}
        for r in unexpected.head(20).itertuples()
    ]
    if "volume" in df.columns:
        q["zero_volume_bars"] = int((df["volume"] == 0).sum())
    if "spread" in df.columns:
        q["spread_median"] = float(df["spread"].median())
        q["spread_p99"] = float(df["spread"].quantile(0.99))
    return q


def build_dataset(cfg: DataConfig, log=print) -> dict[str, pd.DataFrame]:
    raw, info = load_raw(cfg)
    volume_type = info.get("volume_type_detected", cfg.volume_type)
    if volume_type != cfg.volume_type:
        log(f"WARNING: data.yaml says volume_type={cfg.volume_type} but file looks like {volume_type}; using {volume_type}")
    base, clean_report = clean_ohlcv(raw)
    validate_ohlcv(base)
    quality_base = {**info, **clean_report}
    synthetic = cfg.source == "synthetic"
    notes = "SYNTHETIC random-walk data: no real edge exists; for pipeline tests only." if synthetic else ""
    out = {}
    for tf in cfg.timeframes:
        df = base if tf == cfg.base_timeframe else resample_ohlcv(base, tf)
        if tf == cfg.base_timeframe:
            quality = _quality(df, tf, quality_base)
        else:
            quality = {"resampled_from": cfg.base_timeframe,
                       "incomplete_bars": int((df["n_source_bars"] < df["n_source_bars"].median()).sum())}
        meta = build_metadata(
            df, instrument=cfg.instrument, source=cfg.source, synthetic=synthetic, timeframe=tf,
            source_timezone=cfg.source_timezone, price_basis=cfg.price_basis, volume_type=volume_type,
            quality=quality, notes=notes,
        )
        save_dataset(df, meta, cfg, tf)
        log(f"{tf}: {len(df):>9,} bars  {meta.start} -> {meta.end}  hash={meta.content_hash}")
        out[tf] = df
    return out
