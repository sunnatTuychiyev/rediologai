# RadiologAI — Ta'lim

A training platform where medical students read a radiology image (X-ray, CT or MRI), write their own report, and get instant AI feedback that compares it with the real doctor's reference report. Teachers upload cases and see group statistics.

The UI is in Uzbek (Latin script). Code and comments are in English.

## Setup

```bash
npm i
cp .env.example .env          # then fill in ANTHROPIC_API_KEY
npx prisma migrate dev        # creates prisma/dev.db and runs the seed automatically
npx prisma db seed            # (re)seed demo data at any time
npm run dev                   # http://localhost:3000
```

Set `NEXTAUTH_SECRET` to a random string, for example with `openssl rand -hex 32`.

**Without `ANTHROPIC_API_KEY`**, the app still works. It falls back to a deterministic offline lexical matcher (`src/lib/offline-ai.ts`) that returns the same JSON shape. Results from this fallback are labelled "Oflayn baholash" in the UI. It is good enough for a UI demo, but it is much weaker than the LLM, so set a key for the real demo.

## AI model

The app uses the Claude API. `ANTHROPIC_MODEL` defaults to `claude-opus-5-5`; `ANTHROPIC_EFFORT` (default `low`) trades speed for depth: `low` is fastest, `medium`/`high` grade more carefully but take longer. Claude models don't accept `temperature`, so consistency comes from the JSON schema and the server-side rubric.

## Demo accounts (password: `demo1234`)

| Role | Email |
|---|---|
| Teacher | `teacher@demo.uz` |
| Students | `student1@demo.uz` … `student6@demo.uz` |
| Radiologist (mammography assistant) | `doctor@demo.uz` |

The group join code for `/register` is **`RAD4-1`**.

## Replacing placeholder images

`npx prisma db seed` generates SVG placeholders in `public/seed/`. To use real images (for example from open datasets), drop a `.png`, `.jpg`, `.jpeg` or `.webp` file with the **same base name** into `public/seed/` and run the seed again. A real image takes priority over the SVG.

- X-ray: `cxr-normal`, `cxr-pneumonia`, `cxr-effusion`, `cxr-cardiomegaly`, `cxr-pneumothorax`, `cxr-tb`
- CT (8 slices): `ct-nodule-01` … `ct-nodule-08`, `ct-ich-01` … `ct-ich-08`
- MRI (6 slices): `mri-ms-01` … `mri-ms-06`, `mri-disc-01` … `mri-disc-06`

If a real study has a different number of slices, change `slices` in `prisma/seed-data.ts`.

## Architecture

```
src/
  app/
    login, register                 auth pages
    student/                        dashboard, cases list, exercise screen, result, history
    teacher/                        dashboard, cases CRUD + 4-step wizard, students, analytics, groups, assignments
    api/
      auth/[...nextauth]            NextAuth (Credentials + bcrypt, JWT session with role)
      submissions                   POST: validate → save PENDING → evaluate → DONE/ERROR
      submissions/[id]/retry        re-run a failed evaluation
      upload                        teacher image upload (PNG/JPG/WEBP ≤10 MB) → public/uploads
      files/[name]                  serves uploaded files (also works under `next start`)
      teacher/export                CSV export
  lib/
    ai.ts            Claude API calls (server-only, @anthropic-ai/sdk): prompts, json_schema structured output,
                     effort from ANTHROPIC_EFFORT, server-side refusal fallback, 60 s timeout, 1 retry
    scoring.ts       server-side rubric. Recomputes the score from findingResults/extraStatements
    offline-ai.ts    no-key fallback (also used by the seed to build realistic evaluations)
    evaluate.ts      runs an evaluation for a submission and persists it
    types.ts         zod schemas for every input and for the AI output
    stats.ts / analytics.ts   dashboard aggregations
  middleware.ts      /student/* → STUDENT only, /teacher/* → TEACHER only
prisma/
  schema.prisma      SQLite. Enum and JSON fields are strings so the schema stays Postgres-compatible
  seed.ts, seed-data.ts   1 teacher, 1 group, 6 students, 10 cases, about 40 submissions, 1 assignment
```

### AI pipeline

The AI never sees the image. It only compares text.

1. **Extraction** (teacher saves a case). The `extractReferenceFindings` server action turns the doctor's report into `{findings[], impression, recommendations}`. The teacher reviews and edits the list before publishing.
2. **Evaluation** (student submits). The model receives the clinical info, the reference report, the reference findings and the student's report. It returns structured JSON in Uzbek.
3. **Scoring** (`lib/scoring.ts`). The server does not trust the model's arithmetic:
   - Findings: 50 points, weighted critical 3, major 2, minor 1. Partial earns half.
   - Impression: 25 / 12 / 0.
   - Accuracy: 10 points, minus 5 per incorrect statement and 3 per overcall.
   - Structure: the model's judgement, clamped to 0–15.
   - A missed critical finding caps the total at 60.

   The finding list is always aligned to the reference: unknown keys are dropped and missing findings count as `missed`.

