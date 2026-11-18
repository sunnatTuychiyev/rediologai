# RadiologAI — Shifokor yordamchisi (Mammografiya xulosa qoralamasi)

> Loyihaning 2-qismi: rentgenolog ko'krak bezi tasvirini (mammografiya) yuklaydi, AI xulosa qoralamasini yozadi, shifokor uni ko'rib chiqadi, xatolarini to'g'rilaydi va tasdiqlaydi. AI tashxis qo'ymaydi — faqat qoralama yozadi.

---

# ROLE
You are a senior full-stack engineer working inside an **existing** Next.js repo: `radiologai` (the education module "RadiologAI — Ta'lim" is already built). Add a new module: **"Shifokor yordamchisi"**, an AI report-drafting assistant for **mammography only**. This is a hackathon MVP: a stable, polished demo beats breadth. Write complete, runnable code (no `// TODO` placeholders). After each build step `npm run dev`, `npm run typecheck` and `npm run lint` must pass.

**Do not break the education module.** Reuse its patterns, components and libraries instead of adding new ones.

# PRODUCT IN ONE SENTENCE
A radiologist uploads a mammography study (DICOM or PNG/JPG), enters short clinical info, and within 10–15 seconds gets a structured draft report in Uzbek (BI-RADS based). The doctor edits it in a side-by-side editor next to the images and approves it. Only the approved version becomes the official report. Every AI suggestion and every doctor change is written to an audit log.

