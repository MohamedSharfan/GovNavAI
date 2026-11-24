"""Script-aware text normalisation and tokenisation for Sinhala, Tamil and Latin text.

Sinhala and Tamil are agglutinative: "සහතිකය", "සහතිකයක්" and "සහතිකයට" all mean
"certificate". Whole-word matching misses these, so every word also contributes
character n-grams. Zero-width joiners (used in Sinhala conjuncts such as "ශ්‍ය")
are removed so that typed and copy-pasted variants match.
"""

from __future__ import annotations

import re
import unicodedata

_ZW = re.compile(r"[​‌‍﻿]")
_TOKEN = re.compile(r"[\w඀-෿஀-௿]+", re.UNICODE)

# Light normalisation of common romanised spelling variants (Singlish/Tanglish).
_ROMAN_VARIANTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"th"), "t"),
    (re.compile(r"dh"), "d"),
    (re.compile(r"aa+"), "a"),
    (re.compile(r"ee+"), "i"),
    (re.compile(r"oo+"), "u"),
    (re.compile(r"w"), "v"),
)

_STOP_EN = frozenset(
    "a an the i my me to for of in on and or is it do does need want get how what where can".split()
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = _ZW.sub("", text)
    return text.lower().strip()


def _roman_fold(word: str) -> str:
    for pattern, repl in _ROMAN_VARIANTS:
        word = pattern.sub(repl, word)
    return word


def words(text: str) -> list[str]:
    return _TOKEN.findall(normalize(text))


def tokens(text: str, *, ngram: tuple[int, int] = (3, 4)) -> list[str]:
    """Tokens for lexical retrieval: words + character n-grams per word."""
    out: list[str] = []
    for w in words(text):
        is_latin = w.isascii()
        if is_latin and w in _STOP_EN:
            continue
        base = _roman_fold(w) if is_latin else w
        out.append(f"w:{base}")
        padded = f"^{base}$"
        lo, hi = ngram
        for n in range(lo, hi + 1):
            if len(padded) < n:
                continue
            out.extend(f"g:{padded[i : i + n]}" for i in range(len(padded) - n + 1))
    return out
