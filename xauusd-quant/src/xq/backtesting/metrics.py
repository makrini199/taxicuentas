"""Performance metrics (spec §22). Pure functions of the trade log and equity curve."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats


def _streak(mask: np.ndarray) -> int:
    best = cur = 0
    for v in mask:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def drawdown_stats(equity: pd.Series) -> dict:
    peak = equity.cummax()
    dd = equity / peak - 1.0
    money = peak - equity
    in_dd = dd < 0
    episode = (in_dd != in_dd.shift(fill_value=False)).cumsum()[in_dd]
    depths = dd[in_dd].groupby(episode).min() if in_dd.any() else pd.Series(dtype=float)
    return {
        "max_drawdown_pct": float(-dd.min() * 100) if len(dd) else 0.0,
        "max_drawdown_money": float(money.max()) if len(money) else 0.0,
        "avg_drawdown_pct": float(-depths.mean() * 100) if len(depths) else 0.0,
        "drawdown_episodes": int(len(depths)),
    }


def daily_returns(equity: pd.Series) -> pd.Series:
    daily = equity.resample("1D").last().dropna()
    return daily.pct_change().dropna()


def compute_metrics(trades: pd.DataFrame, equity: pd.Series, initial_equity: float) -> dict:
    m: dict = {}
    pnl = trades["pnl"].to_numpy(float) if len(trades) else np.array([])
    r = trades["r_multiple"].to_numpy(float) if len(trades) else np.array([])
    wins, losses = pnl[pnl > 0], pnl[pnl <= 0]
    n = len(pnl)
    m["number_of_trades"] = n
    m["net_profit"] = float(pnl.sum())
    m["net_profit_pct"] = float(pnl.sum() / initial_equity * 100)
    m["gross_profit"] = float(wins.sum())
    m["gross_loss"] = float(losses.sum())
    m["profit_factor"] = float(wins.sum() / -losses.sum()) if losses.sum() < 0 else (math.inf if len(wins) else math.nan)
    m["win_rate"] = float(len(wins) / n) if n else math.nan
    m["loss_rate"] = float(len(losses) / n) if n else math.nan
    m["average_trade"] = float(pnl.mean()) if n else math.nan
    m["average_win"] = float(wins.mean()) if len(wins) else math.nan
    m["average_loss"] = float(losses.mean()) if len(losses) else math.nan
    m["largest_win"] = float(pnl.max()) if n else math.nan
    m["largest_loss"] = float(pnl.min()) if n else math.nan
    m["expectancy"] = m["average_trade"]
    m["expectancy_r"] = float(r.mean()) if n else math.nan
    m["median_r"] = float(np.median(r)) if n else math.nan
    m["std_r"] = float(r.std(ddof=1)) if n > 1 else math.nan
    if n > 1 and r.std(ddof=1) > 0:
        t = stats.ttest_1samp(r, 0.0)
        m["t_stat_r"], m["p_value_r"] = float(t.statistic), float(t.pvalue)
    else:
        m["t_stat_r"] = m["p_value_r"] = math.nan
    m["max_consecutive_wins"] = _streak(pnl > 0)
    m["max_consecutive_losses"] = _streak(pnl <= 0)
    m["total_costs"] = float((trades["commission"].sum() - trades["swap"].sum())) if n else 0.0

    m.update(drawdown_stats(equity))
    dr = daily_returns(equity)
    sd = dr.std(ddof=1)
    m["sharpe"] = float(dr.mean() / sd * np.sqrt(252)) if len(dr) > 1 and sd > 0 else math.nan
    downside = dr[dr < 0]
    dsd = np.sqrt((downside ** 2).sum() / len(dr)) if len(dr) else 0.0
    m["sortino"] = float(dr.mean() / dsd * np.sqrt(252)) if dsd > 0 else math.nan
    years = (equity.index[-1] - equity.index[0]).days / 365.25 if len(equity) > 1 else 0
    final = float(equity.iloc[-1]) if len(equity) else initial_equity
    m["cagr_pct"] = float(((final / initial_equity) ** (1 / years) - 1) * 100) if years > 0 and final > 0 else math.nan
    m["calmar"] = float(m["cagr_pct"] / m["max_drawdown_pct"]) if m["max_drawdown_pct"] > 0 and m["cagr_pct"] == m["cagr_pct"] else math.nan
    m["recovery_factor"] = float(m["net_profit"] / m["max_drawdown_money"]) if m["max_drawdown_money"] > 0 else math.nan
    m["years"] = float(years)
    m["trades_per_year"] = float(n / years) if years > 0 else math.nan
    return m


def period_returns(equity: pd.Series, freq: str) -> pd.Series:
    """Percent return per calendar period ('ME' monthly, 'YE' yearly)."""
    last = equity.resample(freq).last().dropna()
    prev = last.shift(1)
    prev.iloc[0] = equity.iloc[0]
    return (last / prev - 1.0) * 100


def monthly_table(equity: pd.Series) -> pd.DataFrame:
    mr = period_returns(equity, "ME")
    t = pd.DataFrame({"year": mr.index.year, "month": mr.index.month, "ret": mr.to_numpy()})
    return t.pivot(index="year", columns="month", values="ret")
