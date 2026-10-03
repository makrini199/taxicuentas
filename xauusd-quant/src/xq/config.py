"""Typed configuration loaded from the YAML files in ``config/``.

Every tunable number lives in YAML; code only holds defaults for the schema.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = PROJECT_ROOT / "config"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SplitConfig(_Strict):
    train_end: str
    validation_end: str


class SyntheticConfig(_Strict):
    start: str = "2021-01-04"
    end: str = "2024-12-31"
    seed: int = 42
    start_price: float = 1850.0
    annual_vol: float = 0.15


class DataConfig(_Strict):
    instrument: str = "XAUUSD"
    source: Literal["synthetic", "mt5_csv", "generic_csv", "parquet"] = "synthetic"
    raw_path: str
    processed_dir: str = "data/processed"
    metadata_dir: str = "data/metadata"
    source_timezone: str = "UTC"
    price_basis: Literal["bid", "mid"] = "bid"
    volume_type: Literal["tick", "real", "none"] = "tick"
    base_timeframe: str = "M1"
    timeframes: list[str] = Field(default_factory=lambda: ["M1", "M5", "M15", "M30", "H1", "H4", "D1"])
    point_size: float = 0.01
    contract_size: float = 100.0
    splits: SplitConfig
    synthetic: SyntheticConfig = Field(default_factory=SyntheticConfig)
    csv_column_map: dict[str, str] | None = None


class SessionWindow(_Strict):
    start: str
    end: str
    tz: str


class SessionsConfig(_Strict):
    sessions: dict[str, SessionWindow]
    primary_order: list[str]
    report_timezone: str = "Europe/Madrid"


class StrategySpec(_Strict):
    timeframe: str
    params: dict[str, Any] = Field(default_factory=dict)


class StrategyConfig(_Strict):
    active: str
    strategies: dict[str, StrategySpec]
    scoring: dict[str, float] = Field(default_factory=dict)

    def get(self, name: str | None = None) -> tuple[str, StrategySpec]:
        name = name or self.active
        if name not in self.strategies:
            raise KeyError(f"strategy '{name}' not in strategy.yaml")
        return name, self.strategies[name]


class RiskConfig(_Strict):
    risk_per_trade_pct: float = 0.5
    max_daily_loss_pct: float = 2.0
    max_weekly_loss_pct: float = 4.0
    max_drawdown_pct: float = 20.0
    max_consecutive_losses: int = 5
    max_open_positions: int = 1
    min_lot: float = 0.01
    lot_step: float = 0.01
    max_lot: float = 50.0
    include_commission_in_sizing: bool = True
    risk_day_timezone: str = "Europe/Madrid"


class CostScenario(_Strict):
    spread_source: Literal["data", "fixed"] = "data"
    fixed_spread: float = 0.30
    spread_multiplier: float = 1.0
    min_spread: float = 0.0
    commission_per_lot_round_turn: float = 0.0
    slippage_market: float = 0.0
    slippage_stop: float = 0.0
    swap_long_per_lot: float = 0.0
    swap_short_per_lot: float = 0.0
    latency_bars: int = 0


class BacktestConfig(_Strict):
    initial_equity: float = 100_000.0
    account_currency: str = "USD"
    active_cost_scenario: str = "base"
    close_open_positions_at_end: bool = True
    intrabar_policy: Literal["worst_case"] = "worst_case"
    cost_scenarios: dict[str, CostScenario]

    def scenario(self, name: str | None = None) -> CostScenario:
        name = name or self.active_cost_scenario
        return self.cost_scenarios[name]


class ProjectConfig(_Strict):
    data: DataConfig
    sessions: SessionsConfig
    strategy: StrategyConfig
    risk: RiskConfig
    backtest: BacktestConfig


def load_yaml(path: Path | str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_config(config_dir: Path | str = CONFIG_DIR) -> ProjectConfig:
    d = Path(config_dir)
    return ProjectConfig(
        data=DataConfig(**load_yaml(d / "data.yaml")),
        sessions=SessionsConfig(**load_yaml(d / "sessions.yaml")),
        strategy=StrategyConfig(**load_yaml(d / "strategy.yaml")),
        risk=RiskConfig(**load_yaml(d / "risk.yaml")),
        backtest=BacktestConfig(**load_yaml(d / "backtest.yaml")),
    )


def resolve_path(p: str | Path) -> Path:
    """Paths in YAML are relative to the project root."""
    p = Path(p)
    return p if p.is_absolute() else PROJECT_ROOT / p
