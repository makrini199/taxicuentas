"""Bar-by-bar backtest engine.

Order of operations inside bar i (this order IS the anti look-ahead contract):

  1. risk bookkeeping for a new day/week
  2. fill pending entry at the OPEN of bar i (signal came from bar i-1-latency)
  3. manage open positions with bar i's range (stops, targets, time exits)
  4. mark-to-market at the CLOSE of bar i, drawdown kill-switch check
  5. read the signal produced at the CLOSE of bar i -> becomes pending

So a signal can never be filled on the bar that produced it, and positions are
only ever evaluated with bars at or after their entry.

Intrabar ambiguity: when stop and target are both inside a bar the engine
assumes the STOP was hit first (worst case). A bar that opens beyond the stop
fills at that open (gap), never at the stop price.

MAE/MFE are measured in price units from the fill, with bid prices for longs
and ask prices for shorts. On an exit bar the intrabar order is unknown, so
MAE includes the full bar (overstated) and MFE excludes the extreme of a
stop-out bar (understated). Both errors are conservative.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from xq.config import CostScenario, RiskConfig
from xq.execution.costs import spread_series
from xq.risk.limits import RiskState
from xq.risk.sizing import InstrumentSpec, position_size
from xq.utils.timeframes import tf_delta
from xq.utils.timeutils import count_rollovers

TRADE_COLUMNS = [
    "trade_id", "strategy", "setup", "score", "timeframe", "direction",
    "signal_time", "entry_time", "exit_time", "entry_price", "exit_price",
    "stop_loss", "take_profit", "position_size", "units", "risk", "gross_pnl",
    "commission", "swap", "pnl", "r_multiple", "exit_reason", "bars_held",
    "session", "day_of_week", "hour_local", "market_regime", "spread",
    "slippage", "mae", "mfe", "mae_r", "mfe_r", "equity_before",
]


@dataclass
class _Pos:
    trade_id: int
    direction: int
    signal_idx: int
    entry_idx: int
    entry_price: float
    stop: float
    tp: float
    lots: float
    units: float
    risk_amount: float
    setup: str
    score: float
    max_bars: int
    spread: float
    slip_entry: float
    equity_before: float
    mae: float = 0.0
    mfe: float = 0.0


@dataclass
class BacktestResult:
    trades: pd.DataFrame
    equity: pd.DataFrame
    rejected: pd.DataFrame
    info: dict = field(default_factory=dict)


def run_backtest(
    df: pd.DataFrame,
    signals: pd.DataFrame,
    *,
    timeframe: str,
    strategy_name: str,
    cost: CostScenario,
    risk: RiskConfig,
    initial_equity: float,
    instrument: InstrumentSpec = InstrumentSpec(),
    price_basis: str = "bid",
    session_labels: pd.Series | None = None,
    report_tz: str = "Europe/Madrid",
    close_at_end: bool = True,
) -> BacktestResult:
    n = len(df)
    idx = df.index
    o = df["open"].to_numpy(float)
    h = df["high"].to_numpy(float)
    lo = df["low"].to_numpy(float)
    c = df["close"].to_numpy(float)
    sp, spread_note = spread_series(df, cost)
    if price_basis == "bid":
        bid_off, ask_off = np.zeros(n), sp
    elif price_basis == "mid":
        bid_off, ask_off = -sp / 2, sp / 2
    else:
        raise ValueError("price_basis must be 'bid' or 'mid'")

    rtz = idx.tz_convert(risk.risk_day_timezone)
    day_key = pd.factorize(rtz.normalize())[0]
    iso = rtz.isocalendar()
    week_key = (iso["year"].to_numpy() * 100 + iso["week"].to_numpy()).astype(int)
    loc = idx.tz_convert(report_tz)
    dow = np.asarray(loc.day_name())
    hour = np.asarray(loc.hour)
    sess = session_labels.reindex(idx).to_numpy() if session_labels is not None else np.full(n, "n/a", object)
    step = tf_delta(timeframe)

    sig_map: dict[int, tuple] = {}
    rejected: list[dict] = []
    for s in signals.sort_values("bar_idx", kind="stable").itertuples(index=False):
        b = int(s.bar_idx)
        if b in sig_map:
            rejected.append({"signal_time": s.time, "direction": int(s.direction), "reason": "duplicate_signal_same_bar"})
            continue
        sig_map[b] = s

    comm = cost.commission_per_lot_round_turn
    slip_m, slip_s = cost.slippage_market, cost.slippage_stop
    lat = int(cost.latency_bars)
    balance = float(initial_equity)
    rs = RiskState(cfg=risk, peak_equity=balance)
    positions: list[_Pos] = []
    pending: tuple[int, object] | None = None
    trades: list[dict] = []
    equity = np.empty(n)
    next_id = 1

    def close_pos(p: _Pos, i: int, exit_price: float, reason: str, at_close: bool) -> None:
        nonlocal balance
        exit_time = idx[i] + step if at_close else idx[i]
        gross = p.direction * (exit_price - p.entry_price) * p.units
        commission = comm * p.lots
        nights = count_rollovers(idx[p.entry_idx], exit_time)
        swap_rate = cost.swap_long_per_lot if p.direction > 0 else cost.swap_short_per_lot
        swap = nights * swap_rate * p.lots
        pnl = gross - commission + swap
        balance += pnl
        rs.on_trade_closed(pnl)
        slip_exit = slip_s if reason.startswith("stop") else (0.0 if reason == "take_profit" else slip_m)
        r_unit = abs(p.entry_price - p.stop)
        trades.append({
            "trade_id": p.trade_id, "strategy": strategy_name, "setup": p.setup, "score": p.score,
            "timeframe": timeframe, "direction": "long" if p.direction > 0 else "short",
            "signal_time": idx[p.signal_idx], "entry_time": idx[p.entry_idx], "exit_time": exit_time,
            "entry_price": p.entry_price, "exit_price": exit_price, "stop_loss": p.stop,
            "take_profit": p.tp, "position_size": p.lots, "units": p.units, "risk": p.risk_amount,
            "gross_pnl": gross, "commission": commission, "swap": swap, "pnl": pnl,
            "r_multiple": pnl / p.risk_amount if p.risk_amount > 0 else np.nan,
            "exit_reason": reason, "bars_held": i - p.entry_idx + 1,
            "session": sess[p.entry_idx], "day_of_week": dow[p.entry_idx], "hour_local": int(hour[p.entry_idx]),
            "market_regime": "unclassified", "spread": p.spread, "slippage": p.slip_entry + slip_exit,
            "mae": p.mae, "mfe": p.mfe, "mae_r": p.mae / r_unit if r_unit else np.nan,
            "mfe_r": p.mfe / r_unit if r_unit else np.nan, "equity_before": p.equity_before,
        })

    for i in range(n):
        rs.on_bar(int(day_key[i]), int(week_key[i]), balance)

        # 2. fill pending entry at the open
        if pending is not None and pending[0] == i:
            s = pending[1]
            pending = None
            d = int(s.direction)
            reason = rs.entry_block_reason()
            fill = o[i] + ask_off[i] + slip_m if d > 0 else o[i] + bid_off[i] - slip_m
            stop = float(s.stop)
            dist = (fill - stop) * d
            lots = 0.0
            if reason is None and dist <= 0:
                reason = "stop_beyond_fill"
            if reason is None:
                lots = position_size(balance, dist, risk, instrument, comm)
                if lots <= 0:
                    reason = "size_below_min_lot"
            if reason is not None:
                rejected.append({"signal_time": idx[int(s.bar_idx)], "direction": d, "reason": reason})
            else:
                units = lots * instrument.contract_size
                rr = float(s.tp_rr) if s.tp_rr is not None else math.nan
                tp = fill + d * rr * dist if rr == rr and rr > 0 else math.nan
                positions.append(_Pos(
                    trade_id=next_id, direction=d, signal_idx=int(s.bar_idx), entry_idx=i, entry_price=fill,
                    stop=stop, tp=tp, lots=lots, units=units, risk_amount=dist * units + comm * lots,
                    setup=str(s.setup), score=float(s.score), max_bars=int(s.max_bars or 0),
                    spread=float(sp[i]), slip_entry=slip_m, equity_before=balance,
                ))
                next_id += 1
                rs.open_positions = len(positions)

        # 3. manage open positions inside bar i
        still: list[_Pos] = []
        for p in positions:
            held = i - p.entry_idx + 1
            if p.direction > 0:
                bo, bh, bl, bc = o[i] + bid_off[i], h[i] + bid_off[i], lo[i] + bid_off[i], c[i] + bid_off[i]
                p.mae = max(p.mae, p.entry_price - bl)
                if bo <= p.stop:
                    close_pos(p, i, bo - slip_s, "stop_gap", False)
                elif bl <= p.stop:
                    close_pos(p, i, p.stop - slip_s, "stop", False)
                elif p.tp == p.tp and bh >= p.tp:
                    p.mfe = max(p.mfe, p.tp - p.entry_price)
                    close_pos(p, i, max(p.tp, bo), "take_profit", False)
                else:
                    p.mfe = max(p.mfe, bh - p.entry_price)
                    if p.max_bars and held >= p.max_bars:
                        close_pos(p, i, bc - slip_m, "time", True)
                    else:
                        still.append(p)
            else:
                ao, ah, al, ac = o[i] + ask_off[i], h[i] + ask_off[i], lo[i] + ask_off[i], c[i] + ask_off[i]
                p.mae = max(p.mae, ah - p.entry_price)
                if ao >= p.stop:
                    close_pos(p, i, ao + slip_s, "stop_gap", False)
                elif ah >= p.stop:
                    close_pos(p, i, p.stop + slip_s, "stop", False)
                elif p.tp == p.tp and al <= p.tp:
                    p.mfe = max(p.mfe, p.entry_price - p.tp)
                    close_pos(p, i, min(p.tp, ao), "take_profit", False)
                else:
                    p.mfe = max(p.mfe, p.entry_price - al)
                    if p.max_bars and held >= p.max_bars:
                        close_pos(p, i, ac + slip_m, "time", True)
                    else:
                        still.append(p)
        positions = still
        rs.open_positions = len(positions)

        # 4. mark to market at the close
        unreal = 0.0
        for p in positions:
            mark = c[i] + bid_off[i] if p.direction > 0 else c[i] + ask_off[i]
            unreal += p.direction * (mark - p.entry_price) * p.units
        equity[i] = balance + unreal
        rs.on_equity(equity[i])

        # 5. signal at the close of bar i
        s = sig_map.get(i)
        if s is not None:
            fill_idx = i + 1 + lat
            if pending is not None:
                rejected.append({"signal_time": idx[i], "direction": int(s.direction), "reason": "pending_order_exists"})
            elif fill_idx >= n:
                rejected.append({"signal_time": idx[i], "direction": int(s.direction), "reason": "no_bar_to_fill"})
            else:
                pending = (fill_idx, s)

    if close_at_end and n:
        i = n - 1
        for p in positions:
            px = c[i] + bid_off[i] - slip_m if p.direction > 0 else c[i] + ask_off[i] + slip_m
            close_pos(p, i, px, "end_of_data", True)
        positions = []
        equity[i] = balance

    trades_df = pd.DataFrame(trades, columns=TRADE_COLUMNS)
    eq = pd.DataFrame({"equity": equity}, index=(idx + step).rename("time"))
    eq["peak"] = eq["equity"].cummax()
    eq["drawdown"] = eq["equity"] / eq["peak"] - 1.0
    info = {
        "bars": n, "spread_source": spread_note, "final_balance": float(balance),
        "open_positions_at_end": len(positions), "halted_by_max_drawdown": bool(rs.halted),
        "signals": int(len(signals)), "rejected_signals": len(rejected),
    }
    return BacktestResult(trades_df, eq, pd.DataFrame(rejected, columns=["signal_time", "direction", "reason"]), info)
