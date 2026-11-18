# ROLE
You are a senior full-stack engineer. Build a working MVP web app called **RadiologAI — Ta'lim** during a 48-hour hackathon. Prioritize a stable, polished demo over breadth. Write complete, runnable code (no placeholders like "// TODO implement"). After each major step, make sure `npm run dev` works.

# PRODUCT IN ONE SENTENCE
A training platform where medical students look at a radiology image (X-ray, CT or MRI), write their own radiology report, and get instant AI feedback that compares their report with the real doctor's (reference) report: what they got right, what they missed, what they got wrong, and how a correct report should look. Teachers upload cases with the reference report and see student statistics.

# LANGUAGE
- All UI text in **Uzbek (Latin script)**. Examples: "Kirish", "Mashqlar", "Xulosa yozish", "Yuborish", "Natija", "O'tkazib yuborilgan", "Noto'g'ri", "To'g'ri", "Statistika", "Yangi mashq qo'shish".
- Code, variable names and comments in English.
- AI feedback must be returned in Uzbek (Latin), even if the reference report is in Russian or English.

# TECH STACK (use exactly this unless something blocks you)
- Next.js 14+ (App Router) + TypeScript
- Tailwind CSS + shadcn/ui components, lucide-react icons
- Prisma ORM + SQLite for the hackathon (keep schema Postgres-compatible)
- Auth: NextAuth (Credentials provider, bcrypt-hashed passwords), role-based: STUDENT, TEACHER
- File uploads: store images in `/public/uploads` (local) via a Next.js route handler; accept PNG/JPG/WEBP up to 10 MB each
- AI: OpenAI API via the official `openai` npm package, called ONLY from server-side code. Model name from env `OPENAI_MODEL`. Use JSON structured output (response_format json_schema) and temperature 0.
- Charts: recharts
- Validation: zod

Env vars (`.env.example`):
```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET=change-me
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=
```

# DATA MODEL (Prisma)
- **User**: id, name, email (unique), passwordHash, role (STUDENT | TEACHER), groupId (nullable), createdAt
- **Group**: id, name (e.g. "Radiologiya 4-kurs, 1-guruh"), teacherId
- **Case** (one exercise): id, title, modality (XRAY | CT | MRI), bodyRegion (e.g. "Ko'krak qafasi", "Bosh miya"), difficulty (EASY | MEDIUM | HARD), clinicalInfo (short patient history shown to the student, e.g. "Erkak, 45 yosh, 5 kundan beri isitma va yo'tal"), referenceReport (text written by the real doctor), referenceFindings (JSON, see below), tags (string[] stored as JSON, e.g. ["pnevmoniya","plevrit"]), isPublished (bool), createdById, createdAt
- **CaseImage**: id, caseId, url, order (int), label (optional, e.g. "Aksial kesim 12"). X-ray = usually 1 image; CT/MRI = several slices.
- **FindingRegion** (optional, P1): id, caseId, imageId, findingKey, x, y, width, height (relative 0–1 coordinates) — teacher marks where a finding is on the image.
- **Assignment** (P1): id, title, groupId, caseIds (JSON), mode (PRACTICE | EXAM), timeLimitMin (nullable), startsAt, endsAt, showFeedback (bool; false in exam mode until endsAt)
- **Submission**: id, studentId, caseId, assignmentId (nullable), reportText, durationSec, score (int 0–100), evaluation (JSON, full AI result), status (PENDING | DONE | ERROR), createdAt

`referenceFindings` JSON shape:
```json
{
  "findings": [
    { "key": "rul-consolidation", "text": "O'ng o'pka pastki bo'lagida konsolidatsiya", "importance": "critical" | "major" | "minor", "category": "finding" | "normal_structure" }
  ],
  "impression": "O'ng tomonlama pastki bo'lak pnevmoniyasi",
  "recommendations": "Davolashdan 2 hafta keyin nazorat rentgenografiyasi"
}
```

# AI PIPELINE (most important part — implement carefully)

The AI NEVER looks at the image. It only compares TEXT: the student's report vs. the doctor's reference report. This makes grading reliable and avoids hallucinated diagnoses.

## Step 1 — Extract reference findings (when a teacher saves a case)
Server action `extractReferenceFindings(referenceReport)` → returns `referenceFindings` JSON above. Show the extracted list to the teacher in an editable form (they can fix, delete, add findings, change importance) before saving.

System prompt for extraction:
```
You are an experienced radiologist and medical educator.
You receive a radiology report written by a physician. Extract its content into a structured list.
Rules:
- Split the report into atomic findings: one pathological finding or one explicitly described important normal structure per item.
- Mark importance: "critical" = changes diagnosis or urgent management; "major" = clinically significant; "minor" = minor/incidental.
- Mark category: "finding" for pathology, "normal_structure" for explicitly stated normal findings.
- Extract the final impression (conclusion/diagnosis) and recommendations separately.
- Do NOT add anything that is not in the report. Do NOT infer new diagnoses.
- Write all text in Uzbek (Latin script), keeping standard medical terms (Latin/Russian terms may be given in parentheses).
Return only JSON matching the schema.
```

