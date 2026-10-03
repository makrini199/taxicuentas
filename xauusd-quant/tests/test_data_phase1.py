"""Phase 1 — data infrastructure: loaders, merging, diagnostics, build gate, integrity."""

import numpy as np
import pandas as pd
import pytest

from xq.config import DataConfig, SplitConfig, load_config
from xq.data import diagnostics as diag
from xq.data.cleaning import clean_ohlcv
from xq.data.diagnostics import check_spread, check_timeframe, check_timezone, coverage_by_year, find_spikes
from xq.data.loaders import expand_paths, load_generic_csv, load_mt5_csv
from xq.data.pipeline import DataQualityError, build_dataset
from xq.data.quality_report import build_quality_report
from xq.data.store import DatasetIntegrityError, load_dataset, processed_path
from xq.data.synthetic import generate_synthetic_m1


@pytest.fixture(scope="module")
def m1():
    # Spans both DST-mismatch periods of 2024 (March and late Oct / early Nov).
    return generate_synthetic_m1("2024-02-26", "2024-11-15", seed=9)


def write_mt5_csv(df: pd.DataFrame, path, server="NY+7", point=0.01):
    """Write bars exactly like MetaTrader 5 'Export bars' does, in server time."""
    if server == "NY+7":
        local = df.index.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)
    else:
        local = df.index.tz_convert(server).tz_localize(None)
    out = pd.DataFrame({
        "<DATE>": local.strftime("%Y.%m.%d"), "<TIME>": local.strftime("%H:%M:%S"),
        "<OPEN>": df["open"].to_numpy(), "<HIGH>": df["high"].to_numpy(), "<LOW>": df["low"].to_numpy(),
        "<CLOSE>": df["close"].to_numpy(), "<TICKVOL>": df["volume"].astype(int).to_numpy(), "<VOL>": 0,
        "<SPREAD>": np.round(df["spread"].to_numpy() / point).astype(int),
    })
    out.to_csv(path, sep="\t", index=False)


# ------------------------------------------------------------------ timezone diagnostics
def test_timezone_ok_for_correct_server_zone(m1, tmp_path):
    p = tmp_path / "x.csv"
    write_mt5_csv(m1.loc["2024-03-01":"2024-05-31"], p)
    df, _ = load_mt5_csv(p, "NY+7", 0.01)
    pd.testing.assert_index_equal(df.index, m1.loc["2024-03-01":"2024-05-31"].index, check_names=False)
    assert check_timezone(df, "M1")["severity"] == diag.OK


def test_timezone_fail_when_ny7_server_read_as_utc(m1, tmp_path):
    p = tmp_path / "x.csv"
    write_mt5_csv(m1, p)
    df, _ = load_mt5_csv(p, "UTC", 0.01)
    r = check_timezone(df, "M1")
    assert r["severity"] == diag.FAIL and "DST" in r["message"]
    assert r["weekly_close_offset_h_us_dst"] == pytest.approx(3.0)
    assert r["weekly_close_offset_h_us_standard"] == pytest.approx(2.0)


def test_timezone_fail_on_constant_offset(m1):
    shifted = m1.copy()
    shifted.index = shifted.index + pd.Timedelta(hours=2)
    r = check_timezone(shifted, "M1")
    assert r["severity"] == diag.FAIL and "+2" in r["message"]


def test_timezone_warns_on_european_dst_for_us_dst_server(m1, tmp_path):
    p = tmp_path / "x.csv"
    write_mt5_csv(m1, p)
    df, _ = load_mt5_csv(p, "Europe/Athens", 0.01)  # right offset most of the year, wrong DST calendar
    r = check_timezone(df, "M1")
    assert r["severity"] == diag.WARN
    assert any(d.startswith("2024-03") for d in r["weeks_off_by_1h"])
    assert any(d[:7] in ("2024-10", "2024-11") for d in r["weeks_off_by_1h"])


def test_timezone_insufficient_data():
    short = generate_synthetic_m1("2024-03-05", "2024-03-07")
    assert check_timezone(short, "M1")["severity"] == diag.INFO


# ------------------------------------------------------------------ other diagnostics
def test_timeframe_mismatch_detected(m1):
    from xq.data.resample import resample_ohlcv

    assert check_timeframe(m1, "M1")["severity"] == diag.OK
    r = check_timeframe(resample_ohlcv(m1.iloc[:5000], "M5"), "M1")
    assert r["severity"] == diag.FAIL and r["inferred"] == "M5"


