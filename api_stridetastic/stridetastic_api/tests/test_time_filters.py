from datetime import datetime, timedelta

from django.utils import timezone
from stridetastic_api.utils.time_filters import parse_time_window


def test_last_all_returns_no_filter():
    since, until = parse_time_window(last="all")
    assert since is None and until is None


def test_last_1hour_window():
    before_call = timezone.now()
    since, until = parse_time_window(last="1hour")
    after_call = timezone.now()
    assert until is not None and since is not None
    # Window ends around now
    assert before_call <= until <= after_call
    # Duration about 1 hour
    delta = until - since
    assert timedelta(minutes=59) <= delta <= timedelta(minutes=61)


def test_since_until_naive_assumed_utc():
    naive_since = datetime(2025, 1, 1, 0, 0, 0)  # naive
    naive_until = datetime(2025, 1, 1, 1, 0, 0)  # naive
    since, until = parse_time_window(since=naive_since, until=naive_until)
    assert timezone.is_aware(since) and timezone.is_aware(until)
    assert since < until


def test_invalid_last_raises():
    try:
        parse_time_window(last="42minutes")
        assert False, "Expected ValueError"
    except ValueError:
        pass


def test_since_after_until_raises():
    now = timezone.now()
    try:
        parse_time_window(since=now, until=now - timedelta(minutes=1))
        assert False, "Expected ValueError"
    except ValueError:
        pass
