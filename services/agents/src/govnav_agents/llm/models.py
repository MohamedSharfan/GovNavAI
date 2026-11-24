"""The ONE place model IDs are configured.

Confirmed against the Gemini API model list on 2026-11-24 (re-check with
``uv run python -m govnav_agents.scripts.list_models`` once a key is available).
Each ID can be overridden with an environment variable for quick swaps.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ModelConfig:
    flash: str
    """Routing, plain-language replies, document-to-profile, purpose wording."""
    pro: str
    """Form Studio field detection, procedure drafting from circulars."""
    embedding: str
    """Retrieval over the verified knowledge base."""
    embedding_dim: int
    live: str
    """Real-time voice (Gemini Live API)."""
    tts: str
    """Read-aloud."""


MODELS = ModelConfig(
    flash=os.environ.get("GOVNAV_MODEL_FLASH", "gemini-3.8-flash"),
    pro=os.environ.get("GOVNAV_MODEL_PRO", "gemini-3.1-pro-preview"),
    embedding=os.environ.get("GOVNAV_MODEL_EMBEDDING", "gemini-embedding-001"),
    embedding_dim=int(os.environ.get("GOVNAV_EMBEDDING_DIM", "768")),
    live=os.environ.get("GOVNAV_MODEL_LIVE", "gemini-live-2.5-flash-preview"),
    tts=os.environ.get("GOVNAV_MODEL_TTS", "gemini-2.5-flash-preview-tts"),
)