def test_spread_units_sanity(m1, tmp_path):
    assert check_spread(m1)["severity"] == diag.OK
    p = tmp_path / "x.csv"
    write_mt5_csv(m1.iloc[:3000], p)
    wrong, _ = load_mt5_csv(p, "NY+7", 1.0)  # point_size should be 0.01
    assert check_spread(wrong)["severity"] == diag.FAIL
    assert check_spread(m1.drop(columns="spread"))["severity"] == diag.INFO


def test_spike_detection_flags_bad_tick_without_removing(m1):
    df = m1.iloc[:20000].copy()
    t = df.index[12345]
    df.loc[t, "high"] = df.loc[t, "high"] + 40.0
    r = find_spikes(df)
    assert r["count"] >= 1 and r["top"][0]["time"] == str(t)
    assert len(df) == 20000  # report only


def test_coverage_detects_missing_day(m1):
    assert coverage_by_year(m1, "M1")["pct_by_year"][2024] == pytest.approx(100.0)
    holed = m1.drop(m1.loc["2024-05-14 00:00":"2024-05-15 00:00"].index)
    c = coverage_by_year(holed, "M1")
    assert 99.0 < c["pct_by_year"][2024] < 100.0


# ------------------------------------------------------------------ loaders & merging
def test_generic_csv_date_time_columns_and_tz_aware(tmp_path):
    p = tmp_path / "g.csv"
    p.write_text("Date;Time;O;H;L;C;V\n2024-07-01;10:00;2330.1;2331;2329.5;2330.8;5\n2024-07-01;10:01;2330.8;2331.2;2330.4;2331;7\n")
    cmap = {"date": "Date", "time": "Time", "open": "O", "high": "H", "low": "L", "close": "C", "volume": "V"}
    df, _ = load_generic_csv(p, cmap, "Europe/Madrid")
    assert df.index[0] == pd.Timestamp("2024-07-01 08:00", tz="UTC")
    p2 = tmp_path / "g2.csv"
    p2.write_text("ts,o,h,l,c\n2024-07-01T10:00:00+02:00,1,2,0.5,1.5\n")
    df2, _ = load_generic_csv(p2, {"timestamp": "ts", "open": "o", "high": "h", "low": "l", "close": "c"}, "UTC")
    assert df2.index[0] == pd.Timestamp("2024-07-01 08:00", tz="UTC") and (df2["volume"] == 0).all()
    with pytest.raises(ValueError, match="missing"):
        load_generic_csv(p2, {"timestamp": "ts", "open": "o"}, "UTC")


def test_dst_ambiguous_local_times_are_dropped_and_counted(tmp_path):
    # Madrid falls back on 2024-10-27: 02:00-02:59 happens twice -> ambiguous.
    p = tmp_path / "x.csv"
    rows = ["<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>"]
    for t in ["01:59", "02:00", "02:30", "03:00"]:
        rows.append(f"2024.10.27\t{t}:00\t2700\t2701\t2699\t2700.5\t10\t0\t20")
    p.write_text("\n".join(rows) + "\n")
    df, info = load_mt5_csv(p, "Europe/Madrid", 0.01)
    assert info["dst_ambiguous_or_nonexistent_dropped"] == 2 and len(df) == 2


def test_glob_expansion_is_sorted(tmp_path):
    for n in ("b", "a", "c"):
        (tmp_path / f"X_{n}.csv").write_text("x")
    assert [p.name for p in expand_paths(tmp_path / "X_*.csv")] == ["X_a.csv", "X_b.csv", "X_c.csv"]
    with pytest.raises(FileNotFoundError):
        expand_paths(tmp_path / "nothing_*.csv")


def test_duplicate_conflicts_counted_separately():
    a = generate_synthetic_m1("2024-03-04", "2024-03-05", seed=1)
    b = a.iloc[100:200].copy()
    b.iloc[:10, b.columns.get_loc("close")] += 0.0  # identical
    b.iloc[10:15, b.columns.get_loc("high")] += 1.0  # conflicting
    out, rep = clean_ohlcv(pd.concat([a, b]))
    assert rep["duplicates_removed"] == 100 and rep["duplicate_conflicts"] == 5
    pd.testing.assert_frame_equal(out, a, check_freq=False)  # earlier source wins


