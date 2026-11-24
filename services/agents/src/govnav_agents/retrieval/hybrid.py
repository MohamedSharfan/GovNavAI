"""Hybrid retrieval over the verified knowledge base.

Pipeline (see docs/DECISIONS.md D-006)::

    query ─┬─ dense: embed(query) · views  → max per procedure ─┐
           └─ lexical: BM25(tokens)        → max per procedure ─┴─ RRF rank ─ calibrated confidence

Each procedure is indexed as several *views* (names in si/ta/en, synonyms, example
questions in five input varieties, summaries), so a Singlish question can match a
Singlish example while a Tamil question matches the Tamil name. Ranking uses
Reciprocal Rank Fusion. The decline decision uses a calibrated 0–1 confidence that
blends dense similarity and lexical coverage, because RRF scores are rank-based and
cannot be compared to a threshold.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field

import numpy as np
from rank_bm25 import BM25Okapi

from govnav_agents.retrieval.embeddings import Embedder, NgramEmbedder
from govnav_agents.retrieval.text import tokens
from govnav_agents.schemas import Procedure

log = logging.getLogger(__name__)

RRF_K = 60


@dataclass(frozen=True, slots=True)
class View:
    procedure_id: str
    kind: str
    text: str


@dataclass(frozen=True, slots=True)
class Calibration:
    """Maps raw cosine similarity into 0..1 for a given embedding model."""

    low: float
    high: float

    def __call__(self, sim: float) -> float:
        if self.high <= self.low:
            return 0.0
        return float(min(1.0, max(0.0, (sim - self.low) / (self.high - self.low))))


# Tuned on evals/queries.jsonl (see evals/REPORT.md); revisit when the model changes.
CALIBRATIONS: dict[str, Calibration] = {
    "ngram": Calibration(low=0.15, high=0.80),
    "gemini": Calibration(low=0.52, high=0.78),
}


@dataclass(slots=True)
class Hit:
    procedure_id: str
    confidence: float
    rrf: float
    dense: float
    lexical: float
    best_view: str
    rank: int = 0


@dataclass(slots=True)
class SearchResult:
    hits: list[Hit]
    latency_ms: int
    embedder: str
    notes: list[str] = field(default_factory=list)

    @property
    def top(self) -> Hit | None:
        return self.hits[0] if self.hits else None

    @property
    def margin(self) -> float:
        if len(self.hits) < 2:
            return 1.0
        return self.hits[0].confidence - self.hits[1].confidence


def procedure_views(p: Procedure) -> list[View]:
    views = [
        View(p.id, "name", p.name.en),
        View(p.id, "name", p.name.si),
        View(p.id, "name", p.name.ta),
        View(p.id, "summary", p.summary.en),
        View(p.id, "summary", p.summary.si),
        View(p.id, "summary", p.summary.ta),
    ]
    views += [View(p.id, "synonym", s) for s in p.synonyms]
    views += [View(p.id, "question", q) for q in p.example_questions.all()]
    # De-duplicate identical texts per procedure.
    seen: set[tuple[str, str]] = set()
    out: list[View] = []
    for v in views:
        key = (v.procedure_id, v.text.strip().lower())
        if v.text.strip() and key not in seen:
            seen.add(key)
            out.append(v)
    return out


class HybridRetriever:
    """In-memory hybrid index. Rebuilt whenever the approved procedure set changes."""

    def __init__(
        self,
        procedures: list[Procedure],
        embedder: Embedder | None = None,
        *,
        dense_weight: float = 0.6,
    ) -> None:
        self.embedder: Embedder = embedder or NgramEmbedder()
        self.dense_weight = dense_weight
        self.calibration = CALIBRATIONS["ngram" if self.embedder.model_id.startswith("ngram") else "gemini"]
        self.views: list[View] = [v for p in procedures for v in procedure_views(p)]
        if not self.views:
            raise ValueError("cannot build a retriever over zero procedures")
        self._view_tokens = [tokens(v.text) for v in self.views]
        self._token_sets = [set(t) for t in self._view_tokens]
        # Procedure-level IDF: a token shared by many procedures ("certificate", "venum")
        # says little about WHICH procedure; a token in none ("passport") counts against all.
        proc_tokens: dict[str, set[str]] = {}
        for v, ts in zip(self.views, self._token_sets, strict=True):
            proc_tokens.setdefault(v.procedure_id, set()).update(ts)
        n = len(proc_tokens)
        df: dict[str, int] = {}
        for ts in proc_tokens.values():
            for t in ts:
                df[t] = df.get(t, 0) + 1
        self._idf = {t: math.log((n + 1) / (c + 0.5)) for t, c in df.items()}
        self._idf_unseen = math.log((n + 1) / 0.5)
        self._bm25 = BM25Okapi(self._view_tokens)
        t0 = time.perf_counter()
        self._matrix = self.embedder.embed([v.text for v in self.views], "RETRIEVAL_DOCUMENT")
        log.info(
            "indexed %d views for %d procedures with %s in %.0f ms",
            len(self.views),
            len(procedures),
            self.embedder.model_id,
            (time.perf_counter() - t0) * 1000,
        )
        self._procedure_ids = sorted({v.procedure_id for v in self.views})

    def _per_procedure_max(self, scores: np.ndarray) -> dict[str, tuple[float, int]]:
        best: dict[str, tuple[float, int]] = {}
        for i, s in enumerate(scores.tolist()):
            pid = self.views[i].procedure_id
            if pid not in best or s > best[pid][0]:
                best[pid] = (float(s), i)
        return best

    def _coverage(self, q_tokens: list[str]) -> dict[str, float]:
        """Lexical confidence: IDF-weighted share of query tokens found in the best view."""
        q = set(q_tokens)
        if not q:
            return dict.fromkeys(self._procedure_ids, 0.0)
        weights = {t: self._idf.get(t, self._idf_unseen) for t in q}
        total = sum(weights.values())
        best: dict[str, float] = {}
        for i, ts in enumerate(self._token_sets):
            cov = sum(weights[t] for t in q & ts) / total
            pid = self.views[i].procedure_id
            best[pid] = max(best.get(pid, 0.0), cov)
        return best

    def search(self, query: str, k: int = 5) -> SearchResult:
        t0 = time.perf_counter()
        q_tokens = tokens(query)
        notes: list[str] = []

        qv = self.embedder.embed([query], "RETRIEVAL_QUERY")[0]
        dense_best = self._per_procedure_max(self._matrix @ qv)
        bm25_best = self._per_procedure_max(np.asarray(self._bm25.get_scores(q_tokens)))
        coverage = self._coverage(q_tokens)
        if not q_tokens:
            notes.append("query has no indexable tokens")

        dense_rank = sorted(dense_best, key=lambda p: dense_best[p][0], reverse=True)
        lex_rank = sorted(bm25_best, key=lambda p: bm25_best[p][0], reverse=True)
        rrf = {
            p: 1 / (RRF_K + dense_rank.index(p) + 1) + 1 / (RRF_K + lex_rank.index(p) + 1)
            for p in self._procedure_ids
        }

        hits: list[Hit] = []
        for pid in self._procedure_ids:
            d_sim, d_idx = dense_best[pid]
            d_conf = self.calibration(d_sim)
            l_conf = coverage.get(pid, 0.0) if bm25_best[pid][0] > 0 else 0.0
            conf = self.dense_weight * d_conf + (1 - self.dense_weight) * l_conf
            hits.append(
                Hit(
                    procedure_id=pid,
                    confidence=round(conf, 4),
                    rrf=round(rrf[pid], 6),
                    dense=round(d_sim, 4),
                    lexical=round(l_conf, 4),
                    best_view=self.views[d_idx].text,
                )
            )
        hits.sort(key=lambda h: (h.rrf, h.confidence), reverse=True)
        # Re-order the head by confidence so the most certain match leads when RRF ties.
        hits = sorted(hits[:k], key=lambda h: h.confidence, reverse=True)
        for i, h in enumerate(hits):
            h.rank = i + 1
        return SearchResult(
            hits=hits,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            embedder=self.embedder.model_id,
            notes=notes,
        )