### Security notes

- `ANTHROPIC_API_KEY` is only read in server code (`import "server-only"`).
- The exercise page and the cases list select only safe columns. The title, reference report and findings are never sent before submission. The title is hidden because it reveals the diagnosis.
- Students can only open their own submissions. Teachers can only see submissions for their own cases and students in their groups.
- All inputs are validated with zod. Reports must be 30–8000 characters.
- Uploaded files are served only by a strict UUID file-name pattern, which blocks path traversal.

### Moving to Postgres

Change `provider` to `"postgresql"` in `schema.prisma` and set `DATABASE_URL`. Optionally, turn the string enum fields into native `enum`s and the JSON strings into `Json`.

## Feature status

- **P0, all done.** Auth and roles, seed, case wizard with drag-and-drop upload and AI extraction, image viewer (zoom, pan, brightness/contrast, invert, slices with arrow keys and Shift+wheel, fullscreen), AI evaluation with retry, result page (score, findings table, highlighted side-by-side view, improved report, tips), student dashboard, teacher dashboard, students table.
- **P1, done.** Finding regions (drawn in wizard step 4, shown on the result image as red/amber/green boxes), groups, assignments with PRACTICE/EXAM mode (one attempt, countdown, feedback hidden until the deadline), heatmap, CSV export, recommended next case.
- **P2, not started.** DICOM, voice input, Russian UI.

## Shifokor yordamchisi — mammography draft reports (part 2)

A radiologist uploads a mammography study (DICOM or PNG/JPG/WEBP), enters short clinical info and gets a structured Uzbek draft report (BI-RADS based) in about 5–15 s. The doctor edits it next to the images and approves it. **Only an approved report is official.** Every AI suggestion and every doctor change goes to an append-only audit log. Spec: `RadiologAI_shifokor_prompt.md`.

Log in as `doctor@demo.uz` / `demo1234`. The seed creates 11 demo studies (8 approved with an audit trail, 2 drafts waiting for review, 1 blocked "not a mammogram").

### Demo script

1. `/doctor` → **Yangi tekshiruv** → age 52, *Diagnostik*, "o'ng ko'krak bezida paypaslanadigan hosila".
2. Step 2: click **Demo to'plam → Noto'g'ri shakldagi hosila** (or drag files from `/demo/mammo/index.html`) → **Qoralama yaratish**.
3. The draft appears with AI boxes on the images. Edit a size, delete the false left-side asymmetry and change BI-RADS; the recommendation updates live.
4. **Tasdiqlash** → checkbox + password → printable report (`window.print()` → PDF).
5. **Tarix** tab / `/doctor/audit`: AI suggestion → changes → approval.
6. Upload `mg-not-mammo-rcc.png` → red **Shifokor e'tibori kerak** card, no draft.
7. `/doctor/model-card`: limitations, evaluation result and live metrics.

Without `ANTHROPIC_API_KEY` the whole flow works offline. Demo files (`mg-<slug>-<view>.png`) get pre-written drafts; any other upload gets a blocked, empty template.

### Pipeline

```
upload ─► src/lib/imaging.ts ─► storage/mammo/<uuid>.png (viewer) + <uuid>-ai.jpg (≤1568 px, for the AI)
          DICOM: dicom-parser, rescale + VOI window, MONOCHROME1 invert, baseline JPEG via sharp
          PHI tags dropped (names only written to the audit log), original never stored, magic-byte check
draft  ─► src/lib/mammo-ai.ts   Claude vision + strict JSON schema (flat, no unions: API limit)
       ─► src/lib/mammo-rules.ts  server rules: overall BI-RADS = worst side, never 6,
                                  recommendations from a fixed BI-RADS table, region clamping,
                                  confidence gate (not a mammogram / inadequate / confidence < 0.6 /
                                  high-risk feature with low confidence) → NEEDS_ATTENTION + empty template
       ─► renderMammoReport(): deterministic Uzbek template
review ─► src/app/doctor/studies/[id]/workspace.tsx  2×2 hanging viewer + structured editor, autosave
approve ─► src/app/doctor/actions.ts  password re-check + responsibility checkbox, every AI finding
           must be accepted/edited/deleted; report + audit entry in one transaction; read-only afterwards
```

- Mammography files are served only through `/api/doctor/files/<name>`, and only to the doctor who owns the study. `storage/` is git-ignored.
- An approved report can be sent to the trainer as an **unpublished** case for a chosen teacher (images are copied, the doctor-approved text becomes the reference report).

### Real data and evaluation

