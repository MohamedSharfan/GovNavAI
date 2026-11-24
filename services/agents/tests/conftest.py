"""Shared fixtures: a small, synthetic knowledge base (independent of seed data)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from govnav_agents.agents.deps import Deps, build_deps
from govnav_agents.kb.repository import LocalKnowledgeBase
from govnav_agents.settings import Settings


def _lt(en: str, si: str, ta: str) -> dict[str, str]:
    return {"en": en, "si": si, "ta": ta}


def _procedure(pid: str, **over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": pid,
        "category": "welfare-certificates",
        "name": _lt("Income certificate", "ආදායම් සහතිකය", "வருமானச் சான்றிதழ்"),
        "summary": _lt(
            "Certifies household income, e.g. for scholarships.",
            "ශිෂ්‍යත්ව වැනි දේ සඳහා පවුලේ ආදායම සහතික කරයි.",
            "புலமைப்பரிசில் போன்றவற்றுக்கு குடும்ப வருமானத்தை உறுதிப்படுத்துகிறது.",
        ),
        "synonyms": ["income certificate", "adayam sahathikaya", "varumana saanrithal", "mahapola"],
        "exampleQuestions": {
            "en": ["I need an income certificate for my daughter's scholarship"],
            "si": ["මට ආදායම් සහතිකයක් අවශ්‍යයි"],
            "ta": ["எனக்கு வருமானச் சான்றிதழ் வேண்டும்"],
            "singlish": ["mata income certificate ekak ona"],
            "tanglish": ["enakku varumana saanrithal venum"],
        },
        "officeType": "DS",
        "officeFlow": _lt(
            "The Grama Niladhari recommends, then the Divisional Secretariat issues it.",
            "ග්‍රාම නිලධාරී නිර්දේශ කරයි, පසුව ප්‍රාදේශීය ලේකම් කාර්යාලය නිකුත් කරයි.",
            "கிராம அலுவலர் பரிந்துரைக்கிறார், பின்னர் பிரதேச செயலகம் வழங்குகிறது.",
        ),
        "fee": {"amountLkr": None, "isFree": True, "text": _lt("Free", "නොමිලේ", "இலவசம்")},
        "processingTime": {
            "minDays": 1,
            "maxDays": 3,
            "text": _lt("1 to 3 working days", "වැඩ කරන දින 1 සිට 3 දක්වා", "1 முதல் 3 வேலை நாட்கள்"),
        },
        "requiredDocuments": [
            {"id": "nic-copy", "name": _lt("NIC copy", "හැඳුනුම්පත් පිටපත", "அடையாள அட்டை நகல்")},
            {
                "id": "application",
                "name": _lt("Application form", "අයදුම්පත", "விண்ணப்பப் படிவம்"),
                "aiCanPrefill": True,
                "formId": "ds-income-application",
            },
        ],
        "steps": [_lt("Visit the GN", "ග්‍රාම නිලධාරී හමුවන්න", "கிராம அலுவலரைச் சந்திக்கவும்")],
        "formIds": ["ds-income-application"],
        "sources": [
            {
                "id": "test-source",
                "title": "Test circular",
                "url": "https://example.gov.lk/x",
                "kind": "website",
                "retrievedAt": "2026-11-24",
            }
        ],
        "fieldSources": {"fee": ["test-source"]},
        "verification": {
            "status": "approved",
            "sourceRef": "test-source",
            "verifiedBy": "Test Officer",
            "verifiedAt": "2026-11-24",
            "demoData": True,
        },
    }
    base.update(over)
    return base


@pytest.fixture(scope="session")
def data_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("data")
    (root / "procedures").mkdir()
    procedures = [
        _procedure("income-certificate"),
        _procedure(
            "birth-certificate-copy",
            category="civil-registration",
            name=_lt("Birth certificate copy", "උප්පැන්න සහතික පිටපත", "பிறப்புச் சான்றிதழ் பிரதி"),
            summary=_lt(
                "A certified copy of a birth registration.",
                "උප්පැන්න ලියාපදිංචියේ සහතික පිටපතක්.",
                "பிறப்புப் பதிவின் சான்றளிக்கப்பட்ட பிரதி.",
            ),
            synonyms=["birth certificate", "uppanna sahathikaya", "pirappu saanrithal"],
            exampleQuestions={
                "en": ["How do I get a copy of my birth certificate?"],
                "si": ["උප්පැන්න සහතිකයේ පිටපතක් ගන්නේ කොහොමද?"],
                "ta": ["பிறப்புச் சான்றிதழ் பிரதி எப்படிப் பெறுவது?"],
                "singlish": ["uppanna sahathikaye copy ekak ganna ona"],
                "tanglish": ["pirappu saanrithal copy venum"],
            },
            officeType="RGD",
            fee={"amountLkr": 120, "isFree": False, "text": _lt("Rs 120", "රු. 120", "ரூ. 120")},
            formIds=[],
            requiredDocuments=[
                {"id": "details", "name": _lt("Birth details", "උප්පැන්න විස්තර", "பிறப்பு விவரங்கள்")}
            ],
        ),
    ]
    for p in procedures:
        (root / "procedures" / f"{p['id']}.json").write_text(
            json.dumps(p, ensure_ascii=False), encoding="utf-8"
        )
    return root


@pytest.fixture(scope="session")
def kb(data_dir: Path) -> LocalKnowledgeBase:
    return LocalKnowledgeBase(data_dir)


@pytest.fixture(scope="session")
def deps(kb: LocalKnowledgeBase) -> Deps:
    settings = Settings(GOVNAV_LLM_MODE="offline", GEMINI_API_KEY=None, GOVNAV_RETRIEVAL_THRESHOLD=0.45)
    return build_deps(settings, kb)
