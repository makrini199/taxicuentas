"""RAW -> CLEAN -> VALIDATE -> DIAGNOSE -> RESAMPLE -> VALIDATE -> STORE (+ metadata, quality report).

The build STOPS on any FAIL diagnostic (wrong timezone, wrong timeframe,
implausible spread units, very low coverage) unless ``force=True``. A forced
build records ``forced: true`` in every metadata file, so downstream reports
can show it.
"""

from __future__ import annotations

from functools import partial

import pandas as pd

from xq.config import DataConfig, resolve_path
from xq.data import diagnostics as diag
from xq.data.cleaning import clean_ohlcv, detect_gaps
from xq.data.loaders import expand_paths, load_generic_csv, load_many, load_mt5_csv, load_parquet
from xq.data.metadata import build_metadata
from xq.data.resample import resample_ohlcv
from xq.data.schema import validate_ohlcv
from xq.data.store import save_dataset


class DataQualityError(RuntimeError):
    pass


def load_raw(cfg: DataConfig) -> tuple[pd.DataFrame, dict]:
    paths = expand_paths(resolve_path(cfg.raw_path))
    if cfg.source == "mt5_csv":
        loader = partial(load_mt5_csv, source_timezone=cfg.source_timezone, point_size=cfg.point_size)
    elif cfg.source == "generic_csv":
        if not cfg.csv_column_map:
            raise ValueError("generic_csv requires csv_column_map in data.yaml")
        loader = partial(load_generic_csv, column_map=cfg.csv_column_map, source_timezone=cfg.source_timezone)
    else:  # synthetic & parquet
        loader = load_parquet
    return load_many(paths, loader)


def gap_summary(df: pd.DataFrame, tf: str, top: int = 20) -> dict:
    gaps = detect_gaps(df, tf)
    unexpected = gaps[gaps["kind"] == "unexpected"].sort_values("missing_bars", ascending=False)
    return {
        "gaps_by_kind": {str(k): int(v) for k, v in gaps["kind"].value_counts().items()} if len(gaps) else {},
        "largest_unexpected_gaps": [
            {"start": str(r.gap_start), "end": str(r.gap_end), "missing_bars": int(r.missing_bars)}
            for r in unexpected.head(top).itertuples()
        ],
    }


def build_dataset(cfg: DataConfig, log=print, force: bool = False) -> dict[str, pd.DataFrame]:
    raw, info = load_raw(cfg)
    volume_type = info.get("volume_type_detected", cfg.volume_type)
    if volume_type != cfg.volume_type:
        log(f"WARNING: data.yaml says volume_type={cfg.volume_type} but the file looks like {volume_type}; "
            f"using {volume_type}")
    base, clean_report = clean_ohlcv(raw)
    validate_ohlcv(base)

    checks = diag.run_all(base, cfg.base_timeframe, volume_type)
    if clean_report.get("duplicate_conflicts"):
        checks["duplicates"] = {"severity": diag.WARN, "message":
                                f"{clean_report['duplicate_conflicts']} timestamps appear in several files with "
                                "DIFFERENT prices (earlier file kept)"}
        checks["overall"] = diag.worst([checks["overall"], diag.WARN])
    for name, c in checks.items():
        if name != "overall" and c["severity"] in (diag.WARN, diag.FAIL):
            log(f"[{c['severity']}] {name}: {c['message']}")
    failed = [n for n, c in checks.items() if n != "overall" and c["severity"] == diag.FAIL]
    if failed and not force:
        raise DataQualityError(f"data quality FAIL in {failed}; fix data.yaml or rebuild with force=True "
                               "(the dataset will be flagged as forced)")

    synthetic = cfg.source == "synthetic"
    notes = "SYNTHETIC random-walk data: no real edge exists; for pipeline tests only." if synthetic else ""
    out = {}
    for tf in cfg.timeframes:
        if tf == cfg.base_timeframe:
            df = base
            quality = {**info, **clean_report, **gap_summary(df, tf), "diagnostics": checks}
        else:
            df = resample_ohlcv(base, tf)
            validate_ohlcv(df.drop(columns=["close_time", "n_source_bars"]))
            full = df["n_source_bars"].median()
            quality = {"resampled_from": cfg.base_timeframe, "incomplete_bars": int((df["n_source_bars"] < full).sum()),
                       **gap_summary(df, tf)}
        quality["forced"] = bool(failed)
        quality["overall_severity"] = checks["overall"]
        meta = build_metadata(
            df, instrument=cfg.instrument, source=cfg.source, synthetic=synthetic, timeframe=tf,
            source_timezone=cfg.source_timezone, price_basis=cfg.price_basis, volume_type=volume_type,
            quality=quality, notes=notes,
        )
        save_dataset(df, meta, cfg, tf)
        log(f"{tf:>4}: {len(df):>9,} bars  {meta.start} -> {meta.end}  hash={meta.content_hash}")
        out[tf] = df
    log(f"overall data quality: {checks['overall']}{' (FORCED)' if failed else ''}")
    return out
