import numpy as np
import pandas as pd
import pytest

from xq.data.resample import resample_ohlcv
from xq.data.synthetic import generate_synthetic_m1
from xq.mtf import align_htf_to_ltf


@pytest.fixture(scope="module")
def m1():
    return generate_synthetic_m1("2024-03-04", "2024-03-08", seed=1)


def test_resample_aggregation(m1):
    h1 = resample_ohlcv(m1, "H1")
    first = m1.loc[h1.index[3]: h1.index[3] + pd.Timedelta(minutes=59)]
    row = h1.iloc[3]
    assert row["open"] == first["open"].iloc[0]
    assert row["high"] == first["high"].max()
    assert row["low"] == first["low"].min()
    assert row["close"] == first["close"].iloc[-1]
    assert row["volume"] == first["volume"].sum()
    assert (h1["close_time"] == h1.index + pd.Timedelta(hours=1)).all()


def test_d1_uses_new_york_trading_day(m1):
    d1 = resample_ohlcv(m1, "D1")
    ny_close = d1["close_time"].dt.tz_convert("America/New_York")
    assert (ny_close.dt.hour == 17).all()
    # March 2024 Tuesday trading day: Mon 18:00 NY -> Tue 17:00 NY.
    tue = d1[ny_close.dt.day == 5].iloc[0]
    assert tue.name.tz_convert("America/New_York") == pd.Timestamp("2024-03-04 18:00", tz="America/New_York")


def test_htf_bar_invisible_until_closed(m1):
    m5 = resample_ohlcv(m1, "M5")
    h1 = resample_ohlcv(m1, "H1")
    al = align_htf_to_ltf(h1, m5.index, "M5", "H1")
    for t, row in al.dropna().iterrows():
        assert row["available_at"] <= t + pd.Timedelta(minutes=5)
    # The M5 bar opening 10:55 closes 11:00 -> may see the 10:00 H1 bar; 10:50 (closes 10:55) may not.
    t1055 = pd.Timestamp("2024-03-05 10:55", tz="UTC")
    t1050 = pd.Timestamp("2024-03-05 10:50", tz="UTC")
    assert al.loc[t1055, "htf_bar_time"] == pd.Timestamp("2024-03-05 10:00", tz="UTC")
    assert al.loc[t1050, "htf_bar_time"] == pd.Timestamp("2024-03-05 09:00", tz="UTC")


def test_partial_trailing_htf_bar_never_visible(m1):
    cut = m1.loc[: "2024-03-05 10:29"]
    h1 = resample_ohlcv(cut, "H1")
    m5 = resample_ohlcv(cut, "M5")
    al = align_htf_to_ltf(h1, m5.index, "M5", "H1")
    assert al["htf_bar_time"].max() == pd.Timestamp("2024-03-05 09:00", tz="UTC")
