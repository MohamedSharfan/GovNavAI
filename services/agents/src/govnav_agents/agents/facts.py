"""Record → facts the model may use, and the grounding guard that checks its answer.

The info agent receives ONLY the output of :func:`record_facts`. After it answers,
:func:`check_grounding` rejects any reply that contains a number not present in
those facts (fees, days, form codes, hotline), or that names a different
procedure. A rejected reply is replaced by :func:`template_answer`, which is
written purely from the record.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from govnav_agents.agents.labels import office_label
from govnav_agents.schemas import Lang, Procedure

_NUM = re.compile(r"\d+(?:[.,]\d+)*")
# The GIC hotline may always be mentioned.
_ALWAYS_OK = {"1919"}


def record_facts(p: Procedure, lang: Lang) -> dict[str, Any]:
    """The complete set of facts the model is allowed to talk about."""
    return {
        "procedure": p.name.get(lang),
        "summary": p.summary.get(lang),
        "office": office_label(p.office_type, lang),
        "office_flow": p.office_flow.get(lang),
        "fee": p.fee.label(lang),
        "fee_details": p.fee.text.get(lang),
        "is_free": p.fee.is_free,
        "processing_time": p.processing_time.label(lang),
        "processing_time_details": p.processing_time.text.get(lang),
        "documents": [
            d.name.get(lang) + (f" ({d.conditional.get(lang)})" if d.conditional else "")
            for d in p.required_documents
        ],
        "eligibility": p.eligibility.get(lang) if p.eligibility else None,
        "steps": [s.get(lang) for s in p.steps],
        "form_codes": list(p.form_ids),
        "sample_data": p.verification.demo_data,
        "hotline": "1919",
    }


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in _NUM.findall(text)}


def _facts_text(facts: dict[str, Any]) -> str:
    parts: list[str] = []
    for v in facts.values():
        if isinstance(v, list):
            parts.extend(str(x) for x in v)
        elif v is not None:
            parts.append(str(v))
    return " ".join(parts)


@dataclass(frozen=True, slots=True)
class GroundingResult:
    ok: bool
    unsupported: tuple[str, ...]


def check_grounding(
    answer: str, facts: dict[str, Any], *, other_procedure_names: list[str]
) -> GroundingResult:
    facts_text = _facts_text(facts)
    counts = {str(len(facts.get("documents") or [])), str(len(facts.get("steps") or []))}
    allowed = _numbers(facts_text) | _ALWAYS_OK | counts
    unsupported = sorted(_numbers(answer) - allowed)
    lowered, facts_lower = answer.lower(), facts_text.lower()
    # Another procedure's name is a leak unless this record itself mentions it
    # (e.g. an NIC application legitimately lists a birth certificate).
    leaked = [n for n in other_procedure_names if n and n.lower() in lowered and n.lower() not in facts_lower]
    return GroundingResult(ok=not unsupported and not leaked, unsupported=tuple(unsupported + leaked))


_TEMPLATES: dict[Lang, str] = {
    Lang.EN: (
        "You can get the {procedure} through the {office}. "
        "Fee: {fee}. Usually takes {time}. Bring {n} document(s); see your checklist."
    ),
    Lang.SI: (
        "{procedure} {office} හරහා ලබා ගත හැක. "
        "ගාස්තුව: {fee}. සාමාන්‍යයෙන් {time}. ලේඛන {n}ක් රැගෙන යන්න; ඔබේ ලැයිස්තුව බලන්න."
    ),
    Lang.TA: (
        "{procedure} {office} மூலம் பெறலாம். "
        "கட்டணம்: {fee}. பொதுவாக {time}. {n} ஆவணங்களைக் கொண்டு செல்லுங்கள்; உங்கள் பட்டியலைப் பாருங்கள்."
    ),
}


def template_answer(p: Procedure, lang: Lang) -> str:
    """A fully grounded answer written only from record fields."""
    return _TEMPLATES[lang].format(
        procedure=p.name.get(lang),
        office=office_label(p.office_type, lang),
        fee=p.fee.label(lang),
        time=p.processing_time.label(lang),
        n=len(p.required_documents),
    )
