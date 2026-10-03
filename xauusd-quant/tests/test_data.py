import numpy as np
import pandas as pd
import pytest

from conftest import make_bars
from xq.data.cleaning import clean_ohlcv, detect_gaps
from xq.data.loaders import load_mt5_csv
from xq.data.metadata import content_hash
from xq.data.schema import DataValidationError, validate_ohlcv
from xq.data.synthetic import generate_synthetic_m1


def test_validate_accepts_clean_frame():
    assert validate_ohlcv(make_bars([(10, 11, 9, 10.5)] * 3)) == []


def test_validate_rejects_naive_index_and_bad_ohlc():
    df = make_bars([(10, 11, 9, 10.5), (10, 9.5, 9, 10)])  # high < open
    with pytest.raises(DataValidationError, match="violate"):
        validate_ohlcv(df)
    naive = df.copy()
    naive.index = naive.index.tz_localize(None)
    assert any("naive" in i for i in validate_ohlcv(naive, raise_on_error=False))


def test_clean_drops_duplicates_and_invalid_rows_and_reports():
    df = make_bars([(10, 11, 9, 10.5), (10, 11, 9, 10.5), (10, 9.5, 9, 10), (10, 11, 9, 10)])
    df = pd.concat([df, df.iloc[[0]]])  # duplicate timestamp
    out, rep = clean_ohlcv(df)
    assert rep["duplicates_removed"] == 1
    assert rep["invalid_ohlc_rows_removed"] == 1
    assert out.index.is_monotonic_increasing and not out.index.has_duplicates
    validate_ohlcv(out)


def test_gap_classification():
    m1 = generate_synthetic_m1("2024-03-04", "2024-03-15")
    gaps = detect_gaps(m1, "M1")
    assert set(gaps["kind"]) <= {"weekend", "daily_break"}
    assert (gaps["kind"] == "weekend").sum() == 1
    holed = m1.drop(m1.index[1000:1030])  # an outage in the middle of a session
    g2 = detect_gaps(holed, "M1")
    unexpected = g2[g2["kind"] == "unexpected"]
    assert len(unexpected) == 1 and unexpected["missing_bars"].iloc[0] == 30


def test_mt5_csv_loader(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text(
        "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n"
        "2024.07.01\t10:00:00\t2330.10\t2331.00\t2329.50\t2330.80\t120\t0\t25\n"
        "2024.07.01\t10:01:00\t2330.80\t2331.20\t2330.40\t2331.00\t90\t0\t30\n"
    )
    df, info = load_mt5_csv(p, "Europe/Athens", 0.01)  # EEST = UTC+3 in July
    assert df.index[0] == pd.Timestamp("2024-07-01 07:00", tz="UTC")
    assert info["volume_type_detected"] == "tick"
    assert df["spread"].tolist() == pytest.approx([0.25, 0.30])


def test_mt5_ny_plus_7_server_time(tmp_path):
    # NY+7 server: 00:00 server = 17:00 New York previous day.
    p = tmp_path / "x.csv"
    p.write_text("<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<TICKVOL>,<VOL>,<SPREAD>\n"
                 "2024.01.10,00:00,2000,2001,1999,2000.5,10,0,20\n"
                 "2024.07.10,00:00,2300,2301,2299,2300.5,10,0,20\n")
    df, _ = load_mt5_csv(p, "NY+7", 0.01)
    assert df.index[0] == pd.Timestamp("2024-01-09 22:00", tz="UTC")  # EST
    assert df.index[1] == pd.Timestamp("2024-07-09 21:00", tz="UTC")  # EDT


def test_content_hash_is_deterministic_and_sensitive():
    df = make_bars([(10, 11, 9, 10.5)] * 5)
    h1 = content_hash(df)
    assert h1 == content_hash(df.copy())
    df2 = df.copy()
    df2.iloc[2, 3] = 10.4
    assert h1 != content_hash(df2)


def test_synthetic_is_valid_and_reproducible():
    a = generate_synthetic_m1("2024-01-01", "2024-01-10", seed=3)
    b = generate_synthetic_m1("2024-01-01", "2024-01-10", seed=3)
    validate_ohlcv(a)
    pd.testing.assert_frame_equal(a, b)
    ny = a.index.tz_convert("America/New_York")
    assert not ((ny.weekday == 5).any() or (ny.hour == 17).any())
