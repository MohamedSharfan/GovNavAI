"""Script-based language detection, including romanised Sinhala/Tamil (Singlish/Tanglish).

Used by the offline model and as a cheap prior for the Gemini router. Gemini is
the authority online; this module only has to be good enough to be a safe default.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from govnav_agents.schemas import InputVariety, Lang

_SINHALA = re.compile(r"[඀-෿]")
_TAMIL = re.compile(r"[஀-௿]")
_WORD = re.compile(r"[a-z]+")

# High-signal romanised function words and common terms.
_SINGLISH_MARKERS = frozenset(
    """
    mata mage mama oya oyage ona oney onee ekak eka ekata kohomada kohomd mokakda mokadda
    karanne karanna ganna gannako ganne denna dennada thiyenawa thiyenne nadda neda nathi
    duwage duwa puthage putha amma thaththa gedara sahathikaya sahathika sahatikaya adayam
    aadayam charitha padinchi hadunumpath hadunumpatha idam idame pinnapa kantorue kantoruwa
    lekam grama niladhari niladari wela welawa gana gaana kiyada kiyadha keeyada kochchara
    wenna wenawa ewanna yanna monawada mokada
    """.split()
)
_TANGLISH_MARKERS = frozenset(
    """
    enakku enaku ennoda en enna eppadi epdi vendum venum veanum vaenum kidaikuma kidaikum
    sandrithal saanrithal saandrithal saandridhal varumana varumanam pirappu thirumanam
    irappu adaiyala attai adayala adaiyalaattai ponnu magal magan amma appa enga engae
    evvalavu evlo yenna enna eppo aluvalagam aluvalakam kirama niladhari sevai
    """.split()
)


@dataclass(frozen=True, slots=True)
class LanguageGuess:
    language: Lang
    variety: InputVariety
    confidence: float


def detect_language(text: str, *, fallback: Lang = Lang.EN) -> LanguageGuess:
    """Guess the answer language and input variety of ``text``."""
    si = len(_SINHALA.findall(text))
    ta = len(_TAMIL.findall(text))
    letters = sum(ch.isalpha() for ch in text) or 1

    if si or ta:
        if si >= ta:
            return LanguageGuess(Lang.SI, InputVariety.SI, min(1.0, 0.5 + si / letters))
        return LanguageGuess(Lang.TA, InputVariety.TA, min(1.0, 0.5 + ta / letters))

    words = _WORD.findall(text.lower())
    if not words:
        return LanguageGuess(fallback, InputVariety(fallback.value), 0.3)
    s_hits = sum(w in _SINGLISH_MARKERS for w in words)
    t_hits = sum(w in _TANGLISH_MARKERS for w in words)
    if s_hits == 0 and t_hits == 0:
        return LanguageGuess(Lang.EN, InputVariety.EN, 0.7)
    if s_hits >= t_hits:
        return LanguageGuess(Lang.SI, InputVariety.SINGLISH, min(1.0, 0.5 + s_hits / len(words)))
    return LanguageGuess(Lang.TA, InputVariety.TANGLISH, min(1.0, 0.5 + t_hits / len(words)))
