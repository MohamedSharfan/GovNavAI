"""NIC parser: both formats, the +500 female offset and the fixed 29-day February."""

from __future__ import annotations

import datetime as dt

import pytest

from govnav_agents.schemas import Gender
from govnav_agents.sl.nic import NicError, NicFormat, is_valid_nic, parse_nic

TODAY = dt.date(2026, 11, 24)


@pytest.mark.parametrize(
    ("nic", "dob", "gender", "fmt"),
    [
        # Persona from the hi-fi screens: 1974, day 124 → 3 May (Jan 31 + Feb 29 + Mar 31 + Apr 30 = 121).
        ("197412401987", dt.date(1974, 5, 3), Gender.MALE, NicFormat.NEW),
        # Same day, female (+500).
        ("197462401987", dt.date(1974, 5, 3), Gender.FEMALE, NicFormat.NEW),
        # Old format, female: 74 / 624 → 1974-05-03
        ("746240198V", dt.date(1974, 5, 3), Gender.FEMALE, NicFormat.OLD),
        ("746240198x", dt.date(1974, 5, 3), Gender.FEMALE, NicFormat.OLD),
        # Day 1 = 1 Jan; day 366 = 31 Dec.
        ("850011234V", dt.date(1985, 1, 1), Gender.MALE, NicFormat.OLD),
        ("853661234V", dt.date(1985, 12, 31), Gender.MALE, NicFormat.OLD),
        # 1 March is ALWAYS day 61, even in a non-leap year (1985).
        ("850611234V", dt.date(1985, 3, 1), Gender.MALE, NicFormat.OLD),
        # 29 Feb in a leap year is day 60.
        ("200056012345", dt.date(2000, 2, 29), Gender.FEMALE, NicFormat.NEW),
        # Spaces / dashes are tolerated.
        ("1974 124 01987", dt.date(1974, 5, 3), Gender.MALE, NicFormat.NEW),
    ],
)
def test_parse_valid(nic: str, dob: dt.date, gender: Gender, fmt: NicFormat) -> None:
    info = parse_nic(nic, today=TODAY)
    assert info.date_of_birth == dob
    assert info.gender is gender
    assert info.format is fmt


@pytest.mark.parametrize(
    "nic",
    [
        "",
        "12345",
        "74624019V",  # 8 digits
        "7462401980V",  # 10 digits
        "746240198Z",  # wrong letter
        "19741240198",  # 11 digits
        "850001234V",  # day 0
        "853671234V",  # day 367
        "855001234V",  # female day 0
        "858671234V",  # female day 367
        "850601234V",  # 29 Feb 1985 does not exist
        "203012401987",  # future birth
        "201512401987",  # 11 years old (new format) - not issued
    ],
)
def test_parse_invalid(nic: str) -> None:
    with pytest.raises(NicError):
        parse_nic(nic, today=TODAY)
    assert not is_valid_nic(nic, today=TODAY)


def test_old_to_new_conversion() -> None:
    assert parse_nic("746240198V", today=TODAY).new_format == "197462400198"
    assert parse_nic("197412401987", today=TODAY).new_format == "197412401987"


def test_new_serial_drops_migration_zero() -> None:
    assert parse_nic("197462400198", today=TODAY).serial == "0198"
