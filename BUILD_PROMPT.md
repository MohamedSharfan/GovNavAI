# GovNavAI: Build Prompt for Claude Opus 5.5

> Paste everything below the line into Opus 5.5 (Claude Code or Google Antigravity), opened in the `E:\govNavAI` folder.

---

<role>
You are the lead full-stack engineer and product designer for Team ByteMe (University of Ruhuna). You are building **GovNavAI** for the **Government Digitalisation** track of the DevFest Sri Lanka 2026 hackathon (GDG Sri Lanka, run with Google, AI partner Roar AI). You own the whole result: architecture, code, UI, data, evaluation, deployment and the written submission. Use good judgement. When something is unclear, choose the option that helps a Sri Lankan citizen most and write the decision down in `docs/DECISIONS.md`.
</role>

<mission>
Kumari Rathnayake is 52 and runs a small grocery shop in Kuruwita, Ratnapura District. She has gone to the Divisional Secretariat three times for an income certificate, which her daughter needs to claim a Mahapola scholarship. Each trip failed: once for a document nobody told her to bring, once for the wrong form, and once because it was the wrong office. She has a basic smartphone, reads Sinhala comfortably and avoids English forms.

GovNavAI is a trilingual web app (Sinhala, Tamil, English) that takes a citizen from "what do I need?" to **an official government form, already filled in and ready to print and sign**. It also gives them the right office, the fee, the processing time and the document checklist. Every procedural fact comes from a **verified knowledge base with a cited source**. Gemini does the understanding, the language work, the form reading and the form filling. It does not make up procedures.

**Success measure:** the citizen succeeds at the office on the first visit. Build every feature, metric and demo moment around this.
</mission>

