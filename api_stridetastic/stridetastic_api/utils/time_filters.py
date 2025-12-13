from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Optional, Tuple, Union

from django.utils import timezone
from django.utils.dateparse import parse_datetime


LAST_CHOICES = {"all", "5min", "1hour", "2hours", "24hours", "7days"}


def _normalize_to_utc(dt: datetime) -> datetime:
    """Ensure a timezone-aware UTC datetime."""
    if timezone.is_naive(dt):
        # Assume naive inputs are UTC
        dt = dt.replace(tzinfo=dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc)


def _coerce_datetime(value: Union[str, datetime, None]) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        parsed = parse_datetime(value)
        if parsed is None:
            raise ValueError(f"Invalid datetime format: {value}")
        return parsed
    if isinstance(value, str) and not value:
        return None
    raise ValueError(f"Unsupported datetime value: {value}")


def parse_time_window(
    last: Optional[str] = None,
    since: Union[str, datetime, None] = None,
    until: Union[str, datetime, None] = None,
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Convert query params into a concrete [since, until] UTC window.

    Rules:
    - If `last` is provided and not 'all', it defines the window ending at now.
    - Else if `since` provided, use [since, until or now].
    - Else return (None, None) meaning no time filtering.

    Returns (since_utc, until_utc) where any may be None.
    Raises ValueError for invalid inputs.
    """
    now = timezone.now()

    if last is not None:
        if last not in LAST_CHOICES:
            raise ValueError(f"Invalid 'last' value: {last}. Must be one of {sorted(LAST_CHOICES)}")
        if last == "all":
            # No time filter from 'last'
            # Fall through to since/until if provided
            pass
        else:
            delta_map = {
                "5min": timedelta(minutes=5),
                "1hour": timedelta(hours=1),
                "2hours": timedelta(hours=2),
                "24hours": timedelta(hours=24),
                "7days": timedelta(days=7),
            }
            delta = delta_map[last]
            return (now - delta, now)

    if since is not None or until is not None:
        since_dt = _coerce_datetime(since)
        until_dt = _coerce_datetime(until)

        since_utc = _normalize_to_utc(since_dt) if since_dt is not None else None
        until_utc = _normalize_to_utc(until_dt) if until_dt is not None else now

        if since_utc is None:
            return (None, until_utc)

        if since_utc > until_utc:
            raise ValueError("'since' must be earlier than or equal to 'until'")
        return (since_utc, until_utc)

    # No filter
    return (None, None)
