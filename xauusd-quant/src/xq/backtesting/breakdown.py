"""Trade-log breakdowns (session, day of week, hour, month, year, exit reason...)."""

from __future__ import annotations

import numpy as np
import pandas as pd

DOW_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def group_stats(trades: pd.DataFrame, by: str | pd.Series) -> pd.DataFrame:
    if not len(trades):
        return pd.DataFrame()
    g = trades.groupby(by, observed=True)

    def pf(x: pd.Series) -> float:
        loss = -x[x <= 0].sum()
        return float(x[x > 0].sum() / loss) if loss > 0 else np.inf

    out = pd.DataFrame({
        "trades": g["pnl"].size(),
        "win_rate": g["pnl"].apply(lambda x: (x > 0).mean()),
        "expectancy_r": g["r_multiple"].mean(),
        "median_r": g["r_multiple"].median(),
        "profit_factor": g["pnl"].apply(pf),
        "net_pnl": g["pnl"].sum(),
        "avg_mae_r": g["mae_r"].mean(),
        "avg_mfe_r": g["mfe_r"].mean(),
    })
    if out.index.name == "day_of_week" or (isinstance(by, str) and by == "day_of_week"):
        out = out.reindex([d for d in DOW_ORDER if d in out.index])
    return out


def standard_breakdowns(trades: pd.DataFrame, report_tz: str) -> dict[str, pd.DataFrame]:
    if not len(trades):
        return {}
    t = trades.copy()
    et = pd.DatetimeIndex(t["entry_time"]).tz_convert(report_tz)
    t["month"] = et.strftime("%Y-%m")
    t["year"] = et.year
    return {
        "session": group_stats(t, "session"),
        "day_of_week": group_stats(t, "day_of_week"),
        "hour_local": group_stats(t, "hour_local"),
        "direction": group_stats(t, "direction"),
        "setup": group_stats(t, "setup"),
        "exit_reason": group_stats(t, "exit_reason"),
        "year": group_stats(t, "year"),
        "market_regime": group_stats(t, "market_regime"),
    }
