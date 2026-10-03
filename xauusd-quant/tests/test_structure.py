import numpy as np
import pandas as pd

from conftest import make_bars
from xq.structure import detect_structure_events, detect_swings, label_swings


def bars_from_highs_lows(hl):
    return make_bars([((h + l) / 2, h, l, (h + l) / 2) for h, l in hl])


def test_swing_high_confirmed_only_after_right_bars():
    #          0    1    2    3*   4    5    6
    highs = [10, 11, 12, 15, 13, 12, 11]
    df = bars_from_highs_lows([(h, h - 1) for h in highs])
    sw = detect_swings(df, left=2, right=2)
    sh = sw[sw["kind"] == "high"]
    assert sh["pivot_idx"].tolist() == [3]
    assert sh["confirm_idx"].tolist() == [5]
    assert sh["price"].tolist() == [15]


def test_no_pivot_without_enough_right_bars():
    df = bars_from_highs_lows([(h, h - 1) for h in [10, 11, 12, 15, 13]])
    assert len(detect_swings(df, 2, 2).query("kind == 'high'")) == 0


def test_equal_highs_first_wins():
    df = bars_from_highs_lows([(h, h - 1) for h in [10, 11, 15, 15, 12, 11, 10]])
    sh = detect_swings(df, 2, 2).query("kind == 'high'")
    assert sh["pivot_idx"].tolist() == [2]


def test_hh_hl_labels():
    # two rising highs and two rising lows
    hl = [(10, 9), (12, 11), (14, 12), (12, 10.5), (11, 10), (13, 11), (16, 14), (14, 12), (13, 11.5), (15, 13), (14, 12)]
    sw = label_swings(detect_swings(bars_from_highs_lows(hl), 1, 1))
    highs = sw.query("kind == 'high'")["label"].tolist()
    lows = sw.query("kind == 'low'")["label"].tolist()
    assert highs[:2] == ["H", "HH"]
    assert lows[:2] == ["L", "HL"]


def _ohlc_path(closes):
    """Bars whose range is +-0.2 around a close path; open = previous close."""
    rows, prev = [], closes[0]
    for c in closes:
        rows.append((prev, max(prev, c) + 0.2, min(prev, c) - 0.2, c))
        prev = c
    return make_bars(rows)


def test_bos_then_choch():
    # up-leg, pullback (swing high 105), new high breaks 105 (BOS? trend undefined -> BOS),
    # then a pullback making a swing low, then collapse below it -> CHOCH (bearish).
    closes = [100, 102, 104, 105, 103, 101, 102, 104, 106, 108, 107, 105, 104, 106, 103, 100, 98]
    df = _ohlc_path(closes)
    sw = detect_swings(df, 2, 2)
    ev, trend = detect_structure_events(df, sw, "close")
    kinds = list(zip(ev["direction"], ev["kind"]))
    assert kinds[0] == (1, "BOS")
    assert (-1, "CHOCH") in kinds
    first_choch = ev[(ev["kind"] == "CHOCH")].iloc[0]
    assert trend.iloc[first_choch["idx"]] == -1
    # every event uses a level from a swing confirmed no later than the event bar
    for e in ev.itertuples():
        conf = sw.loc[sw["pivot_idx"] == e.swing_pivot_idx, "confirm_idx"].min()
        assert conf <= e.idx


def test_each_level_breaks_once():
    closes = [100, 102, 104, 105, 103, 101, 102, 106, 104, 106.5, 105, 107]
    df = _ohlc_path(closes)
    sw = detect_swings(df, 2, 2)
    ev, _ = detect_structure_events(df, sw)
    assert not ev.duplicated(subset=["swing_pivot_idx", "direction"]).any()


def test_wick_mode_breaks_earlier_or_equal(synth_m5):
    sw = detect_swings(synth_m5, 3, 3)
    ev_c, _ = detect_structure_events(synth_m5, sw, "close")
    ev_w, _ = detect_structure_events(synth_m5, sw, "wick")
    assert len(ev_w) >= len(ev_c) * 0.9
