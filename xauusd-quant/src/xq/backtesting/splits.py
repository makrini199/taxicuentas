"""Chronological data splits. See config/data.yaml -> splits."""

from __future__ import annotations

import pandas as pd

from xq.config import SplitConfig

SEGMENTS = ("train", "validation", "in_sample", "oos", "full")


def segment_bounds(splits: SplitConfig, segment: str) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    a = pd.Timestamp(splits.train_end, tz="UTC")
    b = pd.Timestamp(splits.validation_end, tz="UTC")
    if not a < b:
        raise ValueError("train_end must be before validation_end")
    return {
        "train": (None, a),
        "validation": (a, b),
        "in_sample": (None, b),   # train + validation
        "oos": (b, None),
        "full": (None, None),
    }[segment]


def slice_segment(df: pd.DataFrame, splits: SplitConfig, segment: str) -> pd.DataFrame:
    if segment not in SEGMENTS:
        raise ValueError(f"segment must be one of {SEGMENTS}")
    start, end = segment_bounds(splits, segment)
    mask = pd.Series(True, index=df.index)
    if start is not None:
        mask &= df.index >= start
    if end is not None:
        mask &= df.index < end
    return df[mask.to_numpy()]