## Step 2 — Evaluate a student submission
Route handler `POST /api/submissions` → saves Submission with status PENDING → calls the LLM → saves evaluation + score → status DONE. On error set status ERROR and show "Qayta urinish" button. Show a loading state ("AI xulosangizni tekshirmoqda…") — target < 15 seconds.

Input to the model: clinicalInfo, modality, bodyRegion, referenceReport, referenceFindings JSON, studentReport.

System prompt for evaluation:
```
You are a strict but supportive radiology professor grading a student's radiology report.
You are given:
1) the physician's reference report and its structured findings — this is the ground truth;
2) the student's report.
You do NOT see the image. Judge ONLY by comparing the student's text with the reference. Never invent findings that are not in the reference.

For EACH reference finding decide:
- "correct": the student described it correctly (synonyms and different wording are acceptable if the medical meaning is the same);
- "partial": mentioned but with wrong location, side, size, severity or imprecise wording;
- "missed": not mentioned.
Then list student statements that are NOT supported by the reference:
- "incorrect": contradicts the reference (e.g. wrong side, says normal where pathology exists);
- "overcall": describes a pathology that the reference does not mention.

Scoring (total 100):
- Findings detection: 50 points, weighted by importance (critical = 3, major = 2, minor = 1; correct = full weight, partial = half, missed = 0).
- Impression / diagnosis: 25 points (correct = 25, partially correct = 10–15, wrong or missing = 0).
- No incorrect statements / overcalls: 10 points (−5 per incorrect, −3 per overcall, minimum 0).
- Report structure and terminology: 15 points (has technique/description/impression/recommendation sections, uses correct medical terms, clear and concise).
A missed "critical" finding caps the total score at 60.

Feedback rules:
- Write in Uzbek (Latin script), short and specific, addressed to the student ("Siz ...").
- For every missed / partial / incorrect item explain WHY it matters clinically in one sentence.
- Give 2–3 concrete tips for improvement.
- Write an "improvedReport": the student's report rewritten into a correct, well-structured report, based ONLY on reference facts.
Return only JSON matching the schema.
```

