"""End-to-end through the real ADK agent tree, driven by the deterministic OfflineLlm."""

from __future__ import annotations

import pytest

from govnav_agents.agents.deps import Deps
from govnav_agents.agents.facts import check_grounding, record_facts
from govnav_agents.agents.service import AskService
from govnav_agents.schemas import AskRequest, Lang


@pytest.fixture
def service(deps: Deps) -> AskService:
    return AskService(deps)


@pytest.mark.parametrize(
    ("message", "lang", "variety"),
    [
        ("I need an income certificate for my daughter's scholarship", "en", "en"),
        ("මට ආදායම් සහතිකයක් අවශ්‍යයි", "si", "si"),
        ("எனக்கு வருமானச் சான்றிதழ் வேண்டும்", "ta", "ta"),
        ("mata income certificate ekak ona duwage scholarship ekata", "si", "singlish"),
        ("enakku varumana saanrithal venum", "ta", "tanglish"),
    ],
)
async def test_income_certificate_in_every_variety(
    service: AskService, message: str, lang: str, variety: str
) -> None:
    resp = await service.ask(AskRequest(message=message))
    assert resp.card.kind == "answer", resp.trace
    assert resp.card.procedure_id == "income-certificate"
    assert resp.language.value == lang
    assert resp.input_variety.value == variety
    assert resp.card.grounded
    assert resp.card.source.demo_data is True
    assert [t.label for t in resp.trace][:2] == ["RETRIEVE", "ROUTER"]
    assert resp.mode == "offline"


async def test_out_of_scope_declines_with_hotline(service: AskService) -> None:
    resp = await service.ask(AskRequest(message="How do I apply for a Schengen visa to Germany?"))
    assert resp.card.kind == "decline"
    assert resp.card.hotline == "1919"
    assert any(t.label == "DECLINE" for t in resp.trace)


async def test_greeting(service: AskService) -> None:
    resp = await service.ask(AskRequest(message="ආයුබෝවන්"))
    assert resp.card.kind == "greeting"
    assert resp.language is Lang.SI


async def test_follow_up_keeps_procedure_in_session(service: AskService) -> None:
    first = await service.ask(AskRequest(message="I need a birth certificate copy"))
    assert first.card.kind == "answer"
    follow = await service.ask(AskRequest(message="what is the fee?", sessionId=first.session_id))
    assert follow.card.kind == "answer"
    assert follow.card.procedure_id == "birth-certificate-copy"
    assert follow.card.facts.fee == "Rs 120"


def test_grounding_guard_rejects_invented_numbers(deps: Deps) -> None:
    p = deps.kb.get_procedure("birth-certificate-copy")
    assert p is not None
    facts = record_facts(p, Lang.EN)
    ok = check_grounding("The fee is Rs 120.", facts, other_procedure_names=[])
    bad = check_grounding("The fee is Rs 500 and takes 14 days.", facts, other_procedure_names=[])
    assert ok.ok
    assert not bad.ok
    assert set(bad.unsupported) == {"500", "14"}
