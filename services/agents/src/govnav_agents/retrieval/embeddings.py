"""Embedding back-ends with an idempotent, versioned on-disk cache.

* :class:`GeminiEmbedder` calls the Gemini embeddings API (model id from
  :mod:`govnav_agents.llm.models`), using RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY task types.
* :class:`NgramEmbedder` is a deterministic, dependency-free fallback (hashed
  character n-gram TF vectors). It is used offline and in CI so the dense half of
  hybrid retrieval always exists.

Cache keys combine the model id, dimension and a SHA-256 of the text. Rebuilding
the index re-embeds only text that changed, and switching models never mixes vectors.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Literal, Protocol

import numpy as np
from numpy.typing import NDArray

from govnav_agents.retrieval.text import tokens

log = logging.getLogger(__name__)
Vec = NDArray[np.float32]
TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


class Embedder(Protocol):
    @property
    def model_id(self) -> str: ...
    @property
    def dim(self) -> int: ...
    def embed(self, texts: list[str], task: TaskType) -> Vec: ...


def _l2(m: Vec) -> Vec:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    out: Vec = (m / norms).astype(np.float32)
    return out


class NgramEmbedder:
    """Hashed character n-gram embedding: offline, deterministic, script-agnostic."""

    def __init__(self, dim: int = 2048) -> None:
        self._dim = dim

    @property
    def model_id(self) -> str:
        return f"ngram-hash-v1-{self._dim}"

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: list[str], task: TaskType) -> Vec:
        out = np.zeros((len(texts), self._dim), dtype=np.float32)
        for row, text in enumerate(texts):
            for tok in tokens(text):
                h = int.from_bytes(hashlib.blake2b(tok.encode(), digest_size=8).digest(), "little")
                weight = 2.0 if tok.startswith("w:") else 1.0
                out[row, h % self._dim] += weight
        return _l2(out)


class GeminiEmbedder:
    """Gemini embeddings via the Google Gen AI SDK."""

    def __init__(self, api_key: str, model_id: str, dim: int, batch_size: int = 64) -> None:
        from google import genai  # imported lazily so offline mode needs no network

        self._client = genai.Client(api_key=api_key)
        self._model = model_id
        self._dim = dim
        self._batch = batch_size

    @property
    def model_id(self) -> str:
        return self._model

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: list[str], task: TaskType) -> Vec:
        from google.genai import types

        vectors: list[list[float]] = []
        for i in range(0, len(texts), self._batch):
            batch = texts[i : i + self._batch]
            resp = self._client.models.embed_content(
                model=self._model,
                contents=batch,
                config=types.EmbedContentConfig(task_type=task, output_dimensionality=self._dim),
            )
            for emb in resp.embeddings or []:
                vectors.append(list(emb.values or []))
        if len(vectors) != len(texts):
            raise RuntimeError(f"embedding count mismatch: {len(vectors)} != {len(texts)}")
        return _l2(np.asarray(vectors, dtype=np.float32))


class CachedEmbedder:
    """Wraps an embedder with a per-model JSON-lines cache on disk (knowledge-base text only)."""

    def __init__(self, inner: Embedder, cache_dir: Path) -> None:
        self.inner = inner
        cache_dir.mkdir(parents=True, exist_ok=True)
        safe = inner.model_id.replace("/", "_")
        self._path = cache_dir / f"emb-{safe}-{inner.dim}.jsonl"
        self._cache: dict[str, list[float]] = {}
        if self._path.exists():
            for line in self._path.read_text(encoding="utf-8").splitlines():
                rec = json.loads(line)
                self._cache[rec["k"]] = rec["v"]

    @property
    def model_id(self) -> str:
        return self.inner.model_id

    @property
    def dim(self) -> int:
        return self.inner.dim

    @staticmethod
    def _key(text: str, task: TaskType) -> str:
        return hashlib.sha256(f"{task}\x00{text}".encode()).hexdigest()

    def embed(self, texts: list[str], task: TaskType) -> Vec:
        if task == "RETRIEVAL_QUERY":
            # Citizen queries may contain personal data (PDPA): never persist them.
            return self.inner.embed(texts, task)
        keys = [self._key(t, task) for t in texts]
        missing = [(k, t) for k, t in zip(keys, texts, strict=True) if k not in self._cache]
        if missing:
            log.info("embedding %d new texts with %s", len(missing), self.model_id)
            vecs = self.inner.embed([t for _, t in missing], task)
            with self._path.open("a", encoding="utf-8") as fh:
                for (k, _), v in zip(missing, vecs, strict=True):
                    self._cache[k] = v.tolist()
                    fh.write(json.dumps({"k": k, "v": self._cache[k]}) + "\n")
        return np.asarray([self._cache[k] for k in keys], dtype=np.float32)
