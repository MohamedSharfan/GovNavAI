"""Sri Lankan date and phone formats, plus log redaction."""

from __future__ import annotations

import datetime as dt
import re

# ----------------------------------------------------------------------------
# Dates: Sri Lankan government forms write dates as YYYY.MM.DD
# ----------------------------------------------------------------------------

_DATE_RE = re.compile(r"^\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*$")


def format_sl_date(value: dt.date) -> str:
    """Format a date the way Sri Lankan forms do: ``2026.08.24``."""
    return f"{value.year:04d}.{value.month:02d}.{value.day:02d}"


def parse_sl_date(value: str) -> dt.date:
    """Parse ``YYYY.MM.DD`` (also accepts ``-`` or ``/`` separators).

    Raises:
        ValueError: If the string is not a valid year-first date.
    """
    m = _DATE_RE.match(value)
    if not m:
        raise ValueError(f"not a YYYY.MM.DD date: {value!r}")
    return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


# ----------------------------------------------------------------------------
# Phones: mobile numbers are 07X XXX XXXX (070-078). +94 / 0094 prefixes accepted.
# ----------------------------------------------------------------------------

_MOBILE_RE = re.compile(r"^0(7[0-8])(\d{7})$")


class PhoneError(ValueError):
    """Raised for numbers that are not Sri Lankan mobile numbers."""


def normalize_mobile(raw: str) -> str:
    """Normalise a Sri Lankan mobile number to ``07X XXX XXXX``.

    Raises:
        PhoneError: If it is not a valid mobile number.
    """
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("+94"):
        digits = "0" + digits[3:]
    elif digits.startswith("0094"):
        digits = "0" + digits[4:]
    elif digits.startswith("94") and len(digits) == 11:
        digits = "0" + digits[2:]
    m = _MOBILE_RE.match(digits)
    if not m:
        raise PhoneError("expected a mobile number like 07X XXX XXXX")
    rest = m.group(2)
    return f"0{m.group(1)} {rest[:3]} {rest[3:]}"


def is_valid_mobile(raw: str) -> bool:
    try:
        normalize_mobile(raw)
    except PhoneError:
        return False
    return True


# ----------------------------------------------------------------------------
# Redaction: NIC numbers, phone numbers and e-mails never reach logs.
# ----------------------------------------------------------------------------

_REDACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b\d{12}\b"), "[NIC]"),
    (re.compile(r"\b\d{9}[VvXx]\b"), "[NIC]"),
    (re.compile(r"(?:\+94|0094|\b0)7\d[\s-]?\d{3}[\s-]?\d{4}\b"), "[PHONE]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[EMAIL]"),
)


def redact(text: str) -> str:
    """Remove personal identifiers from free text before it is logged."""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text
