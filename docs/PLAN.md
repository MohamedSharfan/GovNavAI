# GovNavAI: Build Plan

Team ByteMe · University of Ruhuna · DevFest Sri Lanka 2026, Government Digitalisation track
Deadline: **Thursday 10 December 2026, 23:59**

## 1. Our read of the product

- **The metric is first-visit success.** Kumari's three failed trips came from a missing document, the wrong form and the wrong office. Every screen exists to remove one of those three failures before she leaves home.
- **Verified, not generated.** Gemini handles understanding, language, field detection, form filling and wording. Every fee, office, document and form number is read from an officer-approved record with a `sourceRef` and `verifiedAt`. When retrieval confidence is low, the product declines honestly and points to the office and the 1919 hotline.
- **The journey ends with paper in hand.** Ask → checklist → the official form, already filled → print-ready PDF + Visit pack (QR). A chatbot answer is not the finish line.
- **An office can adopt it.** The officer console (Form Studio, Procedure editor, Counter view, Insights) lets a Divisional Secretariat keep the knowledge base current without engineers. That is the step from hackathon demo to public service.
- **Built for Kumari's phone and language.** It is a mobile-first PWA in Sinhala, Tamil and English (plus Singlish/Tanglish input). It uses voice, large tap targets, read-aloud and works offline for the checklist and Visit pack. The profile stays on the device (PDPA No. 9 of 2022).

## 2. Repository structure

```
govnavai/
├─ apps/
│  └─ web/                     Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, installable PWA
│     ├─ src/app/(citizen)/    Ask, Chat, Procedures, Checklist, Form, Preview, Offices, Requests, Profile
│     ├─ src/app/officer/      Form Studio, Procedure editor, Counter view, Insights
│     ├─ src/i18n/             si.json · ta.json · en.json
│     └─ src/lib/              api client, IndexedDB store, NIC parser (TS mirror), design tokens
├─ services/
│  └─ agents/                  Python 3.11 · Google ADK · FastAPI · Cloud Run
│     ├─ src/govnav_agents/
│     │  ├─ agents/            root orchestrator + router / info / checklist / form_locator / form_fill / office
│     │  ├─ llm/               model config (one file), Gemini + deterministic OfflineLlm
│     │  ├─ retrieval/         hybrid retriever: Gemini embeddings + BM25, RRF, threshold
│     │  ├─ kb/                knowledge-base repository (local JSON | Firestore)
│     │  ├─ sl/                Sri Lankan helpers: NIC, dates, phone, admin hierarchy, transliteration
│     │  ├─ schemas.py         Pydantic models: the single source of truth for all schemas
│     │  └─ api/               FastAPI app (ask, procedures, offices, forms, profile extraction, officer)
│     └─ tests/
├─ packages/
│  └─ shared/                  JSON Schemas exported from Pydantic + generated TypeScript types
├─ data/
│  ├─ procedures/*.json        seed procedure records (sourced; demoData flagged)
│  ├─ offices/*.json           curated office records
│  ├─ geo/ratnapura.json       Province → District → DS → GN hierarchy
│  └─ forms/                   official form PDFs + reviewed form_map.json files
├─ evals/                      60+ multilingual queries, runner, REPORT.md
└─ docs/                       PLAN, DECISIONS, ARCHITECTURE, SUBMISSION, DEMO_SCRIPT
```

## 3. Data schemas

The Pydantic models in `services/agents/src/govnav_agents/schemas.py` are the source of truth. `pnpm schemas` exports them to `packages/shared/schemas/*.json` and generates TypeScript types for the web app.

**LocalizedText** `{ en, si, ta }`. Every user-facing string exists in all three languages.

