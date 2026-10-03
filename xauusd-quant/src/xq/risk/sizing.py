"""Position sizing.

lots = risk_amount / (stop_distance * contract_size [+ commission_per_lot])

rounded DOWN to the lot step (never risk more than allowed), capped at
max_lot. Returns 0 when the result is below min_lot: the trade is skipped
rather than over-risked.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from xq.config import RiskConfig


@dataclass(frozen=True)
class InstrumentSpec:
    contract_size: float = 100.0  # units (oz) per 1.0 lot
    point_size: float = 0.01


def position_size(
    equity: float,
    stop_distance: float,
    risk: RiskConfig,
    instrument: InstrumentSpec,
    commission_per_lot_round_turn: float = 0.0,
) -> float:
    if equity <= 0 or stop_distance <= 0:
        return 0.0
    risk_amount = equity * risk.risk_per_trade_pct / 100.0
    loss_per_lot = stop_distance * instrument.contract_size
    if risk.include_commission_in_sizing:
        loss_per_lot += commission_per_lot_round_turn
    raw = risk_amount / loss_per_lot
    steps = math.floor(raw / risk.lot_step + 1e-9)
    lots = min(round(steps * risk.lot_step, 8), risk.max_lot)
    return lots if lots >= risk.min_lot - 1e-12 else 0.0
