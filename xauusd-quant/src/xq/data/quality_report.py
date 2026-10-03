"""Human-readable data-quality report (markdown), built from the processed base
timeframe and the stored metadata. Written next to the metadata so it is
versioned together with it."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from xq.config import DataConfig, SessionsConfig, resolve_path
from xq.data.metadata import DatasetMetadata
from xq.data.store import load_dataset, metadata_path


def _table(df: pd.DataFrame) -> str:
    if df is None or not len(df):
        return "_none_\n"
    d = df.reset_index()
    head = "| " + " | ".join(map(str, d.columns)) + " |\n|" + "---|" * len(d.columns) + "\n"
    rows = "".join("| " + " | ".join(f"{v:.3f}" if isinstance(v, float) else str(v) for v in r) + " |\n"
                   for r in d.itertuples(index=False))
    return head + rows


def build_quality_report(cfg: DataConfig, sessions: SessionsConfig) -> str:
    base, meta = load_dataset(cfg, cfg.base_timeframe)
    q = meta.quality
    d = q.get("diagnostics", {})
    s = [f"# Data quality — {meta.instrument} ({meta.source})\n"]
    if meta.synthetic:
        s.append("> **SYNTHETIC DATA.** Useful only to test the pipeline. Says nothing about real XAUUSD.\n")
    if q.get("forced"):
        s.append("> **FORCED BUILD**: at least one diagnostic FAILED and the build was forced. Treat every result "
                 "obtained from this dataset as suspect.\n")
    s.append(f"Overall severity: **{q.get('overall_severity', 'n/a')}**\n")
    s.append("## Summary\n")
    s.append(_table(pd.DataFrame({"value": {
        "source": meta.source, "source_timezone": meta.source_timezone, "price_basis": meta.price_basis,
        "volume_type": meta.volume_type, "base timeframe": meta.timeframe, "start (UTC)": meta.start,
        "end (UTC)": meta.end, "bars": f"{meta.n_bars:,}", "content hash": meta.content_hash,
        "files": ", ".join(f["file"] for f in q.get("files", [])) or "—",
    }})))
    s.append("## Diagnostics\n")
    s.append(_table(pd.DataFrame([{"check": k, "severity": v["severity"], "message": v["message"]}
                                  for k, v in d.items() if k != "overall"]).set_index("check")))
    s.append("## Cleaning\n")
    keys = ["rows_raw", "rows_in", "nat_timestamps_removed", "dst_ambiguous_or_nonexistent_dropped", "duplicates_removed",
            "duplicate_conflicts", "nan_price_rows_removed", "invalid_ohlc_rows_removed", "rows_out"]
    s.append(_table(pd.DataFrame({"count": {k: q.get(k, "—") for k in keys}})))
    tz = d.get("timezone", {})
    s.append("## Timezone check\n")
    s.append("Gold closes Friday 17:00 and reopens Sunday 18:00 New York all year. Offsets of the data from those "
             "times (hours; 0 = correct):\n")
    s.append(_table(pd.DataFrame({"hours": {k: v for k, v in tz.items() if "offset" in k}})))
    s.append("## Gaps\n")
    s.append(_table(pd.DataFrame({"count": q.get("gaps_by_kind", {})})))
    s.append("### Largest unexpected gaps (review: holidays? feed outages?)\n")
    s.append(_table(pd.DataFrame(q.get("largest_unexpected_gaps", [])).set_index("start")
                    if q.get("largest_unexpected_gaps") else None))
    cov = d.get("coverage", {})
    s.append("## Coverage (% of nominal trading bars; holidays not modelled)\n")
    s.append(_table(pd.DataFrame({"coverage_pct": cov.get("pct_by_year", {})})))
    s.append(f"Bars outside nominal hours: {cov.get('bars_outside_nominal_hours', '—')}\n")

    tzr = sessions.report_timezone
    local = base.index.tz_convert(tzr)
    s.append(f"## Activity by hour ({tzr})\n")
    s.append("Median per bar. Note: `volume` is **" + meta.volume_type + "** volume.\n")
    agg = {"bars": base["close"].groupby(local.hour).size(),
           "median_range": (base["high"] - base["low"]).groupby(local.hour).median(),
           "median_volume": base["volume"].groupby(local.hour).median()}
    if "spread" in base.columns:
        agg["median_spread"] = base["spread"].groupby(local.hour).median()
    by_hour = pd.DataFrame(agg)
    by_hour.index.name = f"hour_{tzr.split('/')[-1]}"
    s.append(_table(by_hour))
    sp = d.get("spread", {})
    if "median" in sp:
        s.append("## Spread\n")
        s.append(_table(pd.DataFrame({"USD/oz": {k: sp[k] for k in ("median", "p95", "p99", "zero_share")}})))
    spk = d.get("spikes", {})
    s.append("## Suspected bad ticks (review list — nothing removed)\n")
    s.append(f"{spk.get('message', '—')}\n\n")
    s.append(_table(pd.DataFrame(spk.get("top", [])).set_index("time") if spk.get("top") else None))
    s.append("## Derived timeframes\n")
    rows = []
    for tf in cfg.timeframes:
        p = metadata_path(cfg, tf)
        if p.exists():
            m = DatasetMetadata.load(p)
            rows.append({"tf": tf, "bars": m.n_bars, "incomplete_bars": m.quality.get("incomplete_bars", 0),
                         "unexpected_gaps": m.quality.get("gaps_by_kind", {}).get("unexpected", 0),
                         "hash": m.content_hash})
    s.append(_table(pd.DataFrame(rows).set_index("tf") if rows else None))
    return "\n".join(s)


def write_quality_report(cfg: DataConfig, sessions: SessionsConfig) -> Path:
    path = resolve_path(cfg.metadata_dir) / f"{cfg.instrument}_quality.md"
    path.write_text(build_quality_report(cfg, sessions), encoding="utf-8")
    return path
