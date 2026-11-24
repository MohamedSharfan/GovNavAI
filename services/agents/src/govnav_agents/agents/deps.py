"""Process-wide dependencies shared by agents and tools (built once at start-up)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from govnav_agents.kb.repository import LocalKnowledgeBase
from govnav_agents.llm.models import MODELS
from govnav_agents.paths import INDEX_DIR
from govnav_agents.profile.extract import Extractor, gemini_extractor
from govnav_agents.retrieval.embeddings import CachedEmbedder, Embedder, GeminiEmbedder, NgramEmbedder
from govnav_agents.retrieval.hybrid import HybridRetriever
from govnav_agents.settings import Settings, get_settings

log = logging.getLogger(__name__)


@dataclass(slots=True)
class Deps:
    settings: Settings
    kb: LocalKnowledgeBase
    retriever: HybridRetriever
    mode: Literal["gemini", "offline"]
    vision: Extractor | None = None


def build_deps(settings: Settings | None = None, kb: LocalKnowledgeBase | None = None) -> Deps:
    settings = settings or get_settings()
    kb = kb or LocalKnowledgeBase()
    mode = settings.effective_llm_mode
    embedder: Embedder
    if mode == "gemini" and settings.gemini_api_key:
        embedder = CachedEmbedder(
            GeminiEmbedder(settings.gemini_api_key, MODELS.embedding, MODELS.embedding_dim), INDEX_DIR
        )
    else:
        embedder = NgramEmbedder()
    retriever = HybridRetriever(kb.procedures(), embedder)
    log.info("deps ready: mode=%s procedures=%d embedder=%s", mode, len(kb.procedures()), embedder.model_id)
    vision = (
        gemini_extractor(settings.gemini_api_key, MODELS.flash)
        if mode == "gemini" and settings.gemini_api_key
        else None
    )
    return Deps(settings=settings, kb=kb, retriever=retriever, mode=mode, vision=vision)


@lru_cache(maxsize=1)
def get_deps() -> Deps:
    return build_deps()
