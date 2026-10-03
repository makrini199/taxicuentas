import numpy as np
import pandas as pd
import pytest

from conftest import make_bars, signal
from xq.backtesting import run_backtest
from xq.config import CostScenario, RiskConfig

EQ = 100_000.0


def bt(df, sig, cost, risk, **kw):
    return run_backtest(df, sig, timeframe="M5", strategy_name="t", cost=cost, risk=risk, initial_equity=EQ, **kw)


def test_long_take_profit_exact_pnl(zero_cost, loose_risk):
    df = make_bars([(100, 100.5, 99.5, 100), (100, 101, 99, 100.5), (100.5, 104.5, 100, 104), (104, 104, 103, 103.5)])
    r = bt(df, signal(0, df.index[0], 1, 98.0), zero_cost, loose_risk)
    t = r.trades.iloc[0]
    assert t.entry_time == df.index[1]          # filled on the NEXT bar's open
    assert t.entry_price == 100 and t.take_profit == 104
    assert t.position_size == pytest.approx(5.0)  # $1000 risk / ($2 * 100oz)
    assert t.exit_reason == "take_profit" and t.exit_price == 104
    assert t.pnl == pytest.approx(2000) and t.r_multiple == pytest.approx(2.0)
    assert t.mae == pytest.approx(1.0) and t.mfe == pytest.approx(4.0)
    assert r.equity["equity"].iloc[-1] == pytest.approx(EQ + 2000)


def test_fill_uses_next_open_not_signal_close(zero_cost, loose_risk):
    df = make_bars([(100, 100.5, 99.5, 100), (101, 101.5, 100.5, 101), (101, 101.2, 100.8, 101)])
    r = bt(df, signal(0, df.index[0], 1, 99.0), zero_cost, loose_risk)
    assert r.trades.iloc[0].entry_price == 101


def test_latency_delays_fill(loose_risk):
    cost = CostScenario(spread_source="fixed", fixed_spread=0.0, latency_bars=1)
    df = make_bars([(100, 100.5, 99.5, 100), (101, 101.5, 100.5, 101), (102, 102.5, 101.5, 102), (102, 102, 102, 102)])
    r = bt(df, signal(0, df.index[0], 1, 99.0), cost, loose_risk)
    assert r.trades.iloc[0].entry_time == df.index[2] and r.trades.iloc[0].entry_price == 102


def test_stop_and_target_in_same_bar_assumes_stop(zero_cost, loose_risk):
    df = make_bars([(100, 100, 100, 100), (100, 100.2, 99.8, 100), (100, 105, 97, 100), (100, 100, 100, 100)])
    t = bt(df, signal(0, df.index[0], 1, 98.0), zero_cost, loose_risk).trades.iloc[0]
    assert t.exit_reason == "stop" and t.exit_price == 98 and t.r_multiple == pytest.approx(-1.0)


def test_gap_through_stop_fills_at_open(loose_risk):
    cost = CostScenario(spread_source="fixed", fixed_spread=0.0, slippage_stop=0.1)
    df = make_bars([(100, 100, 100, 100), (100, 100.5, 99.5, 100), (96, 96.5, 95, 96), (96, 96, 96, 96)])
    t = bt(df, signal(0, df.index[0], 1, 98.0), cost, loose_risk).trades.iloc[0]
    assert t.exit_reason == "stop_gap"
    assert t.exit_price == pytest.approx(95.9)
    assert t.r_multiple < -1.9  # gap loss larger than 1R — must not be hidden


def test_costs_long_entry_and_commission(loose_risk):
    cost = CostScenario(spread_source="fixed", fixed_spread=0.20, slippage_market=0.05,
                        commission_per_lot_round_turn=7.0)
    df = make_bars([(100, 100, 100, 100), (100, 100.3, 99.9, 100.1), (100.1, 105, 100, 104.9), (105, 105, 105, 105)])
    t = bt(df, signal(0, df.index[0], 1, 98.0), cost, loose_risk).trades.iloc[0]
    assert t.entry_price == pytest.approx(100.25)  # bid 100 + spread .20 + slip .05
    assert t.position_size == pytest.approx(4.31)  # 1000 / (2.25*100 + 7)
    assert t.take_profit == pytest.approx(100.25 + 2 * 2.25)
    assert t.commission == pytest.approx(4.31 * 7)
    assert t.pnl == pytest.approx(4.5 * 431 - 4.31 * 7)


def test_short_stop_triggers_on_ask(loose_risk):
    cost = CostScenario(spread_source="fixed", fixed_spread=0.20)
    df = make_bars([(100, 100, 100, 100), (100, 100.5, 99.5, 100), (100, 101.9, 99.9, 101), (101, 101, 101, 101)])
    t = bt(df, signal(0, df.index[0], -1, 102.0), cost, loose_risk).trades.iloc[0]
    assert t.direction == "short" and t.entry_price == 100.0  # sells at bid
    # bid high 101.9 never reached 102, but ask high = 102.1 did
    assert t.exit_reason == "stop" and t.exit_price == pytest.approx(102.0)


