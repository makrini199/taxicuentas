"""Strategy interface.

A strategy turns a bar frame into SIGNALS. A signal on bar ``bar_idx`` is
decided at the CLOSE of that bar using only data up to and including it; the
engine fills it at the open of a later bar. Strategies never see fills,
equity or position state — that separation keeps signal generation testable
for look-ahead (truncation invariance) on its own.

Signal columns:
  bar_idx    int    bar whose close produced the signal
  time       ts     open time of that bar
  direction  int    +1 long / -1 short
  stop       float  absolute stop-loss price
  tp_rr      float  take-profit distance in R from the actual fill (NaN = none)
  max_bars   int    time exit in bars (0 = none)
  setup      str    setup label for the trade log
  score      float  signal score
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import pandas as pd

SIGNAL_COLUMNS = ["bar_idx", "time", "direction", "stop", "tp_rr", "max_bars", "setup", "score"]


class Strategy(ABC):
    name: str = "base"

    def __init__(self, params: dict[str, Any], context: dict[str, Any] | None = None):
        self.params = dict(params)
        self.context = context or {}

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame: ...

    @staticmethod
    def empty() -> pd.DataFrame:
        return pd.DataFrame(columns=SIGNAL_COLUMNS)


def get_strategy(name: str, params: dict[str, Any], context: dict[str, Any] | None = None) -> Strategy:
    from xq.strategies.structure_breakout import StructureBreakoutStrategy

    registry = {StructureBreakoutStrategy.name: StructureBreakoutStrategy}
    if name not in registry:
        raise KeyError(f"unknown strategy '{name}'; available: {sorted(registry)}")
    return registry[name](params, context)