**Procedure**
| field | type | notes |
|---|---|---|
| `id` | slug | `income-certificate` |
| `category` | enum | civil-registration · identity · land-property · welfare-certificates · licensing |
| `name`, `summary` | LocalizedText | plain language |
| `synonyms` | string[] | incl. Singlish/Tanglish (`adayam sahathikaya`, `varumana saanrithal`) |
| `exampleQuestions` | {en, si, ta, singlish, tanglish}[] | embedded for retrieval |
| `officeType` | enum | GN · DS · DISTRICT · RGD · DRP · LAND_REGISTRY · OTHER |
| `officeFlow` | LocalizedText | e.g. "GN recommends → DS issues" |
| `fee` | `{ amountLkr \| null, isFree, text: LocalizedText }` | deterministic, never generated |
| `processingTime` | `{ minDays, maxDays, text }` | |
| `requiredDocuments` | `RequiredDocument[]` | `{ id, name, note?, conditional?, aiCanPrefill, formId? }` |
| `eligibility` | LocalizedText? | |
| `steps` | LocalizedText[] | |
| `formIds` | string[] | → FormMap |
| `sources` | `SourceRef[]` | `{ id, title, url, kind, section?, retrievedAt }` |
| `fieldSources` | map field → sourceRef ids | per-field citation |
| `sourceRef` | string | primary authorising source id |
| `verifiedBy`, `verifiedAt` | string, date | set only by a named officer's approval |
| `status` | draft · approved | only `approved` records are served to citizens |
| `demoData` | bool | true → UI shows "Sample data, confirm with office" |

**Office** `{ id, type, name, address, location{lat,lng}, phone?, email?, website?, hours: OpeningHours[], hoursNote?, handles: procedureId[], adminArea{district, dsDivision, gnCode?}, placeId?, queueStatus: normal|busy, sourceRef, verifiedAt, demoData }`

**FormMap** `{ id, code, name, procedureIds, pdfPath, pageCount, pageSizes[], verifiedYear, fields: FormField[], status, verifiedBy, verifiedAt, sourceRef, demoData }`
**FormField** `{ id, number, label: LocalizedText, page, bbox{x,y,w,h} (normalised 0–1, top-left origin), type: text|multiline|date|nic|phone|checkbox|signature, profileKey?, fillMode: auto|confirm|manual|officer, script: as_profile|si|ta|en|latin_caps, maxChars?, fontSize? }`

**Profile** (device only, IndexedDB, never stored server-side) `{ fullNameEn (BLOCK CAPS), fullNameSi?, fullNameTa?, nameWithInitials?, nic, dateOfBirth (derived), gender (derived), address{si?, ta?, en?}, gnDivisionCode, gnDivisionName, dsDivision, district, phone?, occupation?, civilStatus?, preferredLanguage, confirmedKeys[], updatedAt }`

**Request** (device only) `{ id, procedureId, language, createdAt, updatedAt, status: exploring|checklist|form_ready|visited, checklist{docId: bool}, formId?, purpose?, filledValues?, visitPackCode?, outcome: unknown|first_visit_success|needed_return }`

## 4. M1 Foundation: task list

1. Monorepo, tooling, git flow (`main` ← `develop` ← `feat/*`), `.env.example`, CONTRIBUTING.
2. Pydantic schemas → JSON Schema → TS types (`packages/shared`).
3. Sri Lankan helpers with unit tests: NIC parser (old/new, Feb = 29 days, +500 female), `YYYY.MM.DD`, phone `07X XXX XXXX`, admin hierarchy.
4. Seed knowledge base: 9 procedures and the Kuruwita/Ratnapura offices from researched official sources, with per-field citations and honest `demoData` flags. Plus a validator script.
5. Hybrid retrieval: Gemini embeddings (versioned, idempotent build) + BM25 over multilingual synonyms, RRF fusion, threshold → decline.
6. ADK agents: root orchestrator → `router_agent` (structured RouteDecision) → `info_agent` (writes only from record fields, plus a grounding guard). Also a deterministic `OfflineLlm` so the same tree runs without a key.
7. FastAPI: `POST /v1/ask`, `GET /v1/procedures[/{id}]`, `GET /v1/offices`, health. Logs redact NIC numbers and names.
8. Web: design tokens (#B31C1C palette, tricolour strip), fonts, i18n (si/ta/en), Home/Ask, Chat with Office·Fee·Time card, source chip, "How this answer was made" trace expander, decline card.
9. Check in a browser at 375px and 1280px in all three languages, then write the M1 summary.

Later milestones: see `BUILD_PROMPT.md` (`<working_method>`). Ownership: see `CONTRIBUTING.md`.
