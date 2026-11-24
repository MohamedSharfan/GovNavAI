# Contributing to GovNavAI

## Team and ownership

| Member | Owns |
|---|---|
| **Member 1: Mohamed Sharfan** | Monorepo and tooling, shared schemas, knowledge base and seed data, ADK agent service (router, info, checklist, form-locator, office agents), retrieval, citizen web app, profile-from-documents, offices/Maps, officer console (Procedure editor, Counter view, Insights), voice, evals, deployment, docs |
| **Member 2** | **Form pipeline**: Form Studio (Gemini vision field detection + overlay editor), `form_map.json` files, PDF overlay with Noto Sans Sinhala/Tamil, `form_fill_agent`, filled-form preview (PDF.js) and download |

Shared contracts (`schemas.py`, the API shape) change only through a PR that both members review.

## Branches

```
main       ← release branch; a PR from develop at each milestone (M1…M5)
develop    ← integration branch
feat/<area>-<topic>   e.g. feat/agents-retrieval, feat/web-ask, feat/form-overlay
fix/<topic>, docs/<topic>, chore/<topic>
```

Feature branches merge into `develop` with `--no-ff`, so each feature stays visible in history.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat(agents): add hybrid retriever`, `fix(web): …`, `docs: …`, `test(sl): …`, `chore: …`.
Scopes: `agents`, `web`, `shared`, `data`, `forms`, `officer`, `evals`, `sl`, `infra`, `docs`.

## Definition of done

- Python: `uv run ruff check`, `uv run mypy src`, `uv run pytest` all pass.
- Web: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass, and the screen is checked at 375px and 1280px in සිං / த / En.
- Every new user-facing string goes in all three i18n files.
- Every new procedural fact carries a `sourceRef`. If it can't be confirmed, set `demoData: true`.
- No secrets, no real citizen data, no NIC numbers in logs or fixtures (use the synthetic persona data).
