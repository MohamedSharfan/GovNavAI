"""Sri Lankan National Identity Card (NIC) number parsing.

Formats
-------
* **Old** (issued until 2015, births in 19xx): ``YYDDDSSSC`` + ``V`` or ``X``. 9 digits
  and a letter. ``YY`` is the birth year 19YY.
* **New** (from 2016): ``YYYYDDDSSSSC``. 12 digits. ``YYYY`` is the birth year.

In both formats ``DDD`` is the day of the year of birth. **500 is added for women.**
The Department for Registration of Persons counts **February as always having
29 days**, so day 60 is 29 February and 1 March is always day 61, whatever the year.
Old numbers convert to new ones as ``19YY`` + ``DDD`` + ``0`` + ``SSSC``.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from enum import StrEnum

from govnav_agents.schemas import Gender

# Month lengths with February fixed at 29 days (DRP convention).
_NIC_MONTH_DAYS: tuple[int, ...] = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
_FEMALE_OFFSET = 500
_OLD_RE = re.compile(r"^(\d{2})(\d{3})(\d{4})([VX])$")
_NEW_RE = re.compile(r"^(\d{4})(\d{3})(\d{5})$")


class NicFormat(StrEnum):
    OLD = "old"
    NEW = "new"


class NicError(ValueError):
    """Raised when a string is not a valid NIC number."""


@dataclass(frozen=True, slots=True)
class NicInfo:
    """Facts derived from a NIC number."""

    normalized: str
    format: NicFormat
    date_of_birth: dt.date
    gender: Gender
    day_of_year: int
    serial: str

    @property
    def new_format(self) -> str:
        """The 12-digit equivalent (identity for new-format numbers)."""
        if self.format is NicFormat.NEW:
            return self.normalized
        y = self.date_of_birth.year
        d = self.day_of_year + (_FEMALE_OFFSET if self.gender is Gender.FEMALE else 0)
        return f"{y:04d}{d:03d}0{self.serial}"


def normalize_nic(raw: str) -> str:
    """Strip spaces/dashes and upper-case the trailing letter."""
    return re.sub(r"[\s\-]", "", raw).upper()


def _day_to_month_day(day_of_year: int) -> tuple[int, int]:
    remaining = day_of_year
    for month_index, length in enumerate(_NIC_MONTH_DAYS, start=1):
        if remaining <= length:
            return month_index, remaining
        remaining -= length
    raise NicError(f"day of year {day_of_year} is out of range")


def parse_nic(raw: str, *, today: dt.date | None = None) -> NicInfo:
    """Parse and validate a NIC number.

    Args:
        raw: The NIC as typed or extracted (spaces and dashes are allowed).
        today: Reference date for the "not in the future / plausible age" checks.

    Returns:
        The derived :class:`NicInfo`.

    Raises:
        NicError: If the number is malformed or encodes an impossible date.
    """
    value = normalize_nic(raw)
    today = today or dt.date.today()

    if m := _OLD_RE.match(value):
        year = 1900 + int(m.group(1))
        encoded_day = int(m.group(2))
        serial = m.group(3)
        fmt = NicFormat.OLD
    elif m := _NEW_RE.match(value):
        year = int(m.group(1))
        encoded_day = int(m.group(2))
        serial = m.group(3)[1:]  # leading 0 inserted when old numbers were migrated
        fmt = NicFormat.NEW
        if year < 1900:
            raise NicError("birth year before 1900")
    else:
        raise NicError("NIC must be 9 digits + V/X, or 12 digits")

    if encoded_day > _FEMALE_OFFSET:
        gender = Gender.FEMALE
        day = encoded_day - _FEMALE_OFFSET
    else:
        gender = Gender.MALE
        day = encoded_day
    if not 1 <= day <= 366:
        raise NicError(f"day-of-year segment {encoded_day:03d} is invalid")

    month, dom = _day_to_month_day(day)
    try:
        dob = dt.date(year, month, dom)
    except ValueError as exc:  # 29 Feb in a non-leap year
        raise NicError(f"encoded date {year}-{month:02d}-{dom:02d} does not exist") from exc

    if dob > today:
        raise NicError("date of birth is in the future")
    if (today.year - year) < 15 and fmt is NicFormat.NEW:
        # NICs are issued from age 15; a younger DOB is almost certainly a typo.
        raise NicError("NIC holders must be at least 15 years old")

    return NicInfo(
        normalized=value,
        format=fmt,
        date_of_birth=dob,
        gender=gender,
        day_of_year=day,
        serial=serial,
    )


def is_valid_nic(raw: str, *, today: dt.date | None = None) -> bool:
    try:
        parse_nic(raw, today=today)
    except NicError:
        return False
    return True
