"""A deterministic ADK model so the real agent tree runs without a Gemini key.

``OfflineLlm`` is a :class:`google.adk.models.BaseLlm`. Each agent gets an instance
with a *handler* that turns the request (system instruction + conversation) into
the JSON its ``output_schema`` expects. The routing handler trusts retrieval rank
and keyword cues; the info handler writes the record template. Offline mode is
therefore always grounded. It is the floor the Gemini path is measured against in
``evals/REPORT.md``.
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator, Callable
from typing import Any, ClassVar

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import ConfigDict, Field

Handler = Callable[[str, str], dict[str, Any]]
"""(system_instruction, last_user_text) -> JSON-serialisable output."""

PAYLOAD_RE = re.compile(r"<payload>\s*(\{.*?\})\s*</payload>", re.S)


def extract_payload(instruction: str) -> dict[str, Any]:
    """Read the JSON block that prompt builders embed between <payload> tags."""
    m = PAYLOAD_RE.search(instruction)
    if not m:
        return {}
    data: dict[str, Any] = json.loads(m.group(1))
    return data


def _text_of(content: types.Content | None) -> str:
    if not content or not content.parts:
        return ""
    return "".join(p.text or "" for p in content.parts)


class OfflineLlm(BaseLlm):
    """Deterministic stand-in for Gemini, driven by a per-agent handler."""

    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)
    model: str = "offline-deterministic"
    handler: Handler = Field(exclude=True)

    @classmethod
    def supported_models(cls) -> list[str]:
        return [r"offline-.*"]

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        system = llm_request.config.system_instruction if llm_request.config else None
        system_text = _text_of(system) if isinstance(system, types.Content) else str(system or "")
        user_text = ""
        for content in reversed(llm_request.contents):
            if content.role == "user" and _text_of(content).strip():
                user_text = _text_of(content)
                break
        output = self.handler(system_text, user_text)
        yield LlmResponse(
            content=types.Content(
                role="model", parts=[types.Part(text=json.dumps(output, ensure_ascii=False))]
            ),
            turn_complete=True,
        )
