"""The GovNavAI ADK agent tree.

``govnav_root`` (custom BaseAgent) owns the control flow, so that every LLM step
sits between deterministic gates::

    retrieve ─▶ router_agent ─▶ GATE ─┬─▶ info_agent ─▶ grounding guard ─▶ answer card
                                      ├─▶ greeting
                                      └─▶ honest decline (logged as a knowledge-base gap)

Later milestones add checklist_agent, form_locator_agent, form_fill_agent and
office_agent as further delegates on the same pattern.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from typing import Any, ClassVar

from google.adk.agents import BaseAgent, LlmAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.events import Event, EventActions
from google.adk.models.base_llm import BaseLlm
from google.genai import types
from pydantic import ConfigDict, ValidationError

from govnav_agents.agents import prompts
from govnav_agents.agents.deps import Deps
from govnav_agents.agents.facts import check_grounding, record_facts, template_answer
from govnav_agents.agents.labels import DECLINE_TEXT, GREETING_TEXT, office_label
from govnav_agents.agents.offline_handlers import offline_info, offline_route
from govnav_agents.llm.models import MODELS
from govnav_agents.llm.offline import OfflineLlm
from govnav_agents.schemas import (
    AnswerCard,
    Candidate,
    DeclineCard,
    FactCard,
    GreetingCard,
    InfoAnswer,
    InputVariety,
    Intent,
    RouteDecision,
    SourceChip,
    TraceStep,
)
from govnav_agents.sl.formats import redact
from govnav_agents.sl.language import detect_language

log = logging.getLogger(__name__)

# Session-state keys. "turn:*" keys are overwritten every turn; the API reads the
# card/trace/meta from the final event's state delta. Sessions live in memory only.
S_QUERY = "turn:query"
S_CANDIDATES = "turn:candidates"
S_CURRENT = "current_procedure"
S_ROUTE = "turn:route"
S_INFO = "turn:info"
S_FACTS = "turn:facts"
S_CARD = "turn:card"
S_TRACE = "turn:trace"
S_META = "turn:meta"


def _model(deps: Deps, model_id: str, handler: Any) -> str | BaseLlm:
    if deps.mode == "gemini":
        return model_id
    return OfflineLlm(model=f"offline-{handler.__name__}", handler=handler)


def _router_instruction(ctx: ReadonlyContext) -> str:
    return prompts.router_instruction(ctx.state.get(S_CANDIDATES, []), ctx.state.get(S_CURRENT))


def _info_instruction(ctx: ReadonlyContext) -> str:
    payload = ctx.state.get(S_FACTS) or {}
    return prompts.info_instruction(
        payload.get("facts", {}),
        payload.get("lang", "en"),
        payload.get("intent", "procedure_info"),
        ctx.state.get(S_QUERY, ""),
    )


def build_router_agent(deps: Deps) -> LlmAgent:
    return LlmAgent(
        name="router_agent",
        description="Detects language/variety and intent, and picks a procedure from retrieved candidates.",
        model=_model(deps, MODELS.flash, offline_route),
        instruction=_router_instruction,
        output_schema=RouteDecision,
        output_key=S_ROUTE,
        generate_content_config=types.GenerateContentConfig(temperature=0.0),
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )


def build_info_agent(deps: Deps) -> LlmAgent:
    return LlmAgent(
        name="info_agent",
        description="Explains one verified procedure in plain language, using only record fields.",
        model=_model(deps, MODELS.flash, offline_info),
        instruction=_info_instruction,
        include_contents="none",  # sees only the record + question, never other turns
        output_schema=InfoAnswer,
        output_key=S_INFO,
        generate_content_config=types.GenerateContentConfig(temperature=0.3),
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )


class GovNavRoot(BaseAgent):
    """Root orchestrator: retrieval → router → gates → specialist agent → guard."""

    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)

    deps: Deps
    router_agent: LlmAgent
    info_agent: LlmAgent

    def __init__(self, deps: Deps) -> None:
        router = build_router_agent(deps)
        info = build_info_agent(deps)
        super().__init__(  # type: ignore[call-arg]  # pydantic fields declared above
            name="govnav_root",
            description="GovNavAI root agent",
            deps=deps,
            router_agent=router,
            info_agent=info,
            sub_agents=[router, info],
        )

    # -- helpers -----------------------------------------------------------------
    def _event(self, ctx: InvocationContext, delta: dict[str, Any]) -> Event:
        return Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            actions=EventActions(state_delta=delta),
        )

    @staticmethod
    def _user_text(ctx: InvocationContext) -> str:
        content = ctx.user_content
        if not content or not content.parts:
            return ""
        return "".join(p.text or "" for p in content.parts).strip()

    # -- main flow ---------------------------------------------------------------
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        t_start = time.perf_counter()
        trace: list[dict[str, Any]] = []
        query = self._user_text(ctx)
        state = ctx.session.state
        current = state.get(S_CURRENT)
        deps = self.deps
        lang_guess = detect_language(query)

        # 1. Retrieval (deterministic)
        result = deps.retriever.search(query, k=5)
        candidates: list[dict[str, Any]] = [
            {
                "id": h.procedure_id,
                "name": (
                    p.name.get(lang_guess.language)
                    if (p := deps.kb.get_procedure(h.procedure_id))
                    else h.procedure_id
                ),
                "confidence": h.confidence,
            }
            for h in result.hits
        ]
        if current and all(c["id"] != current for c in candidates) and (cp := deps.kb.get_procedure(current)):
            candidates.append({"id": current, "name": cp.name.get(lang_guess.language), "confidence": 0.0})
        trace.append(
            TraceStep(
                agent="retriever",
                label="RETRIEVE",
                ms=result.latency_ms,
                detail=f"{result.embedder}; top={candidates[0]['id'] if candidates else '-'}"
                f" ({candidates[0]['confidence']:.2f})"
                if candidates
                else result.embedder,
            ).model_dump(by_alias=True)
        )
        # Reset per-turn outputs so a failed step can never reuse last turn's result.
        yield self._event(
            ctx, {S_QUERY: query, S_CANDIDATES: candidates, S_ROUTE: None, S_INFO: None, S_FACTS: None}
        )

        # 2. router_agent (LLM, structured output)
        t0 = time.perf_counter()
        try:
            async for ev in self.router_agent.run_async(ctx):
                yield ev
        except Exception as exc:  # model/schema failure -> falls through to a safe decline
            log.warning("router_agent failed: %s", type(exc).__name__)
        try:
            route = RouteDecision.model_validate(ctx.session.state.get(S_ROUTE) or {})
        except ValidationError as exc:
            log.warning("router output failed validation: %s", redact(str(exc))[:300])
            route = RouteDecision(
                intent=Intent.OUT_OF_SCOPE,
                procedure_id=None,
                language=lang_guess.language,
                input_variety=lang_guess.variety,
                confidence=0.0,
                reason="invalid router output",
            )
        trace.append(
            TraceStep(
                agent="router_agent",
                label="ROUTER",
                ms=int((time.perf_counter() - t0) * 1000),
                detail=(
                    f"{route.intent.value} · {route.procedure_id or '-'} · "
                    f"{route.language.value}/{route.input_variety.value}"
                ),
            ).model_dump(by_alias=True)
        )
        lang = route.language

        # 3. Deterministic gate
        cand_by_id = {c["id"]: c for c in candidates}
        threshold = deps.settings.retrieval_threshold
        chosen = route.procedure_id if route.procedure_id in cand_by_id else None
        retrieval_conf = float(cand_by_id[chosen]["confidence"]) if chosen else 0.0
        is_follow_up = chosen is not None and chosen == current
        card: AnswerCard | DeclineCard | GreetingCard
        intent = route.intent

        if intent is Intent.GREETING:
            card = GreetingCard(text=GREETING_TEXT.get(lang))
        elif (
            intent is Intent.OUT_OF_SCOPE
            or chosen is None
            or (retrieval_conf < threshold and not is_follow_up)
            or route.confidence < 0.35
        ):
            reason = "out_of_scope" if intent is Intent.OUT_OF_SCOPE else "low_confidence"
            intent = Intent.OUT_OF_SCOPE
            suggestions = [
                Candidate(procedure_id=c["id"], name=c["name"], score=c["confidence"])
                for c in candidates[:3]
                if c["confidence"] >= threshold * 0.6
            ]
            card = DeclineCard(text=DECLINE_TEXT.get(lang), reason=reason, suggestions=suggestions)
            trace.append(
                TraceStep(
                    agent="gate",
                    label="DECLINE",
                    ms=0,
                    detail=(
                        f"{reason}: retrieval={retrieval_conf:.2f} "
                        f"router={route.confidence:.2f} threshold={threshold:.2f}"
                    ),
                ).model_dump(by_alias=True)
            )
        else:
            procedure = deps.kb.get_procedure(chosen)
            assert procedure is not None
            facts = record_facts(procedure, lang)
            yield self._event(
                ctx,
                {S_FACTS: {"facts": facts, "lang": lang.value, "intent": intent.value}, S_CURRENT: chosen},
            )

            # 4. info_agent (LLM, writes only from the record)
            t0 = time.perf_counter()
            try:
                async for ev in self.info_agent.run_async(ctx):
                    yield ev
            except Exception as exc:  # model/schema failure -> verified template below
                log.warning("info_agent failed: %s", type(exc).__name__)
            try:
                info = InfoAnswer.model_validate(ctx.session.state.get(S_INFO) or {})
                text = info.text
            except ValidationError:
                text = ""
            other_names = [p.name.get(lang) for p in deps.kb.procedures() if p.id != procedure.id]
            grounding = check_grounding(text, facts, other_procedure_names=other_names) if text else None
            grounded = bool(grounding and grounding.ok)
            if not grounded:
                log.warning(
                    "grounding guard replaced info_agent text (unsupported=%s)",
                    grounding.unsupported if grounding else "empty",
                )
                text = template_answer(procedure, lang)
            trace.append(
                TraceStep(
                    agent="info_agent",
                    label="INFO AGENT",
                    ms=int((time.perf_counter() - t0) * 1000),
                    detail="grounded" if grounded else "replaced by verified template",
                ).model_dump(by_alias=True)
            )
            src = procedure.primary_source
            card = AnswerCard(
                procedure_id=procedure.id,
                procedure_name=procedure.name.get(lang),
                text=text,
                facts=FactCard(
                    office=office_label(procedure.office_type, lang),
                    fee=procedure.fee.text.get(lang),
                    time=procedure.processing_time.text.get(lang),
                    is_free=procedure.fee.is_free,
                ),
                source=SourceChip(
                    title=src.title,
                    url=src.url,
                    verified_at=procedure.verification.verified_at,
                    verified_by=procedure.verification.verified_by,
                    demo_data=procedure.verification.demo_data,
                ),
                document_count=len(procedure.required_documents),
                has_form=bool(procedure.form_ids),
                grounded=grounded,
            )

        meta = {
            "language": lang.value,
            "inputVariety": route.input_variety.value if route.input_variety else InputVariety.EN.value,
            "intent": intent.value,
            "latencyMs": int((time.perf_counter() - t_start) * 1000),
            "topCandidate": candidates[0] if candidates else None,
            "routerConfidence": route.confidence,
            "purpose": route.purpose,
        }
        yield self._event(
            ctx,
            {
                S_CARD: card.model_dump(by_alias=True, mode="json"),
                S_TRACE: trace,
                S_META: meta,
            },
        )
        log.info(
            "ask lang=%s variety=%s intent=%s procedure=%s conf=%.2f latency=%dms",
            meta["language"],
            meta["inputVariety"],
            meta["intent"],
            getattr(card, "procedure_id", None),
            route.confidence,
            meta["latencyMs"],
        )
