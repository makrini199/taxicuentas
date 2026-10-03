"""End-to-end experiment: data -> signals -> backtest x cost scenarios ->
metrics -> acceptance -> report -> registry."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

from xq.backtesting.breakdown import standard_breakdowns
from xq.backtesting.engine import run_backtest
from xq.backtesting.metrics import compute_metrics
from xq.backtesting.splits import slice_segment
from xq.config import PROJECT_ROOT, ProjectConfig
from xq.data.metadata import content_hash
from xq.data.store import load_dataset
from xq.optimization.registry import ExperimentRegistry, fingerprint
from xq.reporting import charts
from xq.reporting.acceptance import Thresholds, evaluate_acceptance, overfitting_flags
from xq.reporting.report import build_report, write_report
from xq.risk.sizing import InstrumentSpec
from xq.strategies import get_strategy
from xq.utils.gitinfo import git_info
from xq.utils.sessions import primary_session


def run_experiment(
    cfg: ProjectConfig,
    *,
    name: str,
    hypothesis: str = "",
    notes: str = "",
    strategy: str | None = None,
    segment: str = "train",
    experiment_id: str | None = None,
    confirm_oos: bool = False,
    force: bool = False,
    experiments_dir: Path = PROJECT_ROOT / "experiments",
    log=print,
) -> Path:
    strat_name, spec = cfg.strategy.get(strategy)
    tf = spec.timeframe
    if segment in ("oos", "full") and not confirm_oos:
        raise PermissionError(f"segment '{segment}' touches the protected OOS set; pass confirm_oos=True "
                              "ONLY for a final, pre-registered evaluation")

    df_all, dmeta = load_dataset(cfg.data, tf)
    df = slice_segment(df_all, cfg.data.splits, segment)
    if not len(df):
        raise ValueError(f"segment '{segment}' is empty")
    seg_hash = content_hash(df[["open", "high", "low", "close", "volume"]])

    reg = ExperimentRegistry(experiments_dir)
    fp = fingerprint({
        "strategy": strat_name, "timeframe": tf, "params": spec.params,
        "costs": {k: v.model_dump() for k, v in cfg.backtest.cost_scenarios.items()},
        "risk": cfg.risk.model_dump(), "sessions": cfg.sessions.model_dump(),
        "dataset": seg_hash, "segment": segment, "initial_equity": cfg.backtest.initial_equity,
    })
    dup = reg.find_duplicate(fp)
    if dup and not force:
        raise FileExistsError(f"identical experiment already registered as {dup['experiment_id']} (use force)")
    oos_used, invalid_reason = reg.oos_check(strat_name, segment)

    exp_id = experiment_id or reg.next_id()
    out = reg.create_dir(exp_id, name)
    chart_dir = out / "charts"

    sessions = primary_session(df.index, cfg.sessions)
    signals = get_strategy(strat_name, spec.params, {"sessions": cfg.sessions}).generate_signals(df)
    inst = InstrumentSpec(contract_size=cfg.data.contract_size, point_size=cfg.data.point_size)

    results, scen_metrics = {}, {}
    for scen_name, scen in cfg.backtest.cost_scenarios.items():
        r = run_backtest(
            df, signals, timeframe=tf, strategy_name=strat_name, cost=scen, risk=cfg.risk,
            initial_equity=cfg.backtest.initial_equity, instrument=inst, price_basis=cfg.data.price_basis,
            session_labels=sessions, report_tz=cfg.sessions.report_timezone,
            close_at_end=cfg.backtest.close_open_positions_at_end,
        )
        results[scen_name] = r
        scen_metrics[scen_name] = compute_metrics(r.trades, r.equity["equity"], cfg.backtest.initial_equity)
        log(f"  [{scen_name:>10}] trades={scen_metrics[scen_name]['number_of_trades']:>5} "
            f"expR={scen_metrics[scen_name]['expectancy_r']:+.3f} net={scen_metrics[scen_name]['net_profit_pct']:+.1f}% "
            f"maxDD={scen_metrics[scen_name]['max_drawdown_pct']:.1f}%")

    primary = cfg.backtest.active_cost_scenario
    pr = results[primary]
    breakdowns = standard_breakdowns(pr.trades, cfg.sessions.report_timezone)
    criteria, status = evaluate_acceptance(scen_metrics[primary], scen_metrics,
                                           Thresholds(max_drawdown_pct=cfg.risk.max_drawdown_pct))
    if invalid_reason:
        status = "INVALIDATED"
    flags = overfitting_flags(scen_metrics[primary], pr.trades, len(spec.params), dmeta.synthetic)

    ch = {}
    if len(pr.trades):
        ch["equity"] = charts.equity_drawdown(pr.equity, chart_dir / "equity_drawdown.png", f"{strat_name} [{primary}]")
        ch["scenario_equity"] = charts.scenario_equity({k: v.equity["equity"] for k, v in results.items()},
                                                       chart_dir / "equity_by_scenario.png")
        ch["r_dist"] = charts.r_distribution(pr.trades, chart_dir / "r_distribution.png")
        ch["monthly"] = charts.monthly_heatmap(pr.equity["equity"], chart_dir / "monthly_heatmap.png")
        ch["mae_mfe"] = charts.mae_mfe(pr.trades, chart_dir / "mae_mfe.png")
        ch["hour"] = charts.bar_breakdown(breakdowns["hour_local"], "expectancy_r", chart_dir / "hourly.png",
                                          f"Expectancy (R) by entry hour, {cfg.sessions.report_timezone}")
        ch["dow"] = charts.bar_breakdown(breakdowns["day_of_week"], "expectancy_r", chart_dir / "day_of_week.png",
                                         "Expectancy (R) by day of week")

    meta = {
        "experiment_id": exp_id, "name": name, "hypothesis": hypothesis, "notes": notes,
        "date": datetime.now(timezone.utc).isoformat(timespec="seconds"), **git_info(PROJECT_ROOT),
        "strategy": strat_name, "strategy_family": strat_name, "timeframe": tf, "segment": segment,
        "segment_start": str(df.index[0]), "segment_end": str(df.index[-1]), "segment_hash": seg_hash,
        "dataset_hash": dmeta.content_hash, "dataset_synthetic": dmeta.synthetic,
        "oos_used": oos_used, "invalidated": bool(invalid_reason), "invalidated_reason": invalid_reason,
        "fingerprint": fp, "status": status, "primary_cost_scenario": primary,
    }
    dataset_info = {**dmeta.model_dump(exclude={"quality"}), "segment": segment,
                    "segment_start": meta["segment_start"], "segment_end": meta["segment_end"], "segment_bars": len(df)}
    text = build_report(meta=meta, params=spec.params, dataset=dataset_info, scenario_metrics=scen_metrics,
                        primary=primary, trades=pr.trades, equity=pr.equity["equity"], breakdowns=breakdowns,
                        rejected=pr.rejected, criteria=criteria, status=status, flags=flags, charts=ch)
    write_report(out / "report.md", text)

    (out / "config.yaml").write_text(yaml.safe_dump(json.loads(cfg.model_dump_json()), sort_keys=False), encoding="utf-8")
    (out / "meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")
    (out / "results.json").write_text(json.dumps(
        {"metrics": scen_metrics, "engine_info": {k: v.info for k, v in results.items()},
         "acceptance": [c.__dict__ for c in criteria], "status": status, "overfitting_flags": flags},
        indent=2, default=lambda x: None if x != x else str(x)), encoding="utf-8")
    pr.trades.to_csv(out / "trades.csv", index=False)
    pr.rejected.to_csv(out / "rejected_signals.csv", index=False)
    reg.record({k: meta[k] for k in ("experiment_id", "name", "strategy_family", "timeframe", "segment", "oos_used",
                                     "invalidated", "invalidated_reason", "fingerprint", "git_commit", "status",
                                     "dataset_hash", "segment_hash")}
               | {"dir": out.name, "expectancy_r": scen_metrics[primary]["expectancy_r"],
                  "trades": scen_metrics[primary]["number_of_trades"]})
    log(f"{exp_id}: STATUS = {status}  ->  {out}")
    return out