Evaluation JSON schema (enforce with structured output):
```json
{
  "score": 0,
  "subscores": { "findings": 0, "impression": 0, "accuracy": 0, "structure": 0 },
  "findingResults": [
    { "key": "rul-consolidation", "referenceText": "...", "importance": "critical", "status": "correct|partial|missed", "studentQuote": "exact quote from student or null", "comment": "..." }
  ],
  "extraStatements": [
    { "studentQuote": "...", "type": "incorrect|overcall", "comment": "..." }
  ],
  "impressionResult": { "status": "correct|partial|wrong|missing", "comment": "..." },
  "structureComment": "...",
  "strengths": ["..."],
  "tips": ["..."],
  "improvedReport": "...",
  "summary": "1–2 sentence overall feedback"
}
```
After receiving the JSON, recompute the score on the server from findingResults/extraStatements using the rubric above (do not trust the model's arithmetic blindly); keep the model's structure subscore.

# STUDENT SIDE (role STUDENT)

1. **/student — Bosh sahifa (dashboard)**
   - Cards: completed exercises, average score, last 7 days activity.
   - Line chart: score over time.
   - "Zaif mavzular": top 3 tags with the lowest average score / most missed findings.
   - "Tavsiya etilgan mashq" button → a case from the weakest tag not yet done.
   - Active assignments from the teacher (P1).

2. **/student/cases — Mashqlar ro'yxati**
   - Filters: modality (Rentgen / KT / MRT), body region, difficulty, status (bajarilgan / bajarilmagan).
   - Card per case: title hidden diagnosis! (show only modality, region, difficulty, clinicalInfo snippet, best score if done).

3. **/student/cases/[id] — Mashq bajarish** (the core screen)
   - Left (≈60%): image viewer
     - zoom (wheel), pan (drag), brightness/contrast sliders, invert, reset
     - for multiple images (CT/MRI slices): slider + arrow keys to scroll, "12 / 40" indicator
     - fullscreen button
   - Right (≈40%): clinical info + report editor
     - textarea with optional template button "Shablonni qo'yish" inserting: "Texnika:\n\nTavsif:\n\nXulosa:\n\nTavsiya:"
     - character counter, timer (counts up; counts down in exam mode)
     - "Yuborish" button (disabled if < 30 characters), confirm dialog
   - Never show the reference report before submission.

4. **/student/submissions/[id] — Natija**
   - Big score circle (color: <50 red, 50–79 yellow, ≥80 green) + subscores bar.
   - Summary sentence.
   - Findings table: each reference finding with status badge (✅ To'g'ri / 🟡 Qisman / ❌ O'tkazib yuborilgan), importance badge, student's quote, comment.
   - "Ortiqcha yoki noto'g'ri fikrlar" list (incorrect / overcall) with comments.
   - Side-by-side view: "Sizning xulosangiz" vs "Shifokor xulosasi", with student quotes highlighted green (correct), yellow (partial), red (incorrect/overcall).
   - "To'g'ri yozilgan namuna" (improvedReport) with copy button.
   - Tips list.
   - Image viewer again; if FindingRegions exist, draw boxes for missed findings in red with labels (P1).
   - Buttons: "Qayta urinish", "Keyingi mashq".
   - In exam mode with showFeedback=false: show only "Javobingiz qabul qilindi".

5. **/student/history** — table of all submissions (date, case, score, link).

# TEACHER SIDE (role TEACHER)

1. **/teacher — Dashboard**
   - Cards: students count, submissions this week, group average score, number of cases.
   - Bar chart: average score per tag/pathology (lowest first) → "Guruh eng ko'p qiynalayotgan mavzular".
   - Table "Eng ko'p o'tkazib yuborilgan topilmalar": finding text, case, miss rate %.
   - Recent submissions feed.

2. **/teacher/cases — Mashqlar** (list with search, filter, publish toggle, edit, delete, duplicate)

3. **/teacher/cases/new and /teacher/cases/[id]/edit — Mashq qo'shish** (step-by-step form)
   - Step 1: title, modality, body region, difficulty, tags, clinical info.
   - Step 2: upload images (drag & drop, multiple, reorder by drag, delete). Preview.
   - Step 3: paste the real doctor's reference report → "AI bilan topilmalarni ajratish" button → editable findings list (text, importance, category; add/remove rows), impression, recommendations.
   - Step 4 (P1): on the image, draw rectangles and link each to a finding.
   - Save as draft / Publish.

4. **/teacher/students — O'quvchilar**
   - Table: name, group, submissions count, avg score, last activity, weakest tag. Sort + search.
   - Click → student detail: score trend chart, per-tag scores, all submissions with link to the full result page (teacher sees the same result screen).

5. **/teacher/analytics — Statistika**
   - Heatmap: students (rows) × tags (columns), cell = average score (color scale).
   - Per-case stats: attempts, average score, most missed finding.
   - Export to CSV.

6. **/teacher/groups and /teacher/assignments (P1)**: create groups, add students (by email), create assignment (choose cases, PRACTICE/EXAM, time limit, dates, show feedback after deadline).

# AUTH & ACCESS
- /login page (email + password), /register for students (choose group code) — teachers are seeded.
- Middleware: /student/* only STUDENT, /teacher/* only TEACHER; API routes check role server-side.
- Students can see only their own submissions. Reference report is never sent to the client on the exercise page (check API responses!).

# SEED DATA (prisma/seed.ts) — needed for the demo
- 1 teacher: teacher@demo.uz / demo1234
- 1 group, 6 students: student1@demo.uz … student6@demo.uz / demo1234
- 10 cases: 6 chest X-ray, 2 CT, 2 MRI, with realistic Uzbek clinical info and reference reports (normal, pneumonia, pleural effusion, cardiomegaly, pneumothorax, lung nodule, tuberculosis-suspected, etc.), pre-filled referenceFindings (do not call the API in seed). Use placeholder images in /public/seed/ (I will replace them with real images from open datasets).
- ~40 fake submissions with varied scores and evaluations so dashboards and charts look alive.

# DESIGN
- Clean medical look: white/light gray background, one accent color (teal/blue), dark mode for the image viewer area (radiologists read on dark backgrounds).
- Sidebar navigation per role, top bar with user name + logout.
- Responsive; the exercise screen must work on a laptop 1366×768 without scrolling the image.
- Toasts for success/error, skeleton loaders, empty states with helpful text.

# PRIORITIES (build in this order)
- **P0 (must work for the demo):** auth + roles, seed, teacher case creation with image upload and AI findings extraction, student exercise screen with image viewer, AI evaluation, result page, student dashboard, teacher dashboard + students table.
- **P1:** finding regions on images, assignments / exam mode, heatmap, CSV export, recommended next case.
- **P2:** DICOM upload, voice input for the report, Russian UI language.

# QUALITY CHECKLIST
- No API keys or reference reports leak to the client.
- LLM call has a 30 s timeout, 1 retry, and graceful error UI.
- Validate all inputs with zod; handle empty/very short reports.
- Score is recomputed server-side from the rubric.
- `README.md`: setup steps (`npm i`, `cp .env.example .env`, `npx prisma migrate dev`, `npx prisma db seed`, `npm run dev`), demo accounts, architecture overview.

Start by printing the folder structure and Prisma schema, then implement P0 step by step.
