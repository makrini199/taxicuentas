"""Markdown experiment report (spec §37). Sections not yet implemented are
printed as NOT RUN — never silently omitted."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

from xq.backtesting.metrics import monthly_table
from xq.reporting.acceptance import Criterion


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (float, np.floating)):
        if math.isnan(v):
            return "—"
        if math.isinf(v):
            return "∞"
        return f"{v:,.3f}" if abs(v) < 100 else f"{v:,.0f}"
    return str(v)


def md_table(df: pd.DataFrame, index: bool = True) -> str:
    if df is None or not len(df):
        return "_no data_\n"
    d = df.reset_index() if index else df
    cols = [str(c) for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for row in d.itertuples(index=False):
        lines.append("| " + " | ".join(_fmt(v) for v in row) + " |")
    return "\n".join(lines) + "\n"


KEY_METRICS = [
    "number_of_trades", "net_profit", "net_profit_pct", "gross_profit", "gross_loss", "profit_factor",
    "win_rate", "loss_rate", "expectancy", "expectancy_r", "median_r", "t_stat_r", "p_value_r",
    "average_trade", "average_win", "average_loss", "largest_win", "largest_loss",
    "max_consecutive_wins", "max_consecutive_losses", "max_drawdown_pct", "max_drawdown_money",
    "avg_drawdown_pct", "sharpe", "sortino", "cagr_pct", "calmar", "recovery_factor", "trades_per_year",
]


def build_report(
    *,
    meta: dict,
    params: dict,
    dataset: dict,
    scenario_metrics: dict[str, dict],
    primary: str,
    trades: pd.DataFrame,
    equity: pd.Series,
    breakdowns: dict[str, pd.DataFrame],
    rejected: pd.DataFrame,
    engine_info: dict[str, dict],
    criteria: list[Criterion],
    status: str,
    flags: list[tuple[str, str]],
    charts: dict[str, str],
) -> str:
    m = scenario_metrics[primary]
    s = []
    s.append(f"# {meta['experiment_id']} — {meta['name']}\n")
    s.append(f"**Final status: `{status}`**  \n")
    s.append(f"Date: {meta['date']} · Commit: `{meta.get('git_commit') or 'n/a'}`"
             f"{' (dirty)' if meta.get('git_dirty') else ''} · Segment: `{meta['segment']}`"
             f" · OOS used: **{meta['oos_used']}**{' · **INVALIDATED**: ' + meta['invalidated_reason'] if meta.get('invalidated') else ''}\n")
    s.append("## Summary\n")
    s.append(f"Hypothesis: {meta.get('hypothesis') or '—'}\n")
    s.append(f"Primary cost scenario `{primary}`: {m['number_of_trades']} trades, expectancy "
             f"{_fmt(m['expectancy_r'])} R (t = {_fmt(m['t_stat_r'])}), PF {_fmt(m['profit_factor'])}, "
             f"net {_fmt(m['net_profit_pct'])}%, max DD {_fmt(m['max_drawdown_pct'])}%.\n")
    halted = {k: v["halted_at"] for k, v in engine_info.items() if v.get("halted_by_max_drawdown")}
    if halted:
        s.append("**Max-drawdown kill switch fired** — no new entries after: "
                 + ", ".join(f"`{k}` {v}" for k, v in halted.items())
                 + ". Statistics after that point are missing, so the sample is truncated.\n")
    if meta.get("notes"):
        s.append(f"Notes: {meta['notes']}\n")

    s.append("## Strategy\n")
    s.append(f"`{meta['strategy']}` on `{meta['timeframe']}`.\n")
    s.append("## Dataset\n")
    s.append(md_table(pd.DataFrame([{k: v for k, v in dataset.items() if not isinstance(v, (dict, list))}]).T.rename(columns={0: "value"})))
    s.append("## Parameters\n")
    s.append("```yaml\n" + "\n".join(f"{k}: {v}" for k, v in params.items()) + "\n```\n")

    s.append("## Performance by cost scenario\n")
    sm = pd.DataFrame(scenario_metrics).loc[[k for k in KEY_METRICS if k in m]]
    s.append(md_table(sm))
    if "scenario_equity" in charts:
        s.append(f"![scenarios](charts/{charts['scenario_equity']})\n")
    s.append(f"## Drawdown (scenario `{primary}`)\n")
    if "equity" in charts:
        s.append(f"![equity](charts/{charts['equity']})\n")
    s.append("## Trade statistics\n")
    for key in ("direction", "setup", "exit_reason"):
        s.append(f"### By {key}\n" + md_table(breakdowns.get(key)))
    if "r_dist" in charts:
        s.append(f"![R](charts/{charts['r_dist']})\n")
    s.append("### Rejected signals\n")
    s.append(md_table(rejected["reason"].value_counts().rename("count").to_frame()) if len(rejected) else "_none_\n")
    s.append("## Session analysis\n" + md_table(breakdowns.get("session")))
    s.append("### By entry hour (report timezone)\n" + md_table(breakdowns.get("hour_local")))
    if "hour" in charts:
        s.append(f"![hour](charts/{charts['hour']})\n")
    s.append("## Day-of-week analysis\n" + md_table(breakdowns.get("day_of_week")))
    if "dow" in charts:
        s.append(f"![dow](charts/{charts['dow']})\n")
    s.append("## Monthly analysis\n")
    s.append(md_table(monthly_table(equity).round(2)))
    if "monthly" in charts:
        s.append(f"![monthly](charts/{charts['monthly']})\n")
    s.append("### By year\n" + md_table(breakdowns.get("year")))
    s.append("## Regime analysis\n")
    s.append("NOT RUN — regime detection not implemented yet (all trades `unclassified`).\n")
    s.append("## MAE / MFE\n")
    if len(trades):
        s.append(md_table(trades[["mae_r", "mfe_r"]].describe().T))
    if "mae_mfe" in charts:
        s.append(f"![mae](charts/{charts['mae_mfe']})\n")
    for title, phase in (("Parameter sensitivity", 11), ("Walk-forward", 12), ("Out-of-sample", 13), ("Monte Carlo", 14)):
        s.append(f"## {title}\nNOT RUN — Phase {phase}.\n")
    s.append("## Overfitting risk\n")
    s.append("\n".join(f"- **{lvl}** — {msg}" for lvl, msg in flags) + "\n")
    s.append("## Final status\n")
    s.append(md_table(pd.DataFrame([{"code": c.code, "criterion": c.name, "status": c.status, "detail": c.detail}
                                    for c in criteria]), index=False))
    s.append(f"\n**STATUS = {status}**\n")
    return "\n".join(s)


def write_report(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
