"""Parquet storage of processed datasets."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from xq.config import DataConfig, resolve_path
from xq.data.metadata import DatasetMetadata, content_hash


def processed_path(cfg: DataConfig, tf: str) -> Path:
    return resolve_path(cfg.processed_dir) / f"{cfg.instrument}_{tf}.parquet"


def metadata_path(cfg: DataConfig, tf: str) -> Path:
    return resolve_path(cfg.metadata_dir) / f"{cfg.instrument}_{tf}.json"


def save_dataset(df: pd.DataFrame, meta: DatasetMetadata, cfg: DataConfig, tf: str) -> None:
    p = processed_path(cfg, tf)
    p.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(p)
    meta.save(metadata_path(cfg, tf))


class DatasetIntegrityError(RuntimeError):
    pass


def load_dataset(cfg: DataConfig, tf: str, verify: bool = True) -> tuple[pd.DataFrame, DatasetMetadata]:
    """Load a processed dataset. With ``verify`` the content hash is recomputed
    and must match the metadata: a data file edited or replaced without
    rebuilding is refused (results would not be reproducible)."""
    p = processed_path(cfg, tf)
    if not p.exists():
        raise FileNotFoundError(f"{p} not found — run scripts/build_dataset.py first")
    df = pd.read_parquet(p)
    df.index = df.index.tz_convert("UTC")
    if "close_time" in df.columns:
        df["close_time"] = pd.DatetimeIndex(df["close_time"]).tz_convert("UTC")
    meta = DatasetMetadata.load(metadata_path(cfg, tf))
    if verify and content_hash(df) != meta.content_hash:
        raise DatasetIntegrityError(f"{p.name} does not match its metadata hash; rebuild with scripts/build_dataset.py")
    return df, meta
