"""On a driftless random walk no strategy can have an edge. If the baseline
shows a significant positive expectancy here, the pipeline leaks the future."""

import numpy as np
import pandas as pd
import pytest

from xq.backtesting import run_backtest
from xq.backtesting.metrics import compute_metrics
from xq.config import CostScenario, RiskConfig
from xq.data.resample import resample_ohlcv
from xq.data.synthetic import generate_synthetic_m1
from xq.strategies import get_strategy

RISK = RiskConfig(max_daily_loss_pct=100, max_weekly_loss_pct=100, max_drawdown_pct=100, max_consecutive_losses=10**6)


@pytest.fixture(scope="module")
def walk():
    return resample_ohlcv(generate_synthetic_m1("2022-01-03", "2022-12-30", seed=11), "M5")


def test_no_edge_on_random_walk_without_costs(cfg):
    """Pooled over several independent random walks, zero-cost expectancy must be ~0.
    (Single seeds wander to |t| ~ 2 by chance; pooling makes the check sharp.)"""
    name, spec = cfg.strategy.get()
    strat = get_strategy(name, spec.params)
    r_all = []
    for seed in (1, 2, 3, 4):
        w = resample_ohlcv(generate_synthetic_m1("2022-01-03", "2022-06-30", seed=seed), "M5")
        r = run_backtest(w, strat.generate_signals(w), timeframe="M5", strategy_name=name,
                         cost=CostScenario(spread_source="fixed", fixed_spread=0.0), risk=RISK, initial_equity=1e5)
        r_all.append(r.trades["r_multiple"].to_numpy())
    r = np.concatenate(r_all)
    t = r.mean() / r.std(ddof=1) * np.sqrt(len(r))
    assert len(r) > 1500
    assert abs(t) < 3.0, (len(r), r.mean(), t)


def test_costs_strictly_reduce_expectancy(walk, cfg):
    name, spec = cfg.strategy.get()
    sig = get_strategy(name, spec.params).generate_signals(walk)
    out = {}
    for scen in ("optimistic", "base", "stress"):
        r = run_backtest(walk, sig, timeframe="M5", strategy_name=name, cost=cfg.backtest.scenario(scen), risk=RISK,
                         initial_equity=1e5)
        out[scen] = r.trades["r_multiple"].mean()
    assert out["optimistic"] > out["base"] > out["stress"]
