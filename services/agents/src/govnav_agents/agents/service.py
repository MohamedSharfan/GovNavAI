"""Runs the ADK agent tree for one citizen turn and maps it to the API response."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from govnav_agents.agents.deps import Deps
from govnav_agents.agents.root import S_CARD, S_CURRENT, S_META, S_TRACE, GovNavRoot
from govnav_agents.schemas import AskRequest, AskResponse

log = logging.getLogger(__name__)
APP_NAME = "agents"  # ADK infers the app name from the agent package directory
USER_ID = "citizen"  # citizens are anonymous; sessions are in-memory and expire with the process


class AskService:
    def __init__(self, deps: Deps) -> None:
        self.deps = deps
        self.root = GovNavRoot(deps)
        self.sessions = InMemorySessionService()
        self.runner = Runner(app_name=APP_NAME, agent=self.root, session_service=self.sessions)

    async def _session_id(self, requested: str | None, procedure_context: str | None) -> str:
        if requested:
            existing = await self.sessions.get_session(
                app_name=APP_NAME, user_id=USER_ID, session_id=requested
            )
            if existing is not None:
                return requested
        session = await self.sessions.create_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=requested or uuid.uuid4().hex,
            state={S_CURRENT: procedure_context} if procedure_context else {},
        )
        return session.id

    async def ask(self, req: AskRequest) -> AskResponse:
        session_id = await self._session_id(req.session_id, req.procedure_context)
        delta: dict[str, Any] = {}
        if req.procedure_context:
            delta[S_CURRENT] = req.procedure_context
        final: dict[str, Any] = {}
        async for event in self.runner.run_async(
            user_id=USER_ID,
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=req.message)]),
            state_delta=delta or None,
        ):
            sd = event.actions.state_delta if event.actions else None
            if sd and S_CARD in sd:
                final = dict(sd)
        if not final:
            raise RuntimeError("agent run produced no card")
        meta = final[S_META]
        return AskResponse.model_validate(
            {
                "sessionId": session_id,
                "language": meta["language"],
                "inputVariety": meta["inputVariety"],
                "intent": meta["intent"],
                "card": final[S_CARD],
                "trace": final[S_TRACE],
                "mode": self.deps.mode,
                "latencyMs": meta["latencyMs"],
            }
        )
