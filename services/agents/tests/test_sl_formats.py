from __future__ import annotations

import datetime as dt

import pytest

from govnav_agents.schemas import InputVariety, Lang
from govnav_agents.sl.formats import (
    PhoneError,
    format_sl_date,
    is_valid_mobile,
    normalize_mobile,
    parse_sl_date,
    redact,
)
from govnav_agents.sl.language import detect_language


def test_sl_date_round_trip() -> None:
    d = dt.date(2026, 8, 24)
    assert format_sl_date(d) == "2026.08.24"
    assert parse_sl_date("2026.08.24") == d
    assert parse_sl_date("2026-8-4") == dt.date(2026, 8, 4)


@pytest.mark.parametrize("bad", ["24.08.2026", "2026.13.01", "abcd", ""])
def test_sl_date_invalid(bad: str) -> None:
    with pytest.raises(ValueError):
        parse_sl_date(bad)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0771234567", "077 123 4567"),
        ("077 123 4567", "077 123 4567"),
        ("077-123-4567", "077 123 4567"),
        ("+94771234567", "077 123 4567"),
        ("0094 71 234 5678", "071 234 5678"),
        ("94701234567", "070 123 4567"),
    ],
)
def test_mobile_normalise(raw: str, expected: str) -> None:
    assert normalize_mobile(raw) == expected


@pytest.mark.parametrize("bad", ["0112345678", "079123456", "07912345678", "0791234567", "hello"])
def test_mobile_invalid(bad: str) -> None:
    with pytest.raises(PhoneError):
        normalize_mobile(bad)
    assert not is_valid_mobile(bad)


def test_redact_removes_identifiers() -> None:
    text = "NIC 197412401987 old 746240198V call 077 123 4567 or +94771234567 mail a.b@x.lk"
    out = redact(text)
    for secret in ("197412401987", "746240198V", "123 4567", "+9477", "a.b@x.lk"):
        assert secret not in out
    assert out.count("[NIC]") == 2
    assert out.count("[PHONE]") == 2


@pytest.mark.parametrize(
    ("text", "lang", "variety"),
    [
        ("මට ආදායම් සහතිකයක් අවශ්‍යයි", Lang.SI, InputVariety.SI),
        ("எனக்கு வருமான சான்றிதழ் வேண்டும்", Lang.TA, InputVariety.TA),
        ("I need an income certificate", Lang.EN, InputVariety.EN),
        ("mata income certificate ekak ona duwage scholarship ekata", Lang.SI, InputVariety.SINGLISH),
        ("enakku varumana saanrithal venum", Lang.TA, InputVariety.TANGLISH),
    ],
)
def test_detect_language(text: str, lang: Lang, variety: InputVariety) -> None:
    guess = detect_language(text)
    assert guess.language is lang
    assert guess.variety is variety