```bash
# compressed DICOM (JPEG 2000 / JPEG-LS) → PNG named <name>_<R|L>_<CC|MLO>.png
python scripts/mammo/dicom_to_png.py in_dir/ out_dir/

# CBIS-DDSM (TCIA, CC BY 3.0) → public/seed/mammo/cbis/*.png + prisma/real-cases/mammo/cbis.json
python scripts/mammo/build_cases.py <dicom_root> <csv_root> --limit 40
npm run import:mammo           # load them as studies for doctor@demo.uz
npm run eval:mammo             # BI-RADS agreement, sensitivity/specificity for ≥4A, density, gated %, latency
npm run eval:mammo -- --demo   # same on the synthetic demo set (pipeline check, not clinical)
npm run seed:mammo             # re-seed only the doctor module
```

`eval:mammo` writes `storage/eval/mammo-latest.json`, and the model card reads it. Accuracy numbers come only from this script. The Python scripts were not run in the build environment (no pydicom), so treat them as untested.

To use real images for the seeded demo studies, put `public/seed/mammo/mg-<slug>-<rcc|lcc|rmlo|lmlo>.png` there and re-seed. The offline drafts' boxes are drawn for the synthetic images, so they will not line up with real ones.

### Honest limitations

- The model is a general multimodal LLM. It is not trained or certified for mammography and is not a registered medical device. On the synthetic demo set it over-called benign calcifications once, and breast density agreement was low.
- The hackathon demo calls an external API. The project requirement (servers in Uzbekistan) means production needs a self-hosted model.
- Not done (P1/roadmap): doctor drawing boxes for their own findings, side-by-side prior images (only the prior approved report text is passed to the AI), addendum after approval, ultrasound/MRI/DBT.

## Mammography model engine (image analysis model + Claude for text)

Since the last update the draft is no longer written by Claude looking at the image. A specialised open model analyses the image, and Claude only turns the model's numbers into readable Uzbek text.

```
upload → storage/mammo/<uuid>.png
  ML service (ml/server.py, 127.0.0.1:8765, PyTorch, MPS/CUDA/CPU)
    ianpan/mammo-crop      background crop
    ianpan/mammoscreen     3× EfficientNetV2-S ensemble → per-breast cancer probability + density (ACR A–D)
    CAM                    where the model "looked" → heatmap (<uuid>-heat.png) + attention box
    mammogram check        geometric heuristic (a chest X-ray etc. is rejected → "Shifokor e'tibori kerak")
  src/lib/mammo-model.ts   probability → risk level and BI-RADS *suggestion* (the model does not give BI-RADS):
                           <0.72% → 1 · 0.72–1.84% → 0 · ≥1.84% → 4A · ≥10% → 4B · ≥40% → 4C
                           "confidence" = ensemble agreement (how many of the 3 nets agree on the risk level)
  src/lib/mammo-report-writer.ts  Claude (no image!) writes the Uzbek text from the numbers; without a key, a template
  → the existing structured editor, approval, audit, PDF
```

The code is not run from HuggingFace (`trust_remote_code` is not used). The architecture is rewritten in `ml/mammo_engine.py` and only the `.safetensors` weights are downloaded, at pinned revisions.

### Setup

```bash
uv venv .venv-ml && uv pip install --python .venv-ml/bin/python torch timm opencv-python-headless pydicom pylibjpeg pylibjpeg-libjpeg pylibjpeg-openjpeg huggingface_hub safetensors pandas openpyxl
export MAMMO_PYTHON=.venv-ml/bin/python
npm run ml:serve                       # downloads the model once (~250 MB) and serves it
```

### Real data and accuracy

```bash
python ml/prepare_cmmd.py --download 4      # CMMD (TCIA, CC BY 4.0): biopsy-confirmed benign/malignant, ~1 GB
python ml/prepare_dmid.py --per-class 40    # DMID (CC BY 4.0): normal / malignant
npm run ml:eval -- --dataset cmmd           # → storage/eval/model-cmmd.json
npm run ml:eval -- --dataset dmid           # → storage/eval/model-dmid.json
npm run import:cmmd -- --count 8            # 8 real studies for doctor@demo.uz + model drafts (needs ml:serve)
```

Accuracy is shown in the workspace "Model natijasi" panel, on the model card and in the PDF. Two numbers are shown side by side: the author's published result (RSNA test, AUC 0.945) and our own independent measurement on data the model never saw. For imported CMMD studies the workspace has a "Demo: biopsiya natijasini ko'rsatish" button that reveals the biopsy label.

### Print / PDF

**Chop etish** creates the PDF on the server (`/api/doctor/studies/[id]/pdf`, pdf-lib + DejaVu font), saves the file and opens the printer dialog. The PDF contains images with AI boxes, model results and accuracy, the report text, and the signature. An unapproved report is marked with a "QORALAMA" watermark. Every PDF export is written to the audit log.
