import pytest

from xq.config import RiskConfig
from xq.risk.limits import RiskState
from xq.risk.sizing import InstrumentSpec, position_size

INST = InstrumentSpec(contract_size=100)


def test_basic_sizing():
    r = RiskConfig(risk_per_trade_pct=1.0, include_commission_in_sizing=False)
    # risk $1000, stop $5/oz -> 200 oz -> 2.00 lots
    assert position_size(100_000, 5.0, r, INST) == pytest.approx(2.0)


def test_sizing_rounds_down_and_includes_commission():
    r = RiskConfig(risk_per_trade_pct=1.0, include_commission_in_sizing=True)
    lots = position_size(100_000, 5.0, r, INST, commission_per_lot_round_turn=7.0)
    assert lots == pytest.approx(1.97)  # 1000 / 507 = 1.972 -> 1.97
    assert lots * (5.0 * 100 + 7.0) <= 1000


def test_sizing_below_min_lot_returns_zero_and_cap():
    r = RiskConfig(risk_per_trade_pct=0.01, include_commission_in_sizing=False)
    assert position_size(1_000, 10.0, r, INST) == 0.0
    r2 = RiskConfig(risk_per_trade_pct=5.0, max_lot=3.0, include_commission_in_sizing=False)
    assert position_size(1_000_000, 1.0, r2, INST) == 3.0


def test_invalid_stop_distance():
    assert position_size(100_000, 0.0, RiskConfig(), INST) == 0.0
    assert position_size(100_000, -1.0, RiskConfig(), INST) == 0.0


def test_limits():
    cfg = RiskConfig(max_daily_loss_pct=2, max_consecutive_losses=2, max_drawdown_pct=10, max_weekly_loss_pct=50)
    rs = RiskState(cfg=cfg, peak_equity=100_000)
    rs.on_bar(1, 1, 100_000)
    assert rs.entry_block_reason() is None
    rs.on_trade_closed(-1000)
    assert rs.entry_block_reason() is None
    rs.on_trade_closed(-1000)
    assert rs.entry_block_reason() == "max_daily_loss"
    rs.on_bar(2, 1, 98_000)  # new day resets daily loss and the loss streak block
    assert rs.entry_block_reason() is None
    rs.on_equity(89_000)
    assert rs.entry_block_reason() == "max_drawdown_halt"
