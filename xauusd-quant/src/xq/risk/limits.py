"""Account-level risk limits evaluated before every new entry."""

from __future__ import annotations

from dataclasses import dataclass, field

from xq.config import RiskConfig


@dataclass
class RiskState:
    cfg: RiskConfig
    peak_equity: float
    halted: bool = False
    day_key: int = -1
    week_key: int = -1
    day_start_balance: float = 0.0
    week_start_balance: float = 0.0
    day_pnl: float = 0.0
    week_pnl: float = 0.0
    consecutive_losses: int = 0
    open_positions: int = 0
    log: list = field(default_factory=list)

    def on_bar(self, day_key: int, week_key: int, balance: float) -> None:
        if day_key != self.day_key:
            self.day_key, self.day_start_balance, self.day_pnl = day_key, balance, 0.0
            # Consecutive-loss block lasts until the next risk day.
            if self.consecutive_losses >= self.cfg.max_consecutive_losses:
                self.consecutive_losses = 0
        if week_key != self.week_key:
            self.week_key, self.week_start_balance, self.week_pnl = week_key, balance, 0.0

    def on_equity(self, equity: float) -> None:
        self.peak_equity = max(self.peak_equity, equity)
        if self.peak_equity > 0 and (1 - equity / self.peak_equity) * 100 >= self.cfg.max_drawdown_pct:
            self.halted = True

    def on_trade_closed(self, pnl: float) -> None:
        self.day_pnl += pnl
        self.week_pnl += pnl
        self.consecutive_losses = self.consecutive_losses + 1 if pnl < 0 else 0

    def entry_block_reason(self) -> str | None:
        c = self.cfg
        if self.halted:
            return "max_drawdown_halt"
        if self.open_positions >= c.max_open_positions:
            return "max_open_positions"
        if self.day_pnl <= -self.day_start_balance * c.max_daily_loss_pct / 100:
            return "max_daily_loss"
        if self.week_pnl <= -self.week_start_balance * c.max_weekly_loss_pct / 100:
            return "max_weekly_loss"
        if self.consecutive_losses >= c.max_consecutive_losses:
            return "max_consecutive_losses"
        return None
