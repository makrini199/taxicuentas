"""Parquet storage of processed datasets."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from xq.config import DataConfig, resolve_path
from xq.data.metadata import DatasetMetadata


def processed_path(cfg: DataConfig, tf: str) -> Path:
    return resolve_path(cfg.processed_dir) / f"{cfg.instrument}_{tf}.parquet"


def metadata_path(cfg: DataConfig, tf: str) -> Path:
    return resolve_path(cfg.metadata_dir) / f"{cfg.instrument}_{tf}.json"


def save_dataset(df: pd.DataFrame, meta: DatasetMetadata, cfg: DataConfig, tf: str) -> None:
    p = processed_path(cfg, tf)
    p.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(p)
    meta.save(metadata_path(cfg, tf))


def load_dataset(cfg: DataConfig, tf: str) -> tuple[pd.DataFrame, DatasetMetadata]:
    p = processed_path(cfg, tf)
    if not p.exists():
        raise FileNotFoundError(f"{p} not found — run scripts/build_dataset.py first")
    df = pd.read_parquet(p)
    df.index = df.index.tz_convert("UTC")
    if "close_time" in df.columns:
        df["close_time"] = pd.DatetimeIndex(df["close_time"]).tz_convert("UTC")
    return df, DatasetMetadata.load(metadata_path(cfg, tf))
