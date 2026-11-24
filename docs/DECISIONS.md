# Decision log

The brief says: when something is unclear, choose the option that helps a Sri Lankan citizen most and write it down here. Newest first.

---

### D-010 · Two-person team; Member 2 owns the form pipeline (2026-11-24)
The team is two developers, not three. Member 2 owns Form Studio, form maps, the PDF overlay, `form_fill_agent` and preview/download. Member 1 owns everything else. Schemas are a shared contract. See `CONTRIBUTING.md`.

### D-009 · Git flow: `main` ← `develop` ← `feat/*`, one PR per milestone (2026-11-24)
This lets the judges see milestone PRs into `main` with reviewable diffs, while feature branches keep each piece of work attributable.

### D-008 · Offline mode through ADK, not around it (2026-11-24)
Gemini credits arrive 1–7 Dec. Rather than mocking the agent layer, we implement a deterministic `OfflineLlm` (an ADK `BaseLlm` subclass). The **same ADK agent tree** (orchestrator, router, info …) runs in dev, CI and evals without a key. Switching to Gemini is a config change (`GOVNAV_LLM_MODE=auto` + `GEMINI_API_KEY`). The offline model routes by retrieval rank and writes template answers from record fields, which also gives a groundedness baseline for the evals.

### D-007 · Orchestration: custom ADK root agent with deterministic gates (2026-11-24)
The root is a custom ADK `BaseAgent` (`govnav_root`). It runs retrieval, then `router_agent` (Gemini Flash, structured `RouteDecision`), then **code-level gates** (the chosen procedure must be one of the retrieved candidates, and the confidence must be at or above the threshold), then delegates to `info_agent`, `checklist_agent`, `form_locator_agent`, `office_agent` or `form_fill_agent`. This follows "Gemini decides, deterministic code guarantees correctness": an LLM can never put a procedure, fee or office into an answer that retrieval did not return.

### D-006 · Hybrid retrieval with honest decline (2026-11-24)
Dense retrieval uses Gemini embeddings over names, synonyms and example questions in si/ta/en/Singlish/Tanglish. It is combined with BM25 over the same text using script-aware tokens (character n-grams for Sinhala/Tamil). Reciprocal Rank Fusion merges the two, and the result is calibrated into a 0–1 confidence. Below `GOVNAV_RETRIEVAL_THRESHOLD`, the assistant declines, points to the nearest office and 1919, and logs the gap to Insights. Embeddings are versioned by model id and content hash, so rebuilds are idempotent.

### D-005 · Pydantic is the schema source of truth (2026-11-24)
The backend validates every record and every model output, so the Pydantic models are canonical. JSON Schema is exported to `packages/shared`, and TypeScript types are generated from it. One definition, no drift.

### D-004 · Python dependency pins (2026-11-24)
`google-adk 2.15` requires `google-genai <3`, so `google-genai` is pinned to 2.34.x through ADK. `requires-python` is `>=3.11,<3.14`.

### D-003 · Seed procedures (2026-11-24)
Nine procedures for Kuruwita DS / Ratnapura: income, character and residence certificates; certified copies of birth, marriage and death certificates; NIC application/replacement; senior citizen ID; one land procedure. The deck says "42 procedures". The prototype ships with the researched nine, and the UI shows the true count, never 42.

### D-002 · Forms: official where available, faithful recreation otherwise (2026-11-24)
Where an official form PDF is published online (DS / RGD / DRP sites), we use it. Otherwise we recreate the layout, mark it `demoData: true`, and label it "Sample layout, confirm with office". It still goes through the real Form Studio pipeline.

### D-001 · Brand palette follows the brief, not the hi-fi mock (2026-11-24)
The hi-fi Figma uses navy/mint. The brief replaces this with the government palette (#B31C1C, #5C0F0F hero, gold/saffron/green from the logo). Layout and interaction model are kept from the hi-fi screens.
