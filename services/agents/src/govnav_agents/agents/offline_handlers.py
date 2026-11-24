"""Deterministic handlers for :class:`~govnav_agents.llm.offline.OfflineLlm`."""

from __future__ import annotations

import re
from typing import Any

from govnav_agents.llm.offline import extract_payload
from govnav_agents.sl.language import detect_language

_INTENT_CUES: dict[str, tuple[str, ...]] = {
    "checklist": (
        "document",
        "documents",
        "bring",
        "lekhana",
        "lekana",
        "ලේඛන",
        "ලියකියවිලි",
        "ஆவண",
        "aavanam",
        "avanangal",
        "checklist",
    ),
    "form": ("form", "forms", "pooraya", "poramaya", "පෝරම", "படிவ", "padivam", "fill"),
    "office": (
        "where",
        "office",
        "kantoruwa",
        "kaaryalaya",
        "කාර්යාල",
        "කොහෙද",
        "kohe",
        "kohed",
        "அலுவலக",
        "enge",
        "engae",
        "hours",
        "open",
    ),
}
_GREETING = re.compile(
    r"^\s*(hi|hello|hey|thanks?|thank you|ayubowan|ආයුබෝවන්|ස්තූතියි|vanakkam|வணக்கம்|நன்றி)\W*$",
    re.I,
)


def offline_route(system: str, user: str) -> dict[str, Any]:
    payload = extract_payload(system)
    candidates: list[dict[str, Any]] = payload.get("candidates", [])
    current = payload.get("current_procedure")
    guess = detect_language(user)
    base = {"language": guess.language.value, "inputVariety": guess.variety.value, "purpose": None}

    if _GREETING.match(user):
        return {**base, "intent": "greeting", "procedureId": None, "confidence": 0.95, "reason": "greeting"}

    lowered = user.lower()
    intent = "procedure_info"
    for name, cues in _INTENT_CUES.items():
        if any(c in lowered for c in cues):
            intent = name
            break

    if not candidates:
        return {
            **base,
            "intent": "out_of_scope",
            "procedureId": None,
            "confidence": 0.0,
            "reason": "no candidates",
        }
    top = candidates[0]
    # A short follow-up ("what's the fee?") keeps the procedure already in view.
    if current and top["confidence"] < 0.45 and len(lowered.split()) <= 6:
        chosen = next((c for c in candidates if c["id"] == current), None)
        if chosen:
            return {
                **base,
                "intent": intent,
                "procedureId": current,
                "confidence": 0.6,
                "reason": "follow-up on current procedure",
            }
    return {
        **base,
        "intent": intent,
        "procedureId": top["id"],
        "confidence": float(top["confidence"]),
        "reason": f"top retrieval candidate ({top['confidence']:.2f})",
    }


_TEMPLATES = {
    "en": "You can get the {procedure} through the {office}. {flow} Fee: {fee}. Usually takes {time}.",
    "si": "{procedure} {office} හරහා ලබා ගත හැක. {flow} ගාස්තුව: {fee}. සාමාන්‍යයෙන් {time}.",
    "ta": "{procedure} {office} மூலம் பெறலாம். {flow} கட்டணம்: {fee}. பொதுவாக {time}.",
}
_SAMPLE_NOTE = {
    "en": " These details are sample data; please confirm with the office.",
    "si": " මෙම තොරතුරු නියැදි දත්ත වේ; කරුණාකර කාර්යාලයෙන් තහවුරු කරගන්න.",
    "ta": " இவை மாதிரித் தரவுகள்; அலுவலகத்தில் உறுதிப்படுத்துங்கள்.",
}
_FOLLOW_UP = {
    "en": "Shall I find and fill the official form for you?",
    "si": "මම ඔබ වෙනුවෙන් නිල පෝරමය සොයා පුරවන්නද?",
    "ta": "அதிகாரப்பூர்வ படிவத்தைக் கண்டுபிடித்து நிரப்பட்டுமா?",
}


def offline_info(system: str, user: str) -> dict[str, Any]:
    payload = extract_payload(system)
    facts: dict[str, Any] = payload["facts"]
    lang = payload.get("lang", "en")
    text = _TEMPLATES[lang].format(
        procedure=facts["procedure"],
        office=facts["office"],
        flow=facts["office_flow"],
        fee=facts["fee"],
        time=facts["processing_time"],
    )
    if facts.get("sample_data"):
        text += _SAMPLE_NOTE[lang]
    return {"text": text, "followUp": _FOLLOW_UP[lang] if facts.get("form_codes") else None}
