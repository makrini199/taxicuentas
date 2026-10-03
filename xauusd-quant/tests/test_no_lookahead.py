"""Look-ahead / repainting tests.

Truncation invariance: everything computed on bars[:k] must equal what was
computed on the full series for every decision made before bar k.
Future perturbation: scrambling all bars after k must not change any decision
made at or before bar k - 1 (minus the swing confirmation lag, which is
already inside the past by construction).
"""

import numpy as np
import pandas as pd
import pytest

from xq.data.resample import resample_ohlcv
from xq.mtf import align_htf_to_ltf
from xq.strategies import get_strategy
from xq.structure import detect_structure_events, detect_swings

PARAMS = {"swing_left": 3, "swing_right": 3, "break_mode": "close", "events": ["BOS", "CHOCH"],
          "stop_buffer": 0.1, "min_stop": 0.3, "max_stop": 20, "rr": 2.0, "max_bars_in_trade": 100}


@pytest.mark.parametrize("k", [500, 2017, 6000, 11111])
def test_swings_truncation_invariant(synth_m5, k):
    full = detect_swings(synth_m5, 3, 3)
    part = detect_swings(synth_m5.iloc[:k], 3, 3)
    pd.testing.assert_frame_equal(full[full["confirm_idx"] < k].reset_index(drop=True), part.reset_index(drop=True))


@pytest.mark.parametrize("k", [500, 2017, 6000, 11111])
def test_events_and_trend_truncation_invariant(synth_m5, k):
    ev_f, tr_f = detect_structure_events(synth_m5, detect_swings(synth_m5, 3, 3))
    sub = synth_m5.iloc[:k]
    ev_p, tr_p = detect_structure_events(sub, detect_swings(sub, 3, 3))
    pd.testing.assert_frame_equal(ev_f[ev_f["idx"] < k].reset_index(drop=True), ev_p.reset_index(drop=True))
    pd.testing.assert_series_equal(tr_f.iloc[:k], tr_p)


@pytest.mark.parametrize("k", [700, 5000, 12000])
def test_signals_unchanged_when_future_is_scrambled(synth_m5, k):
    strat = get_strategy("structure_breakout_baseline", PARAMS)
    base = strat.generate_signals(synth_m5)
    rng = np.random.default_rng(0)
    fut = synth_m5.copy()
    shift = rng.normal(0, 5, len(fut) - k).cumsum()
    for col in ("open", "high", "low", "close"):
        fut.iloc[k:, fut.columns.get_loc(col)] += shift
    scr = strat.generate_signals(fut)
    a = base[base["bar_idx"] < k].reset_index(drop=True)
    b = scr[scr["bar_idx"] < k].reset_index(drop=True)
    pd.testing.assert_frame_equal(a, b)
    assert len(a) > 0


def test_mtf_alignment_truncation_invariant():
    from xq.data.synthetic import generate_synthetic_m1

    m1 = generate_synthetic_m1("2024-03-04", "2024-03-15", seed=5)
    m5_full = resample_ohlcv(m1, "M5")
    al_full = align_htf_to_ltf(resample_ohlcv(m1, "H4"), m5_full.index, "M5", "H4")
    cut = pd.Timestamp("2024-03-12 13:37", tz="UTC")
    m1c = m1.loc[:cut]
    m5c = resample_ohlcv(m1c, "M5").iloc[:-1]  # drop the incomplete last M5 bar
    al_cut = align_htf_to_ltf(resample_ohlcv(m1c, "H4"), m5c.index, "M5", "H4")
    pd.testing.assert_frame_equal(al_full.loc[m5c.index], al_cut, check_freq=False)
