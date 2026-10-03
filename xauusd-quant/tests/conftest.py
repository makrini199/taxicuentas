import numpy as np
import pandas as pd
import pytest

from xq.config import CostScenario, RiskConfig, load_config


def make_bars(rows, start="2024-01-08 10:00", freq="5min", spread=None):
    """rows: list of (open, high, low, close). Monday 10:00 UTC by default."""
    idx = pd.date_range(pd.Timestamp(start, tz="UTC"), periods=len(rows), freq=freq, name="timestamp")
    df = pd.DataFrame(rows, columns=["open", "high", "low", "close"], index=idx, dtype=float)
    df["volume"] = 100.0
    if spread is not None:
        df["spread"] = float(spread)
    return df


@pytest.fixture
def cfg():
    return load_config()


@pytest.fixture
def zero_cost():
    return CostScenario(spread_source="fixed", fixed_spread=0.0, min_spread=0.0)


@pytest.fixture
def loose_risk():
    """Risk config whose account limits never interfere with unit tests."""
    return RiskConfig(risk_per_trade_pct=1.0, max_daily_loss_pct=100, max_weekly_loss_pct=100,
                      max_drawdown_pct=100, max_consecutive_losses=10_000, max_open_positions=1,
                      min_lot=0.01, lot_step=0.01, max_lot=1000)


@pytest.fixture(scope="session")
def synth_m5():
    from xq.data.resample import resample_ohlcv
    from xq.data.synthetic import generate_synthetic_m1

    return resample_ohlcv(generate_synthetic_m1("2021-01-04", "2021-03-31", seed=7), "M5")


def signal(bar_idx, time, direction, stop, tp_rr=2.0, max_bars=0, setup="TEST"):
    return pd.DataFrame([{"bar_idx": bar_idx, "time": time, "direction": direction, "stop": stop,
                          "tp_rr": tp_rr, "max_bars": max_bars, "setup": setup, "score": 1.0}])