def test_spread_from_data_column(loose_risk):
    cost = CostScenario(spread_source="data", fixed_spread=9.9, spread_multiplier=2.0)
    df = make_bars([(100, 100, 100, 100), (100, 100.3, 99.9, 100.1), (100, 100, 100, 100)], spread=0.15)
    r = bt(df, signal(0, df.index[0], 1, 98.0), cost, loose_risk)
    assert r.info["spread_source"] == "data"
    assert r.trades.iloc[0].entry_price == pytest.approx(100.30)


def test_time_exit_and_end_of_data(zero_cost, loose_risk):
    df = make_bars([(100, 100, 100, 100)] + [(100, 100.5, 99.5, 100.2)] * 5)
    t = bt(df, signal(0, df.index[0], 1, 98.0, max_bars=3), zero_cost, loose_risk).trades.iloc[0]
    assert t.exit_reason == "time" and t.bars_held == 3 and t.exit_price == pytest.approx(100.2)
    t2 = bt(df, signal(0, df.index[0], 1, 98.0, max_bars=0), zero_cost, loose_risk).trades.iloc[0]
    assert t2.exit_reason == "end_of_data"


def test_rejections(zero_cost, loose_risk):
    df = make_bars([(100, 100, 100, 100), (100.5, 100.5, 100.5, 100.5), (100, 100, 100, 100)])
    r = bt(df, signal(0, df.index[0], 1, 101.0), zero_cost, loose_risk)  # stop above the fill
    assert len(r.trades) == 0 and r.rejected["reason"].tolist() == ["stop_beyond_fill"]
    r2 = bt(df, signal(2, df.index[2], 1, 99.0), zero_cost, loose_risk)  # signal on the last bar
    assert r2.rejected["reason"].tolist() == ["no_bar_to_fill"]


def test_swap_charged_overnight(loose_risk):
    cost = CostScenario(spread_source="fixed", fixed_spread=0.0, swap_long_per_lot=-25.0)
    # Mon 20:00 UTC -> Tue 10:00 UTC: crosses Mon 17:00 NY (22:00 UTC in January)
    df = make_bars([(100, 100, 100, 100), (100, 100.5, 99.5, 100), (100, 100.5, 99.5, 100)], start="2024-01-08 12:00", freq="7h")
    t = bt(df, signal(0, df.index[0], 1, 98.0, max_bars=0), cost, loose_risk).trades.iloc[0]
    assert t.swap == pytest.approx(-25.0 * 5.0)


def test_consecutive_loss_limit_blocks_entries(zero_cost):
    risk = RiskConfig(risk_per_trade_pct=1, max_daily_loss_pct=100, max_weekly_loss_pct=100, max_drawdown_pct=100,
                      max_consecutive_losses=1)
    rows = [(100, 100, 100, 100), (100, 100, 97, 97), (97, 97, 97, 97), (97, 97, 94, 94), (94, 94, 94, 94)]
    df = make_bars(rows)
    sig = pd.concat([signal(0, df.index[0], 1, 98.0), signal(2, df.index[2], 1, 95.0)], ignore_index=True)
    r = bt(df, sig, zero_cost, risk)
    assert len(r.trades) == 1 and r.rejected["reason"].tolist() == ["max_consecutive_losses"]


def test_accounting_consistency_and_determinism(synth_m5, cfg):
    from xq.strategies import get_strategy

    name, spec = cfg.strategy.get()
    sig = get_strategy(name, spec.params).generate_signals(synth_m5)
    cost = cfg.backtest.scenario("base")
    a = run_backtest(synth_m5, sig, timeframe="M5", strategy_name=name, cost=cost, risk=cfg.risk, initial_equity=EQ)
    b = run_backtest(synth_m5, sig, timeframe="M5", strategy_name=name, cost=cost, risk=cfg.risk, initial_equity=EQ)
    pd.testing.assert_frame_equal(a.trades, b.trades)
    assert a.info["final_balance"] == pytest.approx(EQ + a.trades["pnl"].sum())
    assert a.equity["equity"].iloc[-1] == pytest.approx(a.info["final_balance"])
    t = a.trades
    assert (pd.to_datetime(t["entry_time"]) > pd.to_datetime(t["signal_time"])).all()
    assert np.allclose(t["pnl"], t["gross_pnl"] - t["commission"] + t["swap"])
    # no overlapping positions with max_open_positions = 1
    assert (pd.to_datetime(t["entry_time"]).iloc[1:].to_numpy() >= pd.to_datetime(t["exit_time"]).iloc[:-1].to_numpy()).all()
    # loss on a plain stop is ~1R (commission included in risk)
    stops = t[t["exit_reason"] == "stop"]
    assert (stops["r_multiple"] < -0.99).all() and (stops["r_multiple"] > -1.5).all()