# ------------------------------------------------------------------ end-to-end build gate
def _cfg(tmp_path, raw, source="mt5_csv", tz="NY+7", point=0.01, base="M1"):
    return DataConfig(
        instrument="XAUUSD", source=source, raw_path=str(raw), processed_dir=str(tmp_path / "proc"),
        metadata_dir=str(tmp_path / "meta"), source_timezone=tz, price_basis="bid", volume_type="tick",
        base_timeframe=base, timeframes=["M1", "M5", "H1", "D1"], point_size=point, contract_size=100,
        splits=SplitConfig(train_end="2024-06-01", validation_end="2024-09-01"),
    )


def test_end_to_end_mt5_multi_file_build(m1, tmp_path):
    part1, part2 = m1.loc[:"2024-06-30"], m1.loc["2024-06-20":]  # overlapping exports
    write_mt5_csv(part1, tmp_path / "XAUUSD_M1_2024a.csv")
    write_mt5_csv(part2, tmp_path / "XAUUSD_M1_2024b.csv")
    cfg = _cfg(tmp_path, tmp_path / "XAUUSD_M1_*.csv")
    out = build_dataset(cfg, log=lambda *_: None)
    pd.testing.assert_frame_equal(out["M1"][["open", "high", "low", "close"]], m1[["open", "high", "low", "close"]],
                                  check_freq=False)
    df, meta = load_dataset(cfg, "M1")
    assert meta.volume_type == "tick" and len(meta.quality["files"]) == 2
    assert meta.quality["duplicates_removed"] > 0 and meta.quality["duplicate_conflicts"] == 0
    assert meta.quality["diagnostics"]["timezone"]["severity"] == diag.OK
    assert meta.quality["forced"] is False
    assert load_dataset(cfg, "D1")[1].quality["resampled_from"] == "M1"
    sessions = load_config().sessions
    rep = build_quality_report(cfg, sessions)
    for section in ("## Diagnostics", "## Timezone check", "## Coverage", "## Activity by hour", "## Derived timeframes"):
        assert section in rep


def test_build_refuses_wrong_timezone_unless_forced(m1, tmp_path):
    write_mt5_csv(m1, tmp_path / "x.csv")
    cfg = _cfg(tmp_path, tmp_path / "x.csv", tz="UTC")
    with pytest.raises(DataQualityError, match="timezone"):
        build_dataset(cfg, log=lambda *_: None)
    assert not processed_path(cfg, "M1").exists()
    build_dataset(cfg, log=lambda *_: None, force=True)
    _, meta = load_dataset(cfg, "M5")
    assert meta.quality["forced"] is True
    assert "FORCED BUILD" in build_quality_report(cfg, load_config().sessions)


def test_build_refuses_wrong_base_timeframe(m1, tmp_path):
    write_mt5_csv(m1.iloc[:20000], tmp_path / "x.csv")
    with pytest.raises(DataQualityError, match="timeframe"):
        build_dataset(_cfg(tmp_path, tmp_path / "x.csv", base="M5"), log=lambda *_: None)


def test_integrity_check_rejects_modified_file(m1, tmp_path):
    write_mt5_csv(m1.iloc[:20000], tmp_path / "x.csv")
    cfg = _cfg(tmp_path, tmp_path / "x.csv")
    build_dataset(cfg, log=lambda *_: None)
    p = processed_path(cfg, "M5")
    df = pd.read_parquet(p)
    df.iloc[5, df.columns.get_loc("close")] += 0.01
    df.to_parquet(p)
    with pytest.raises(DatasetIntegrityError):
        load_dataset(cfg, "M5")
    load_dataset(cfg, "M5", verify=False)  # explicit opt-out still possible


def test_mixing_tick_and_real_volume_files_is_refused(m1, tmp_path):
    write_mt5_csv(m1.iloc[:3000], tmp_path / "X_a.csv")
    real = tmp_path / "X_b.csv"
    write_mt5_csv(m1.iloc[3000:6000], real)
    t = pd.read_csv(real, sep="\t")
    t["<VOL>"] = 5
    t.to_csv(real, sep="\t", index=False)
    with pytest.raises(ValueError, match="volume type"):
        build_dataset(_cfg(tmp_path, tmp_path / "X_*.csv"), log=lambda *_: None)
