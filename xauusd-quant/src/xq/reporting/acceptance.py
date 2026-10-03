"""Strategy acceptance criteria (spec §33) and overfitting-risk flags (§32).

Status values:
  REJECT     a hard criterion FAILED
  RESEARCH   nothing failed hard, but at least one criterion was NOT RUN
  CANDIDATE  every criterion passed -> may go to PAPER trading (never straight to live)
A strategy is NEVER marked production-ready by this module.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd

PASS, FAIL, NOT_RUN = "PASS", "FAIL", "NOT RUN"


@dataclass
class Criterion:
    code: str
    name: str
    status: str
    detail: str
    hard: bool = True


@dataclass
class Thresholds:
    min_trades: int = 200
    min_t_stat: float = 2.0
    max_drawdown_pct: float = 20.0


def evaluate_acceptance(
    metrics: dict, scenario_metrics: dict[str, dict], th: Thresholds = Thresholds()
) -> tuple[list[Criterion], str]:
    n = metrics.get("number_of_trades", 0)
    t = metrics.get("t_stat_r", math.nan)
    exp_r = metrics.get("expectancy_r", math.nan)
    crit = [
        Criterion("A", "Statistical robustness",
                  PASS if (n >= 30 and t == t and t >= th.min_t_stat) else FAIL,
                  f"mean R = {exp_r:.3f}, t = {t:.2f} (need >= {th.min_t_stat}), n = {n}"),
        Criterion("B", "Out-of-sample performance", NOT_RUN, "Phase 13"),
        Criterion("C", "Walk-forward stability", NOT_RUN, "Phase 12"),
        Criterion("D", "Parameter stability", NOT_RUN, "Phase 11"),
    ]
    if "stress" in scenario_metrics:
        s = scenario_metrics["stress"]
        crit.append(Criterion("E", "Cost robustness", PASS if s.get("expectancy_r", -1) > 0 else FAIL,
                              f"stress-cost expectancy = {s.get('expectancy_r', math.nan):.3f} R"))
    else:
        crit.append(Criterion("E", "Cost robustness", NOT_RUN, "stress scenario not run"))
    dd = metrics.get("max_drawdown_pct", math.nan)
    crit += [
        Criterion("F", "Drawdown", PASS if dd < th.max_drawdown_pct else FAIL,
                  f"max DD = {dd:.1f}% (limit {th.max_drawdown_pct}%)"),
        Criterion("G", "Trade count", PASS if n >= th.min_trades else FAIL, f"{n} trades (need >= {th.min_trades})"),
        Criterion("H", "Regime robustness", NOT_RUN, "regime detection not implemented yet"),
        Criterion("I", "Monte Carlo robustness", NOT_RUN, "Phase 14"),
        Criterion("J", "Operational reliability", NOT_RUN, "requires paper trading (Phase 17)"),
    ]
    if any(c.status == FAIL and c.hard for c in crit):
        status = "REJECT"
    elif any(c.status == NOT_RUN for c in crit):
        status = "RESEARCH"
    else:
        status = "CANDIDATE"
    return crit, status


def overfitting_flags(metrics: dict, trades: pd.DataFrame, n_params: int, synthetic: bool) -> list[tuple[str, str]]:
    """List of (level, message). Level in HIGH / MEDIUM / INFO."""
    flags: list[tuple[str, str]] = []
    n = metrics.get("number_of_trades", 0)
    if synthetic:
        flags.append(("HIGH", "Dataset is SYNTHETIC: results say nothing about real XAUUSD."))
    if n < 100:
        flags.append(("HIGH", f"Only {n} trades: too few for any conclusion."))
    elif n < 300:
        flags.append(("MEDIUM", f"{n} trades: confidence intervals are wide."))
    pf = metrics.get("profit_factor", math.nan)
    if pf == pf and pf > 3:
        flags.append(("HIGH", f"Profit factor {pf:.2f} is implausibly high — check for look-ahead or tiny sample."))
    if n and n_params and n / n_params < 30:
        flags.append(("MEDIUM", f"{n_params} parameters for {n} trades (< 30 trades per parameter)."))
    if n and metrics.get("net_profit", 0) > 0:
        pnl = trades["pnl"].sort_values(ascending=False)
        top = pnl.head(max(1, int(round(n * 0.05)))).sum() / pnl.sum()
        if top > 0.5:
            flags.append(("HIGH", f"Top 5% of trades produce {top:.0%} of net profit (concentration)."))
        yearly = trades.groupby(pd.DatetimeIndex(trades["entry_time"]).year)["pnl"].sum()
        if len(yearly) > 1 and yearly.max() / pnl.sum() > 0.7:
            flags.append(("MEDIUM", f"Year {yearly.idxmax()} produces {yearly.max() / pnl.sum():.0%} of net profit."))
        hourly = trades.groupby("hour_local")["pnl"].sum()
        if len(hourly) > 1 and hourly.max() / pnl.sum() > 0.6:
            flags.append(("MEDIUM", f"Hour {hourly.idxmax()} produces {hourly.max() / pnl.sum():.0%} of net profit."))
    if not flags:
        flags.append(("INFO", "No automatic red flags — that does NOT mean the strategy is robust."))
    return flags
