import pandas as pd

from xq.utils.sessions import primary_session, window_mask
from xq.utils.timeutils import count_rollovers


def _utc(s):
    return pd.DatetimeIndex([pd.Timestamp(s, tz="UTC")])


def test_golden_hours_madrid_follows_spanish_dst():
    # Winter: Madrid = UTC+1 -> 14:30 Madrid = 13:30 UTC
    assert window_mask(_utc("2024-01-10 13:30"), "14:30", "16:30", "Europe/Madrid")[0]
    assert not window_mask(_utc("2024-01-10 12:30"), "14:30", "16:30", "Europe/Madrid")[0]
    # Summer: Madrid = UTC+2 -> 14:30 Madrid = 12:30 UTC
    assert window_mask(_utc("2024-07-10 12:30"), "14:30", "16:30", "Europe/Madrid")[0]
    assert not window_mask(_utc("2024-07-10 14:30"), "14:30", "16:30", "Europe/Madrid")[0]


def test_dst_mismatch_week_madrid_vs_new_york():
    # 2024-03-10 US moves to EDT, EU stays CET until 2024-03-31.
    # On 2024-03-20: 14:30 Madrid = 13:30 UTC = 09:30 New York (normally 08:30).
    t = _utc("2024-03-20 13:30")
    assert window_mask(t, "14:30", "16:30", "Europe/Madrid")[0]
    assert t.tz_convert("America/New_York")[0].hour == 9
    # The NY-anchored window (08:30 NY) starts one hour EARLIER in UTC that week.
    assert window_mask(_utc("2024-03-20 12:30"), "08:30", "10:30", "America/New_York")[0]
    assert not window_mask(_utc("2024-03-20 12:30"), "14:30", "16:30", "Europe/Madrid")[0]


def test_window_crossing_midnight():
    idx = pd.DatetimeIndex(pd.to_datetime(["2024-01-10 23:30", "2024-01-11 01:00", "2024-01-11 03:00"], utc=True))
    assert window_mask(idx, "23:00", "02:00", "UTC").tolist() == [True, True, False]


def test_primary_session_precedence(cfg):
    idx = pd.DatetimeIndex(pd.to_datetime(["2024-01-10 13:45", "2024-01-10 02:00", "2024-01-10 22:30"], utc=True))  # 17:30 NY, 07:30 Tokyo
    labels = primary_session(idx, cfg.sessions).tolist()
    assert labels[0] == "golden_hours"
    assert labels[1] == "asia"
    assert labels[2] == "other"


def test_rollover_count_and_triple_wednesday():
    ts = lambda s: pd.Timestamp(s, tz="America/New_York")  # noqa: E731
    assert count_rollovers(ts("2024-01-08 10:00"), ts("2024-01-08 16:59")) == 0
    assert count_rollovers(ts("2024-01-08 10:00"), ts("2024-01-09 10:00")) == 1   # Mon night
    assert count_rollovers(ts("2024-01-10 10:00"), ts("2024-01-11 10:00")) == 3   # Wed = triple
    assert count_rollovers(ts("2024-01-08 10:00"), ts("2024-01-12 16:00")) == 6   # Mon..Thu