<context_files>
Read these first, in `E:\govNavAI\resources\`:
- `ByteMe-round1_dhackproposal.pdf`: original proposal with the problem, the persona, the agent pipeline (router → info → checklist → form-locator → form-fill), the information architecture (Procedures / Offices / My requests) and the user scenario.
- `ByteMe_presentation.pptx`: the pitch narrative and national-scale numbers. Reuse its facts and sources in the submission: 21.78M people, 6.03M households, 331 Divisional Secretariats, 14,022 GN divisions, an estimated Rs 5.7 billion a year lost to failed trips, 80.3% of internet use on smartphones, 19.1% of households with a computer, the PDPA in force from 18 March 2025, and SLUDI / GovPay.
- `ByteMe-low-fidelity.pdf`: wireframes W01 to W07 (Home/Ask, Conversation, Checklist, Form locator + auto-fill, Filled form preview, Offices directory, Office detail).
- `ByteMe-high-fidelity-withlinkfor-prototype.pdf`: the high-fidelity mobile screens. Figma prototype: https://www.figma.com/proto/pUqbeqfQ5FEAYrtP0r5tzX/govnavAI?node-id=226-3110
- `Sri Lankan Navigation Tech Logo.png` (full wordmark) and `Dynamic Multicolor Navigation G Logo.png` (the "G" mark). Use these as the brand assets, for example the favicon, PWA icons, header and splash.

The proposal is older than this prompt. Where this prompt differs from it, follow this prompt.
</context_files>

<judging>
Judges score the submission template section by section. Design the product and the repo to score well on each criterion:

| Criterion | Weight | What earns a 5 |
|---|---|---|
| Impact and fit to theme | 25% | Saves citizens trips, time and confusion. Works in Sinhala and Tamil and for people who aren't tech-savvy. A public office could realistically adopt it. Handles personal data carefully. |
| Google AI use and technical depth | 25% | Gemini does the real work at several distinct points, through a proper multi-agent system, and the engineering is solid. |
| Innovation and originality | 20% | A clear step beyond a chatbot: verified answers that cite sources, plus AI that reads a real government form and fills it in. |
| Working prototype | 15% | The whole flow works end to end in a real demo video, with a live link. |
| Responsible AI and what's next | 5% | Privacy, safety, bias and limitations are dealt with in the product itself, and the roadmap is credible. |
| Presentation and clarity | 10% | A clear submission and a demo video that tells Kumari's story. |

Bonus points: the team claimed Gemini credits, and the team used **Google Antigravity** to build it. Record how Antigravity was used so the team can prove it.
</judging>

<product_scope>
## Citizen app (core, must work end to end)

1. **Ask.** The citizen types or speaks a need in Sinhala, Tamil, English, or code-mixed Singlish/Tanglish written in Latin letters (e.g. "mata income certificate ekak ona duwage scholarship ekata"). A router agent works out the procedure and the language. An info agent replies in plain, warm, everyday language (not bureaucratic register) with **office · fee · processing time** and a **source chip** showing the authorising document and its last-verified date.
2. **Checklist.** The exact documents for *this* case, each one tickable. Progress is saved and can be resumed from Home ("Continue: Income certificate 2 of 4"). Items GovNavAI can produce, such as a declaration form, carry an "AI can pre-fill" badge.
3. **Form.** The app finds the official form (form code, name in all three languages, page count, verified year) and fills it from the citizen's profile. Fields that were auto-filled, fields that need the citizen to check them, and fields that must be filled by hand in front of the officer (signature, officer-only sections) are shown differently. The app writes the "purpose of request" field from the conversation. It transliterates names between Sinhala/Tamil script and English block capitals, and the citizen confirms each one.
4. **Preview and download.** Show the real official form layout with the values placed exactly on it, a "% filled" badge, and a clear callout for each step the citizen still has to do by hand (e.g. "Sign field 06 in front of the Grama Niladhari"). Produce a print-ready PDF. Add a **"Visit pack"**: a one-page summary with the office, opening hours, checklist and a QR code, which they can save to the phone or share on WhatsApp.
5. **Offices.** Nearby Grama Niladhari, Divisional Secretariat and District Secretariat offices, with distance, opening hours, open/closed status, Directions and Call buttons, and "Handles: …" procedure tags.
6. **My requests.** A history of procedures looked up and forms produced, stored on the device.
7. **Profile from documents.** The citizen can take a photo of their NIC or a utility bill to fill in their profile (name, NIC, address, GN division). Gemini vision extracts the fields. The citizen reviews every value, and the image is thrown away once extraction is done.

## Officer console (this is what makes it adoptable by a public office)

8. **Form Studio.** An officer uploads a scanned or PDF official form. Gemini vision detects every field (label in each language, bounding box, field type, which profile key it maps to, whether it is officer-only). The officer corrects these in a visual overlay editor and publishes. After that, any form can be pre-filled, including flat scanned forms that have no fillable fields.
9. **Procedure editor.** An officer uploads a circular or gazette notice. Gemini drafts a structured procedure record (office, fee, processing time, required documents, form codes, eligibility) with a citation for each field pointing to the part of the source it came from. A named officer reviews and approves it before it goes live. Every record keeps `verifiedBy`, `verifiedAt` and `sourceRef`.
10. **Counter view.** The officer scans the citizen's Visit-pack QR code and sees the procedure, the ticked checklist and the filled form summary. It also includes a simple queue-status toggle (Normal / Busy) that feeds the citizen's Offices screen.
11. **Insights.** A small dashboard: top procedures asked about, the questions the system declined to answer (gaps in the knowledge base), language split, and self-reported first-visit success.

## Seed content

Cover **8 to 10 of the most common GN/DS procedures** for the Kuruwita DS Division / Ratnapura District demo area: income certificate, character certificate, residence certificate, certified copies of birth, marriage and death certificates, NIC application or replacement (GN certification), senior citizen ID, and one land-related procedure. Research them from official public sources such as the Government Information Center (gic.gov.lk / 1919), Divisional Secretariat websites, the Registrar General's Department and the Department for Registration of Persons. Record the real URL or circular for each fact. When a detail can't be confirmed, mark the record `"demoData": true` and show a small "Sample data, confirm with office" label in the UI. This honesty is part of the product's value.
</product_scope>

<google_ai_architecture>
Google AI does the real work at each of these points. Keep the model IDs in one config file. At build time, confirm the newest available Gemini Flash and Gemini Pro model IDs in Google AI Studio and use those.

| Capability | Google product | How |
|---|---|---|
| Multi-agent orchestration | **Agent Development Kit (ADK, Python)** | A root `router_agent` delegates to `info_agent`, `checklist_agent`, `form_locator_agent`, `form_fill_agent` and `office_agent`. Each one is a narrow agent with typed tools. Use ADK sessions/state for the conversation. Use the ADK dev UI and `adk eval` during development. |
| Understanding, routing, plain-language replies | **Gemini API (Flash)** via the Google Gen AI SDK | Intent and language detection, including Singlish and Tanglish. Replies are written *only from retrieved procedure fields*. Use structured output (`responseSchema`) for every agent hand-off. |
| Retrieval over the verified knowledge base | **Gemini Embeddings** + **Firestore vector search** | Embed each procedure's multilingual names, synonyms and example questions. Get the top-k matches, then confirm with a strict `get_procedure(id)` tool. If the similarity score is below the threshold, take the honest decline path. |
| Form digitisation (Form Studio) | **Gemini (Pro) vision** | Detect fields and their bounding boxes on official forms, get labels in all three languages, and map each field to the profile schema. The output is a reviewed `form_map.json`. |
| Document-to-profile | **Gemini (Flash) vision** | Extract fields from NIC photos and utility bills. Cross-check them against deterministic validators. |
| Procedure drafting from circulars | **Gemini (Pro)** with long context and PDF input | Draft procedure records, with a citation for each field, for an officer to approve. |
| Voice | **Gemini Live API** for real-time voice, plus Gemini audio understanding for recorded clips | Sinhala/Tamil/English voice input. Read answers aloud with Gemini TTS or Cloud Text-to-Speech in each language they support. Check what each language supports when you build it and wire up the best option per language. |
| Offices | **Google Maps Platform** (Maps JavaScript API, Places API (New), Routes/Directions) | Nearby offices, opening hours, open now, directions. Use curated office records first, with Places data added on top. |
| Hosting and data | **Cloud Run** (ADK agent service + web app), **Firebase** (Hosting or App Hosting, Firestore, Cloud Storage for official form PDFs, Anonymous Auth for citizens, Google sign-in for officers, App Check) | A public live link for judges. |
| Quality | **Vertex AI Gen AI evaluation** (or the ADK eval tooling) | Automated evaluation with results reported separately for each language (see `<evaluation>`). |

Set up the work so each part has one clear owner:
- **Gemini decides.** It handles intent, language, field detection, field mapping, purpose-of-request wording, transliteration suggestions and explanations.
- **Deterministic code guarantees correctness.** It handles fees, offices and document lists (always read from Firestore records), NIC parsing and validation, date formats, and placing text onto the PDF.

**Form filling pipeline:** official PDF in Cloud Storage → reviewed `form_map.json` (normalised bounding boxes, field types, profile keys) → server-side overlay with **pdf-lib** (or PyMuPDF), embedding **Noto Sans Sinhala / Noto Sans Tamil** so Sinhala and Tamil shaping renders correctly → preview in the browser with PDF.js → download. Open a generated PDF in a real viewer and check that the Sinhala and Tamil text renders correctly.

**Sri Lankan deterministic helpers (with unit tests):**
- NIC parser for both formats. Old: 9 digits + V/X, the first two digits are the year 19xx. New: 12 digits, the first four are the year. The next three digits are the day of the year, plus 500 for women. Day counting treats February as always having 29 days. From these, derive date of birth and gender, which pre-fill those form fields.
- Province → District → DS Division → GN Division hierarchy (seed Ratnapura fully, with Kuruwita in detail).
- Dates in `YYYY.MM.DD`, the way Sri Lankan forms usually write them.
- Validation for Sri Lankan phone numbers (07X XXX XXXX).

Suggested stack: **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui** for the web app (installable PWA), a **Python ADK service** with FastAPI on Cloud Run, and Firestore and Cloud Storage for data. Use a monorepo: `apps/web`, `services/agents`, `packages/shared` (schemas), `data/` (seed procedures, offices, form maps), `docs/`.
</google_ai_architecture>

<design_direction>
The high-fidelity design is strong. **Keep its structure and interaction model**, and give it a Sri Lankan government identity:

**Keep:** the dark hero on Home with the big question "What do you need from the government?" and an ask bar with a mic; the 2×2 common-procedure cards with Sinhala subtitles; the "Continue" resume card with progress; the bottom navigation (Ask · Procedures · Offices · Requests); the agent-trace chips in chat ("ROUTER → INFO AGENT"), moved into a small "How this answer was made" expander; the Office / Fee / Time triple card; the source chip; the checklist with a percentage ring; the form-locator card with the "VERIFIED 2024" pill; colour-coded auto-filled fields; the paper-style form preview with the "% FILLED" badge and the amber sign-here callout; and the office cards with status pills.

**Change:**
- **Colour.** Replace the navy/mint palette with a government palette built on **#B31C1C** and the colours of the GovNavAI logo, which follow the Sri Lankan flag (maroon, gold, saffron, green). Define these as CSS variables or Tailwind tokens:
  - `--primary` **#B31C1C** (Government Red): primary buttons, active nav, key headings. White text on it gives about 6.8:1 contrast.
  - `--primary-strong` **#8A1515**: hover and pressed states. `--primary-deep` **#5C0F0F**: dark hero and header surfaces (this takes over from the old navy).
  - `--gold` **#F2B705**: AI badges, highlights, focus accents (with dark text on it).
  - `--saffron` **#E8740C**: "do this by hand" and caution callouts (this takes over from the old amber).
  - `--green` **#1B6E3A**: verified, open, done, checked boxes (this takes over from the old mint for success states).
  - Neutrals: `--bg` warm paper **#FBF7F2**, `--surface` **#FFFFFF**, `--ink` **#2A1A1A**, `--muted` **#6B5B57**, `--line` **#EADFD6**.
  - A thin tricolour strip (gold · saffron · green) under the app header, echoing the logo.
- **Sri Lankan character, kept subtle:** a faint *liya-pata* or lotus line pattern in the hero background and on the Visit-pack/print header, and warm paper tones on the form preview. It should feel calm, official and trustworthy, like a modern government service.
- **Typography:** Plus Jakarta Sans for Latin text, **Noto Sans Sinhala** and **Noto Sans Tamil** for body text (with Yaldevi as an option for Sinhala display headings), all from Google Fonts. Set a slightly larger base size and line-height for Sinhala and Tamil scripts.
- **Three languages throughout:** a three-way toggle **සිං | த | En** on every screen. Every UI string comes from i18n files (`si.json`, `ta.json`, `en.json`). Tamil has full parity with Sinhala.
- **Responsive web app:** design mobile-first to match the high-fidelity screens. On tablet and desktop, use a left navigation rail with a two-pane layout (conversation on the left, checklist/form panel on the right). The officer console is desktop-first and uses the same tokens.
- **Accessibility for non-tech-savvy users:** tap targets of 48px or more, a text-size control (A / A+ / A++), read-aloud on every answer, simple icons that always have labels, WCAG AA contrast, full keyboard and screen-reader support, and fast loading on a 3G connection (installable PWA, checklist and Visit pack available offline).
- Add an optional dark theme from the same tokens if there's time.

Use the frontend/design skills you have available to get a polished, consistent result. Check each screen in the browser at 375px and 1280px wide.
</design_direction>

<responsible_ai>
Build these into the product, then describe them in the submission:
- **Verified, not generated:** every fee, office, document and form number comes from a record that has a `sourceRef` and `verifiedAt`. Below the confidence threshold, the assistant says it can't confirm this and points the citizen to the nearest office and the 1919 GIC hotline. Log these declines to Insights so gaps in the knowledge base get fixed.
- **Privacy by design (Sri Lanka PDPA No. 9 of 2022):** the citizen profile lives on the device (IndexedDB). The server processes it only for the current session, document photos are discarded after extraction, NIC numbers and names are redacted from logs, there is a clear consent screen in all three languages, and a "Delete my data" button.
- **Treat uploaded content as data:** text inside uploaded documents and circulars is only ever extracted, never acted on as instructions. Every model output is checked against a schema before it is used.
- **Human in the loop:** procedure records and form maps go live only after an officer approves them. Citizens confirm every auto-filled value before the PDF is generated.
- **Fairness across languages:** evaluation results are reported separately for Sinhala, Tamil, English and code-mixed input, and any gap is fixed before launch.
- **Clear limits:** GovNavAI prepares the citizen; the office decides. Say so in the UI.
</responsible_ai>

<evaluation>
Create `evals/` with a test set of **60 or more realistic citizen queries**, spread across Sinhala, Tamil, English and Singlish/Tanglish, including out-of-scope and adversarial cases. Measure:
- routing accuracy (correct procedure),
- groundedness (every fact in the answer is found in the retrieved record),
- correct declines on out-of-scope questions,
- form-fill field accuracy on the seeded forms,
- end-to-end latency.

Add a script that writes `evals/REPORT.md` with a table per language, and quote these numbers in the submission. Add unit tests for the NIC parser, the form overlay and the schema validators, and one Playwright end-to-end test of Kumari's full journey.
</evaluation>

<working_method>
Deadline: **Thursday 10 December 2026, 23:59**. Today is 24 November 2026. Work in vertical slices so that a demo-able build exists at every stage:

1. **M1, Foundation:** look at the resources; plan the repo; set up design tokens and i18n; seed the knowledge base; set up the ADK router and info agent with retrieval; get Ask → answer with source chip working in all three languages.
2. **M2, The core promise:** checklist with saved progress → Form Studio digitising the income certificate form → profile (including NIC/bill photo extraction) → auto-fill → preview → PDF → Visit pack. This is Kumari's full journey.
3. **M3, Adoption and reach:** Offices with Maps, Counter view and queue status, Procedure editor, Insights, voice.
4. **M4, Proof:** evaluation suite and report, accessibility pass, performance pass, deployment to Cloud Run/Firebase with a public URL, seed data review.
5. **M5, Submission:** write the documents below.

At each milestone: run the app, click through the flow in a browser, fix what you find, and give a short summary of what works. Keep secrets in `.env` (add `.env.example`). When something needs the team (API keys, a Google Cloud project, billing, deploying), list exactly what to do and continue with the work that doesn't depend on it.
</working_method>

<deliverables>
- A working monorepo, as described above, with a `README.md` covering setup, run, seed, test and deploy.
- `docs/ARCHITECTURE.md` with a **Mermaid architecture diagram** (citizen web app → ADK agent service on Cloud Run → Gemini / Embeddings / Firestore / Storage / Maps, plus the officer console), and an exported PNG of it for the submission.
- `docs/SUBMISSION.md`, a ready-to-paste draft of **every field** in the official template:
  - Overview: project name, one-line pitch, track.
  - Problem & impact: the problem and who it affects; impact in the track, using the deck's figures and the first-visit success measure.
  - Solution & Google AI: what we built; Google AI products used; how we use Google AI; architecture; other tools; the diagram.
  - What's new: what makes it different.
  - Working prototype: demo video, repo, live link, what works today (be precise and honest).
  - Responsible AI & what's next: risks and safeguards; what's next, matching the deck: Kuruwita pilot → full Tamil + 150 procedures → WhatsApp/IVR → about 600 procedures with SLUDI + GovPay, plus Gemma on-device for offline use.
  - Bonus: Gemini credits, Google Antigravity.
  - How we built it: the AI tools used.
- `docs/DEMO_SCRIPT.md`: a 2–3 minute video script and shot list that tells Kumari's story. It opens with her three failed trips, then a voice query in Sinhala, then the answer with its source, the checklist, NIC photo → profile, the filled form, the Visit pack, the officer scanning the QR code, a quick switch to Tamil, and an honest decline on an out-of-scope question. It ends on the evaluation numbers and the line "Judge us on one number: first-visit success rate."
- `docs/DECISIONS.md` and `evals/REPORT.md`.
</deliverables>

<first_step>
Start by reading all the resource files and viewing the high-fidelity screens. Then reply with:
1. your read of the product in five bullets,
2. the repo structure and the data schemas (Procedure, Office, FormMap, Profile, Request),
3. the M1 task list.

Then start building M1.
</first_step>