# EXISTING CODEBASE (read these first, follow their conventions)
- Next.js 14 App Router + TypeScript, Tailwind + shadcn/ui (`src/components/ui`), lucide-react, sonner, recharts, zod.
- Prisma 5 + SQLite (`prisma/schema.prisma`). Enum-like and JSON fields are stored as `String` (validated with zod in `src/lib/types.ts`) so the schema stays Postgres-compatible. Keep this convention.
- Auth: NextAuth Credentials + bcrypt, JWT session carrying `role` (`src/lib/auth.ts`, `src/types/next-auth.d.ts`). Role guard in `src/middleware.ts`.
- AI: `src/lib/ai.ts` — Claude via `@anthropic-ai/sdk`, server-only, model from `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `ANTHROPIC_EFFORT`, JSON-schema structured output, 60 s timeout, 1 retry, refusal fallback. No `temperature` parameter.
- Offline fallback: `src/lib/offline-ai.ts` returns the same JSON shape when `ANTHROPIC_API_KEY` is empty; UI labels it "Oflayn". Do the same for the new module.
- Uploads: `api/upload` → `public/uploads`, served by `api/files/[name]`. Viewer: `src/components/image-viewer.tsx` (reuse/extend it, do not write a second viewer).
- Layout: `src/components/app-shell.tsx`.

# LANGUAGE
- All UI text in **Uzbek (Latin script)**: "Yangi tekshiruv", "Tasvir yuklash", "Qoralama yaratish", "Qoralama", "Tahrirlash", "Tasdiqlash", "Tasdiqlangan xulosa", "Shifokor e'tibori kerak", "Audit jurnali", "Model kartasi".
- Code, identifiers and comments in English.
- AI output text in Uzbek (Latin). Standard terms may keep Latin/English in parentheses, e.g. "spikulali chekkali hosila (spiculated mass)".

# SCOPE

**In scope (MVP):**
- Modality: **mammography (MG)** only. A study has up to 4 standard views: R-CC, L-CC, R-MLO, L-MLO. Allow 1–4 images (a single view is allowed but lowers confidence).
- Input formats: `.dcm` (DICOM), `.png`, `.jpg/.jpeg`, `.webp`; up to 50 MB per DICOM, 10 MB per raster image.
- Optional: one prior study for comparison (just shown side by side and mentioned in the prompt; P1).
- Draft → edit → approve → print/PDF.

**Out of scope (put in "Yo'l xaritasi" on the model card page):** breast ultrasound, breast MRI, tomosynthesis (DBT), CAD heatmaps from a trained detector, PACS/HL7 integration, e-signature.

# ROLES & ROUTES
- Add role **DOCTOR** (`STUDENT | TEACHER | DOCTOR`). Update zod role schema, NextAuth types, `middleware.ts` (`/doctor/*` → DOCTOR only; matcher includes `/doctor/:path*`), and the post-login redirect.
- Demo account: `doctor@demo.uz` / `demo1234` (add to seed and README table).
- Pages:
  - `/doctor` — dashboard: today's studies, status counts (Qoralama kutilmoqda / Ko'rib chiqilmoqda / Tasdiqlangan / E'tibor kerak), average AI time, % of drafts approved with no or minor edits.
  - `/doctor/studies` — list with filters (status, BI-RADS, date), search by anonymized study code.
  - `/doctor/studies/new` — upload wizard (3 steps, see FLOW).
  - `/doctor/studies/[id]` — **workspace**: viewer left, draft editor right.
  - `/doctor/studies/[id]/report` — printable approved report (print CSS; "PDF yuklab olish" = `window.print()`).
  - `/doctor/audit` — audit log table with filters + CSV export.
  - `/doctor/model-card` — model card (static content + live metrics from DB).

# DATA MODEL (add to Prisma; String for enums/JSON as in the existing schema)
- **Study**: id, code (anonymized, e.g. `MG-2026-0001`, unique), doctorId → User, patientAge (Int?), patientSex (default "F"), indication (`SCREENING | DIAGNOSTIC`), clinicalInfo (String: symptoms, palpable lump side, family history, HRT, prior surgery), priorStudyId (String?), status (`UPLOADED | DRAFTING | DRAFT_READY | NEEDS_ATTENTION | IN_REVIEW | APPROVED | ERROR`), error (String?), createdAt, updatedAt.
- **StudyImage**: id, studyId, url (PNG served to the viewer/AI), originalName, sourceFormat (`DICOM | PNG | JPG | WEBP`), laterality (`R | L`), view (`CC | MLO | OTHER`), width, height, pixelSpacing (Float?, mm/px from DICOM), order.
- **Draft**: id, studyId, version (Int), source (`AI | OFFLINE`), model (String), effort (String), payload (JSON: `MammoDraft`, see below), renderedText (String — Uzbek report generated from payload), overallConfidence (Float 0–1), gated (Boolean — true if confidence gate blocked the draft), latencyMs (Int), inputTokens/outputTokens (Int?), createdAt.
- **Report**: id, studyId (unique), draftId (the AI draft it started from), payload (JSON: `MammoDraft` as edited by the doctor), text (final Uzbek report), status (`IN_REVIEW | APPROVED`), approvedById, approvedAt, editStats (JSON: per-section changed/unchanged, findings added/removed/modified, BI-RADS changed yes/no, character edit distance), createdAt, updatedAt. An APPROVED report is **read-only**; changes after approval create an addendum (P1) — never silent edits.
- **AuditLog**: id, studyId?, userId, action (`STUDY_CREATED | IMAGE_UPLOADED | ANONYMIZED | DRAFT_REQUESTED | DRAFT_CREATED | DRAFT_GATED | DRAFT_FAILED | REPORT_EDITED | REPORT_APPROVED | REPORT_VIEWED | EXPORTED`), details (JSON: e.g. diff, model, latency, confidence), createdAt. Append-only: no update/delete code paths.

# FLOW

## 1. Upload wizard (`/doctor/studies/new`)
1. **Bemor va klinik ma'lumot**: age, indication (Skrining / Diagnostik), clinical info textarea, optional prior study. **No name, no passport/ID, no phone** fields — show a notice: "Bemorning shaxsiy ma'lumotlarini kiritmang. Tizim faqat anonim kod bilan ishlaydi."
2. **Tasvirlar**: drag-and-drop 1–4 files. For each file show a thumbnail and selectors for laterality (O'ng/Chap) and view (CC/MLO). For DICOM, pre-fill from tags `ImageLaterality (0020,0062)` / `Laterality (0020,0060)` and `ViewPosition (0018,5101)`. Warn if a view is duplicated or missing.
3. **Tekshirish va yuborish**: summary → "Qoralama yaratish" button.

## 2. Server-side image processing (`src/lib/imaging.ts`, route `api/doctor/upload`)
- **DICOM**: parse with `dicom-parser` (add dependency). Read pixel data, apply `RescaleSlope/Intercept`, then `WindowCenter/WindowWidth` (or min–max if absent), handle `PhotometricInterpretation = MONOCHROME1` (invert), output 8-bit PNG with `sharp` (add dependency).
- Many mammography DICOMs use **compressed transfer syntaxes (JPEG 2000 / JPEG-LS)**. If the transfer syntax is compressed and cannot be decoded in Node, return a clear Uzbek error ("Bu DICOM siqilgan formatda. PNG ga o'tkazib yuklang yoki `scripts/mammo/dicom_to_png.py` dan foydalaning") and **provide that Python script** (pydicom + pylibjpeg + pylibjpeg-openjpeg + numpy + Pillow, same style as `scripts/lidc/build_cases.py`). Seeded demo images must be PNG so the demo never depends on this.
- **Anonymization (mandatory)**: the original DICOM is **never stored**. Only the derived PNG is kept, plus whitelisted tags (laterality, view, pixel spacing, rows/cols, manufacturer). Discard PatientName, PatientID, BirthDate, InstitutionName, ReferringPhysician, AccessionNumber, dates, UIDs. Write an `ANONYMIZED` audit entry listing which tag groups were removed (names only, never values).
- Raster images: strip EXIF/metadata with `sharp` (re-encode to PNG).
- Store two versions: full-resolution PNG for the viewer, and an AI copy downscaled so the long side is ≤ 1568 px (keeps Claude latency and cost low).
- Validate MIME by magic bytes, not by extension.

## 3. Draft generation (`src/lib/mammo-ai.ts`, route `api/doctor/studies/[id]/draft`)
- Unlike the trainer, here the model **does see the images**: send the AI copies as base64 image blocks, each preceded by a text label `"R-CC"`, `"L-MLO"`, etc., plus age, indication, clinical info.
- Use structured output with a strict JSON schema for `MammoDraft` (below), the same call/timeout/retry/refusal pattern as `src/lib/ai.ts`. Use `ANTHROPIC_EFFORT=low` by default; target ≤ 15 s. Show a progress UI with steps ("Tasvirlar tayyorlanmoqda → AI tahlil qilmoqda → Qoralama yozilmoqda") — reuse `pending-result.tsx` style.
- **Two-stage safety check in the same call** (fields in the schema): first `imageCheck` (is this a mammogram? which views? technically adequate?), then findings.
- The server, not the model, builds the final text: `renderMammoReport(payload)` turns the JSON into the Uzbek report template (deterministic), so the structure is always the same.

### `MammoDraft` JSON shape (define with zod in `src/lib/types.ts` and as JSON schema)
```json
{
  "imageCheck": {
    "isMammogram": true,
    "viewsDetected": ["R-CC", "L-CC", "R-MLO", "L-MLO"],
    "quality": "adequate" | "limited" | "inadequate",
    "qualityNotes": "Chap MLO proyeksiyada pektoral mushak yetarli ko'rinmaydi"
  },
  "breastComposition": "A" | "B" | "C" | "D",
  "breasts": {
    "right": {
      "findings": [
        {
          "id": "r1",
          "type": "mass" | "calcifications" | "asymmetry" | "focal_asymmetry" | "architectural_distortion" | "skin_thickening" | "nipple_retraction" | "intramammary_lymph_node" | "other",
          "description": "Tasvir matni o'zbek tilida",
          "location": { "quadrant": "UOQ" | "UIQ" | "LOQ" | "LIQ" | "central" | "retroareolar" | "axillary_tail", "clockFace": "10", "depth": "anterior" | "middle" | "posterior" | null },
          "sizeMm": 12 | null,
          "descriptors": { "shape": "oval|round|irregular|null", "margin": "circumscribed|obscured|microlobulated|indistinct|spiculated|null", "density": "high|equal|low|fat-containing|null", "calcMorphology": "string|null", "calcDistribution": "string|null" },
          "seenOnViews": ["R-CC", "R-MLO"],
          "region": { "view": "R-MLO", "x": 0.42, "y": 0.35, "w": 0.10, "h": 0.08 } | null,
          "confidence": 0.0
        }
      ],
      "biradsSuggestion": "0" | "1" | "2" | "3" | "4A" | "4B" | "4C" | "5"
    },
    "left": { "...": "same shape" }
  },
  "axillaryLymphNodes": "Tasvir matni yoki null",
  "comparisonWithPrior": "string | null",
  "overallBirads": "0" | "1" | "2" | "3" | "4A" | "4B" | "4C" | "5",
  "impression": "Qisqa xulosa o'zbek tilida",
  "overallConfidence": 0.0,
  "attentionReasons": ["..."],
  "limitations": "AI cheklovlari haqida 1 jumla"
}
```
Rules enforced **on the server** after parsing (do not trust the model):
- `overallBirads` = the most severe of the two breasts (order: 1 < 2 < 3 < 0 < 4A < 4B < 4C < 5; recompute it).
- BI-RADS **6 is never allowed** from AI (it requires a known biopsy result). Strip it if it appears.
- Recommendations are **not** written by the model; map them deterministically from `overallBirads`:
  - 0 → "Qo'shimcha tekshiruv: qo'shimcha proyeksiyalar va/yoki ko'krak bezi UTT"
  - 1, 2 → "Yoshga mos muntazam skrining"
  - 3 → "6 oydan keyin nazorat mammografiyasi"
  - 4A/4B/4C, 5 → "To'qima biopsiyasi (UTT yoki stereotaksik nazorat ostida)"
- `region` coordinates are clamped to 0–1; drop regions whose view is not in the study.

### Confidence gate (safety rule #3)
If any of these is true → **do not show a draft**. Save it with `gated = true`, set study status `NEEDS_ATTENTION`, show a red card "Shifokor e'tibori kerak" with `attentionReasons` and an empty structured template the doctor fills in manually:
- `imageCheck.isMammogram === false` (message: "Yuklangan tasvir mammografiya emas")
- `imageCheck.quality === "inadequate"`
- `overallConfidence < 0.6` (constant `CONFIDENCE_THRESHOLD` in one config file, shown on the model card)
- any finding with BI-RADS 4C/5 features but confidence < 0.6 (conflicting signal)
The doctor can still click "Baribir qoralamani ko'rsatish" — logged as an audit event.

### System prompt (put in `src/lib/mammo-ai.ts`)
```
You are an assistant that drafts mammography reports for a board-certified breast radiologist.
You do NOT make diagnoses. Your output is a draft that a radiologist will review, edit and approve.

Input: up to 4 mammography views labelled R-CC, L-CC, R-MLO, L-MLO, patient age, indication and clinical info.

Steps:
1. imageCheck: decide if the images are mammograms, list the views you actually see, rate technical quality.
   If they are not mammograms or quality is inadequate, say so, set overallConfidence low and stop describing findings.
2. Assess breast composition using ACR BI-RADS 5th edition categories A–D.
3. For each breast, list findings using ONLY BI-RADS lexicon terms (mass: shape/margin/density; calcifications:
   morphology/distribution; asymmetry; architectural distortion; associated features).
   Give location as quadrant + clock face + depth. Correlate CC and MLO views; a finding seen on one view only must say so.
   Give sizeMm only if you can reasonably estimate it, otherwise null.
4. Suggest a BI-RADS category per breast (0, 1, 2, 3, 4A, 4B, 4C, 5). Never use 6.
5. Give honest per-finding confidence and overallConfidence (0–1). If you are unsure, say so: a low-confidence
   honest draft is better than a confident wrong one. Never invent findings to fill the report.
   If you see nothing abnormal, return empty findings and BI-RADS 1 — do not hedge with vague "possible" findings.
6. List attentionReasons for anything the radiologist must look at personally.
Write all descriptive text in Uzbek (Latin script); keep BI-RADS terms in English in parentheses.
Do not write recommendations — the system adds them. Return only JSON matching the schema.
```

### Report template (`renderMammoReport`, Uzbek)
```
MAMMOGRAFIYA XULOSASI (AI QORALAMASI — SHIFOKOR TASDIG'IGA QADAR RASMIY EMAS)
Tekshiruv kodi: MG-2026-0001        Sana: …
Ko'rsatma: Skrining | Diagnostik.   Klinik ma'lumot: …
Texnika: Ikki tomonlama mammografiya, CC va MLO proyeksiyalar. Sifati: …
Ko'krak bezi tuzilishi: ACR B — tarqoq fibroglandulyar to'qima.
O'ng ko'krak bezi: … (yoki "O'choqli o'zgarishlar aniqlanmadi.")
Chap ko'krak bezi: …
Qo'ltiq osti limfa tugunlari: …
Oldingi tekshiruv bilan solishtirish: …
XULOSA: … BI-RADS 4A (o'ng), BI-RADS 1 (chap). Umumiy: BI-RADS 4A.
TAVSIYA: …
Shifokor: ____________   Tasdiqlangan: ____________
```
After approval the header changes to "MAMMOGRAFIYA XULOSASI" and shows the doctor's name and approval time.

## 4. Doctor workspace (`/doctor/studies/[id]`)
- **Left: viewer** (extend `image-viewer.tsx`): 2×2 grid in standard hanging order (R-MLO, L-MLO top; R-CC, L-CC bottom, right breast on the viewer's left), click to enlarge one view, zoom/pan, window/contrast slider, invert, ruler in mm when `pixelSpacing` exists. Toggle "AI belgilari" shows finding `region` boxes, colored by confidence, labelled with finding id. Clicking a finding in the editor highlights its box and vice versa.
- **Right: structured editor**, not a free-text blob:
  - Composition select A–D.
  - Per breast: list of finding cards (type, location, size, descriptors, description). Each card has **Qabul qilish / Tahrirlash / O'chirish**; doctor can add new findings ("Topilma qo'shish") and draw a box on the image for it (P1).
  - BI-RADS select per breast; overall BI-RADS recomputed live; recommendation auto-updated (doctor may override text).
  - Impression textarea.
  - Live preview of the rendered text; a "Matn rejimi" tab for final wording edits of the rendered text.
  - Low-confidence findings (< 0.6) have an amber border and the tooltip "AI ishonchi past — diqqat bilan tekshiring".
- Persistent banner: "AI qoralamasi — tashxis emas. Yakuniy xulosa uchun shifokor javobgar."
- Autosave every few seconds (status `IN_REVIEW`, `REPORT_EDITED` audit entry with a compact diff; debounce so the log is not spammed — one entry per save, max one per 30 s, plus on approve).
- **Tasdiqlash** (approve): modal with checkbox "Men tasvirlarni shaxsan ko'rib chiqdim va xulosa uchun javobgarlikni o'z zimmamga olaman" + re-enter password (simple re-auth). Blocked if any AI finding is still in "not reviewed" state — every AI finding must be accepted, edited or deleted. On approve: compute `editStats`, save, lock, audit `REPORT_APPROVED`, redirect to the printable report.
- "Qayta yaratish" button regenerates the draft as a new `Draft.version` (only before approval).

## 5. Audit log (safety rule #2)
- Table: time, doctor, study code, action, short details. Click a row → JSON details including the diff (AI value → doctor value).
- Per study, a timeline tab in the workspace: "AI taklif qildi → Shifokor o'zgartirdi → Tasdiqlandi".
- CSV export (reuse the approach of `api/teacher/export`).

## 6. Model card (safety rule #4, `/doctor/model-card`)
Static section (content in a TS constant):
- Model: Claude (`ANTHROPIC_MODEL` value), general-purpose multimodal LLM, **not trained or certified specifically for mammography, not a registered medical device**. Intended use: drafting aid for a qualified radiologist; not for use without human review; not for screening decisions on its own.
- Data: which public datasets were used for demo and internal evaluation (see DATA), their licenses.
- Known limitations: weak on subtle microcalcifications and small masses, no comparison with priors unless provided, size estimates are approximate, quality depends on image resolution, lower reliability on dense breasts (ACR C/D).
- Confidence threshold value and what happens below it.
- Data protection: anonymization steps; images sent to the AI provider are anonymized PNGs only. State honestly: **for production, model hosting must move to servers in Uzbekistan** (per project requirement) — the external API is for the hackathon demo only.
Live section (from DB): number of drafts, % gated, median latency, % approved without finding changes, % with BI-RADS changed by the doctor, most frequently deleted finding types (= likely false positives) and most frequently added types (= likely misses). Show with recharts (reuse `src/components/charts.tsx`).

## 7. Link to the trainer (nice demo moment, P1)
On an approved report: button "Ta'lim uchun keys sifatida yuborish" → creates an unpublished `Case` (modality `XRAY`, bodyRegion "Ko'krak bezi") with the anonymized images and the **doctor-approved** text as `referenceReport`, owned by a teacher chosen from a list. The teacher publishes it via the existing wizard. Never use unapproved AI drafts as reference.

# OFFLINE FALLBACK
`src/lib/mammo-offline.ts`: when there is no API key, return a pre-written realistic `MammoDraft` for each seeded study (keyed by study code), and for new uploads a generic gated result ("Oflayn rejim: AI mavjud emas, shablon bo'yicha to'ldiring"). Label drafts "Oflayn qoralama" in the UI. The full doctor flow (edit, approve, audit) must work offline.

# DATA (seed + evaluation)
- Seed `doctor@demo.uz` and **5 demo studies** with PNG images in `public/seed/mammo/`: (1) normal ACR B, BI-RADS 1; (2) benign calcifications, BI-RADS 2; (3) circumscribed oval mass, BI-RADS 3; (4) spiculated mass, BI-RADS 5; (5) poor-quality/non-mammogram image to demo the confidence gate. Include one study already APPROVED with a realistic audit trail and edits, so dashboard/model-card charts are not empty.
- Like the education seed, generate SVG placeholders when real PNGs are missing; a real file with the same base name takes priority (`mg-normal-rcc.png`, etc.). Document this in README.
- Candidate open datasets (**check each license before use; note it on the model card**):
  - **CBIS-DDSM** (TCIA) — scanned film mammograms with ROI and BI-RADS-related descriptors; good for demo images and regions.
  - **VinDr-Mammo** (PhysioNet, credentialed access) — 5 000 full-field digital studies with BI-RADS, density and finding boxes; best for evaluation.
  - **mini-MIAS** — small, easy to download, low resolution; fine for quick demo.
  - **INbreast** — high quality, access by request.
- `scripts/mammo/build_cases.py`: converts a chosen dataset subset to PNG + a JSON manifest (laterality, view, BI-RADS, density, boxes) and writes `prisma/real-cases/mammo/*.json`; extend `npm run import:real` (or add `import:mammo`) to load them.
- `scripts/mammo/evaluate.ts` (P1): runs the draft pipeline on N labelled studies and prints: BI-RADS category agreement, sensitivity for "suspicious" (BI-RADS ≥ 4) vs ground truth, density agreement, % gated, median latency. Results feed the model card ("aniqlik" numbers must come from this script, never invented).

# SECURITY & ETHICS CHECKLIST (must all be true at demo time)
1. **Human in the loop**: no code path turns a Draft into an APPROVED Report without the doctor's explicit approve action. AI text is always marked as a draft.
2. **Audit log**: every AI suggestion and every doctor change is logged, append-only.
3. **Confidence gate**: low confidence / bad image → no draft, "Shifokor e'tibori kerak".
4. **Model card** is public inside the app and honest about limitations.
5. **Data protection**: no PHI fields, DICOM tags stripped, originals not stored, only anonymized downscaled PNGs sent to the AI, API key server-only, files served only to authenticated DOCTORs who own the study (check ownership in `api/files` for mammo files).
6. AI never outputs BI-RADS 6 and never writes treatment advice.

# BUILD ORDER
1. Role DOCTOR, middleware, seed account, empty `/doctor` shell in `app-shell` navigation.
2. Prisma models + migration + zod types (`MammoDraft`, statuses).
3. Upload wizard + `imaging.ts` (PNG/JPG first, then DICOM uncompressed, then the Python converter for compressed).
4. `mammo-ai.ts` + JSON schema + server-side rules + `renderMammoReport` + offline fallback.
5. Workspace: viewer grid + structured editor + approve flow.
6. Audit log page + CSV export.
7. Model card + dashboard charts.
8. Seed demo studies, README section "Shifokor yordamchisi".
9. P1: region drawing, prior comparison, send-to-trainer, evaluation script, addendum.

# ACCEPTANCE CRITERIA (demo script, ~3 minutes)
1. Log in as `doctor@demo.uz` → dashboard with real numbers.
2. "Yangi tekshiruv" → enter age 52, Diagnostik, "o'ng ko'krak bezida paypaslanadigan hosila" → upload 4 PNG views → "Qoralama yaratish".
3. In ≤ 15 s a structured draft appears; AI boxes show on the right breast; overall BI-RADS and recommendation are filled automatically.
4. Doctor edits one finding's size, deletes one false finding, changes BI-RADS 4A → 4B; recommendation updates live.
5. Approve with checkbox + password → printable report without the "QORALAMA" header.
6. Audit tab shows "AI taklif qildi → 3 ta o'zgarish → Tasdiqlandi" with the diff.
7. Upload a chest X-ray instead of a mammogram → red "Shifokor e'tibori kerak: yuklangan tasvir mammografiya emas", no draft.
8. Model card shows limitations and live metrics.
9. With `ANTHROPIC_API_KEY` empty, steps 1–6 still work in "Oflayn" mode.
10. Student/teacher flows of the education module still work unchanged.
