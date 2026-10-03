import math

import numpy as np
import pandas as pd
import pytest

from xq.backtesting.metrics import compute_metrics, drawdown_stats


def _trades(pnls, risk=100.0):
    n = len(pnls)
    return pd.DataFrame({"pnl": pnls, "r_multiple": np.array(pnls) / risk, "commission": [0.0] * n, "swap": [0.0] * n})


def _equity(values):
    idx = pd.date_range("2024-01-01", periods=len(values), freq="1D", tz="UTC")
    return pd.Series(values, index=idx, dtype=float)


def test_trade_metrics():
    m = compute_metrics(_trades([100, -50, 200, -50, -50]), _equity([1000, 1100, 1050, 1250, 1200, 1150]), 1000)
    assert m["number_of_trades"] == 5
    assert m["net_profit"] == 150
    assert m["profit_factor"] == pytest.approx(2.0)
    assert m["win_rate"] == pytest.approx(0.4)
    assert m["expectancy"] == pytest.approx(30)
    assert m["expectancy_r"] == pytest.approx(0.3)
    assert m["average_win"] == 150 and m["average_loss"] == -50
    assert m["largest_win"] == 200 and m["largest_loss"] == -50
    assert m["max_consecutive_wins"] == 1 and m["max_consecutive_losses"] == 2


def test_drawdown_stats():
    d = drawdown_stats(_equity([100, 110, 99, 120, 108, 125]))
    assert d["max_drawdown_pct"] == pytest.approx(10.0)
    assert d["max_drawdown_money"] == pytest.approx(12.0)
    assert d["drawdown_episodes"] == 2
    assert d["avg_drawdown_pct"] == pytest.approx(10.0)


def test_no_trades_does_not_crash():
    m = compute_metrics(_trades([]), _equity([1000, 1000]), 1000)
    assert m["number_of_trades"] == 0 and math.isnan(m["win_rate"])
