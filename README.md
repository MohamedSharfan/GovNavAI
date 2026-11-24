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

Setup, run, seed, test and deploy instructions will be added as each milestone lands.
