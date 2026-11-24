# Decision log

The brief says: when something is unclear, choose the option that helps a Sri Lankan citizen most and write it down here. Newest first.

---

### D-016 · Follow-up continuity is gated on query novelty (2026-11-24)
Found in browser testing: after an income-certificate answer, "How do I renew my passport?" was answered as the income certificate, because short follow-ups kept the procedure in view. The retriever now reports **novelty**, the share of query words that appear in no verified record. A small trilingual lexicon of fee/time/documents/office/form words always counts as known. The root gate allows continuity only when novelty < 0.34, so "gasthuwa keeyada?" continues and "renew my passport" declines. This is enforced in code, so it holds for the Gemini router too.

### D-015 · Short, officer-approved fee/time labels (2026-11-24)
Official fee rules are paragraphs (for example "1.27% of yearly income…"), but the Office · Fee · Time card needs a glanceable value. `Fee.short` and `ProcessingTime.short` are optional LocalizedText labels, and every number in them is checked against the full approved text. The card shows the short label, and the detail page and the model also see the full rule.

### D-014 · Honest provenance on seed records (2026-11-24)
Seed records were researched from official sources and adversarially re-checked, but no Kuruwita DS officer has approved them yet. They carry `verifiedBy: "ByteMe research team (pending Kuruwita DS officer review)"`, and every record that relies on another DS's practice or an unconfirmed fact has `demoData: true`. The UI shows both. In the pilot, a named officer re-approves each record in the Procedure editor (M3).

### D-013 · Answer language follows the citizen, not the UI (2026-11-24)
Sinhala script and Singlish get Sinhala answers, Tamil script and Tanglish get Tamil answers, and English gets English answers, whatever the UI language. Someone who types in English inside the Sinhala UI gets English. The UI chrome stays in the selected language.

### D-012 · Retrieval: IDF-weighted lexical coverage (2026-11-24)
Unweighted coverage let generic words ("certificate", "venum") outvote the distinguishing word, which sent a Tamil income-certificate question to the character certificate. Coverage is now IDF-weighted at procedure level, and words found in no procedure weigh most. In-scope queries score 0.76–1.0 and out-of-scope ones ≤ 0.32 (threshold 0.45).

### D-011 · Local agent port 8787 (2026-11-24)
Windows reserves 8080 on the dev machine. Local dev uses `PORT=8787`, and Cloud Run injects its own `PORT`.


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
