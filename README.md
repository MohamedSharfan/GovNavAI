<p align="center"><img src="resources/Sri Lankan Navigation Tech Logo.png" alt="GovNavAI" width="420"></p>

# GovNavAI

**Sri Lankan government paperwork, in your own language, ending in a form that's already filled in.**

GovNavAI is a trilingual (සිංහල · தமிழ் · English) web app. It takes a citizen from "what do I need?" to an official government form that is already filled in and ready to print and sign. It also gives the right office, fee, processing time and document checklist, each one cited from a verified knowledge base.

Team ByteMe, University of Ruhuna · DevFest Sri Lanka 2026, Government Digitalisation track.

> 🚧 Under active development. See [`docs/PLAN.md`](docs/PLAN.md) for the build plan and [`docs/DECISIONS.md`](docs/DECISIONS.md) for the decision log.

## Repository

| Path | What |
|---|---|
| `apps/web` | Next.js PWA: citizen app + officer console |
| `services/agents` | Python Google ADK multi-agent service (FastAPI, Cloud Run) |
| `packages/shared` | JSON Schemas + generated TypeScript types |
| `data/` | Verified seed knowledge base: procedures, offices, geography, form maps |
| `evals/` | Multilingual evaluation suite and report |
| `docs/` | Plan, decisions, architecture, submission, demo script |

## Quick start (local)

**Prerequisites:** Node 20+, pnpm 10, Python 3.11–3.13, [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
cd services/agents && uv sync && cd ../..
cp .env.example .env          # leave GEMINI_API_KEY empty to run in offline mode
```

Run the two services in separate terminals:

```bash
# 1. Agent service (Google ADK + FastAPI) on http://localhost:8787
cd services/agents && PORT=8787 uv run govnav-api
```

```bash
# 2. Web app (Next.js) on http://localhost:3000
pnpm --filter @govnav/web dev
```

**Offline mode vs Gemini.** With no `GEMINI_API_KEY`, the **same ADK agent tree** runs on a deterministic local model (`OfflineLlm`), so the app, tests and evals work without network access. Add a Gemini key and the router and info agents switch to Gemini Flash, and retrieval switches to Gemini embeddings. Model IDs live in one file: `services/agents/src/govnav_agents/llm/models.py`.

## Knowledge base

`data/` holds the seed: 9 procedures, 12 offices, the Ratnapura → Kuruwita hierarchy (39 GN divisions) and 11 official form PDFs from gov.lk sources. Every fact carries a `SourceRef`. Anything not confirmed for Kuruwita is flagged `demoData` and shown as "Sample data, confirm with office". Validate the seed:

```bash
cd services/agents && uv run python -c "from govnav_agents.kb import LocalKnowledgeBase as K; k=K(); print(len(k.procedures()), 'procedures OK')"
```

## Tests

```bash
cd services/agents && uv run pytest && uv run mypy src && uv run ruff check src tests
```

```bash
pnpm --filter @govnav/web test && pnpm --filter @govnav/web typecheck && pnpm --filter @govnav/web lint
```

Shared contracts: after editing `services/agents/src/govnav_agents/schemas.py`, run `pnpm schemas` to regenerate the JSON Schemas and TypeScript types.

## Milestones

| | Status |
|---|---|
| **M1 Foundation**: tokens, i18n, seed KB, ADK router + info agent, hybrid retrieval, Ask → cited answer in si/ta/en | ✅ |
| **M2 Core promise**: checklist, Form Studio, profile from NIC/bill, auto-fill, PDF, Visit pack | ⏳ |
| **M3 Adoption & reach**: Offices + Maps, Counter view, Procedure editor, Insights, voice | ⏳ |
| **M4 Proof**: evals report, accessibility/performance, Cloud Run + Firebase deploy | ⏳ |
| **M5 Submission** | ⏳ |
