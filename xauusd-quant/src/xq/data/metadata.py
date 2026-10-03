"""Dataset metadata, stored as JSON next to the processed data."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel


class DatasetMetadata(BaseModel):
    instrument: str
    source: str
    synthetic: bool
    timeframe: str
    timezone: str = "UTC"
    source_timezone: str
    price_basis: Literal["bid", "mid"]
    volume_type: Literal["tick", "real", "none"]
    has_spread: bool
    spread_units: str = "price"
    start: str
    end: str
    n_bars: int
    content_hash: str
    quality: dict[str, Any]
    created_at: str
    notes: str = ""

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.model_dump_json(indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "DatasetMetadata":
        return cls(**json.loads(Path(path).read_text(encoding="utf-8")))


def content_hash(df: pd.DataFrame) -> str:
    """Deterministic hash of index + values (order-sensitive)."""
    h = pd.util.hash_pandas_object(df, index=True).to_numpy()
    return hashlib.sha256(np.ascontiguousarray(h).tobytes()).hexdigest()[:16]


def build_metadata(
    df: pd.DataFrame,
    *,
    instrument: str,
    source: str,
    synthetic: bool,
    timeframe: str,
    source_timezone: str,
    price_basis: str,
    volume_type: str,
    quality: dict[str, Any],
    notes: str = "",
) -> DatasetMetadata:
    return DatasetMetadata(
        instrument=instrument,
        source=source,
        synthetic=synthetic,
        timeframe=timeframe,
        source_timezone=source_timezone,
        price_basis=price_basis,
        volume_type=volume_type,
        has_spread="spread" in df.columns,
        start=str(df.index[0]) if len(df) else "",
        end=str(df.index[-1]) if len(df) else "",
        n_bars=int(len(df)),
        content_hash=content_hash(df),
        quality=quality,
        created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        notes=notes,
    )
