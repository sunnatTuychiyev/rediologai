import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { SEED_CASES, type SeedCase } from "./seed-data";
import { offlineEvaluate } from "../src/lib/offline-ai";
import { finalizeEvaluation } from "../src/lib/scoring";
import { importRealCases } from "./import-real-cases";
import { seedMammo } from "./seed-mammo";

const prisma = new PrismaClient();
const SEED_DIR = path.join(process.cwd(), "public", "seed");

// Deterministic PRNG so the demo looks the same after every reset.
let rngState = 42;
function rand() {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

// ---------------------------------------------------------------------------
// Placeholder images (SVG). Drop a real file with the same base name and a
// .png/.jpg/.jpeg/.webp extension into /public/seed and re-run the seed — it wins.
// ---------------------------------------------------------------------------
function placeholderSvg(kind: SeedCase["placeholder"], i: number, n: number) {
  const t = n > 1 ? i / (n - 1) : 0.5;
  const label = `<text x="50%" y="96%" fill="#777" font-family="sans-serif" font-size="18" text-anchor="middle">Namuna rasm — haqiqiy tasvir bilan almashtiring${n > 1 ? ` (${i + 1}/${n})` : ""}</text>`;
  const defs = `<defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#bbb"/><stop offset="100%" stop-color="#333"/></radialGradient>
    <radialGradient id="lung" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#151515"/><stop offset="100%" stop-color="#3a3a3a"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
  let body = "";
  switch (kind) {
    case "chest":
      body = `<rect width="800" height="800" fill="#4a4a4a"/>
        <g filter="url(#blur)">
        <path d="M230 170 Q140 300 160 620 Q260 660 360 610 Q380 380 350 190 Q300 150 230 170Z" fill="url(#lung)"/>
        <path d="M570 170 Q660 300 640 620 Q540 660 440 610 Q420 380 450 190 Q500 150 570 170Z" fill="url(#lung)"/>
        <ellipse cx="430" cy="500" rx="120" ry="130" fill="#9a9a9a" opacity="0.85"/>
        <rect x="380" y="80" width="40" height="600" fill="#a5a5a5" opacity="0.7"/>
        </g>
        ${Array.from({ length: 9 }, (_, k) => `<path d="M170 ${210 + k * 48} Q400 ${170 + k * 48} 630 ${210 + k * 48}" stroke="#7a7a7a" stroke-width="10" fill="none" opacity="0.45"/>`).join("")}`;
      break;
    case "chest-ct":
      body = `<rect width="800" height="800" fill="#000"/>
        <ellipse cx="400" cy="400" rx="330" ry="240" fill="#6d6d6d"/>
        <ellipse cx="270" cy="390" rx="${110 + 30 * Math.sin(t * 3)}" ry="170" fill="#111"/>
        <ellipse cx="530" cy="390" rx="${110 + 30 * Math.cos(t * 3)}" ry="170" fill="#111"/>
        <circle cx="400" cy="${560 - t * 40}" r="38" fill="#ddd"/>
        <ellipse cx="410" cy="420" rx="${60 + t * 40}" ry="70" fill="#8a8a8a"/>
        ${t > 0.3 && t < 0.75 ? `<circle cx="300" cy="300" r="16" fill="#9a9a9a"/>` : ""}`;
      break;
    case "head-ct":
      body = `<rect width="800" height="800" fill="#000"/>
        <ellipse cx="400" cy="400" rx="${250 - Math.abs(t - 0.5) * 120}" ry="${310 - Math.abs(t - 0.5) * 140}" fill="#eee"/>
        <ellipse cx="400" cy="400" rx="${230 - Math.abs(t - 0.5) * 120}" ry="${290 - Math.abs(t - 0.5) * 140}" fill="#666"/>
        <ellipse cx="360" cy="400" rx="20" ry="70" fill="#222"/><ellipse cx="440" cy="400" rx="20" ry="70" fill="#222"/>
        ${t > 0.25 && t < 0.8 ? `<ellipse cx="490" cy="390" rx="55" ry="38" fill="#bbb"/>` : ""}`;
      break;
    case "brain-mri":
      body = `<rect width="800" height="800" fill="#000"/>
        <ellipse cx="400" cy="400" rx="260" ry="320" fill="#555"/>
        <ellipse cx="400" cy="400" rx="230" ry="290" fill="#8d8d8d"/>
        <ellipse cx="370" cy="400" rx="22" ry="80" fill="#eee"/><ellipse cx="430" cy="400" rx="22" ry="80" fill="#eee"/>
        ${Array.from({ length: 5 }, (_, k) => `<ellipse cx="${330 + k * 35}" cy="${330 + ((k * 37 + i * 13) % 140)}" rx="9" ry="14" fill="#f5f5f5"/>`).join("")}`;
      break;
    case "spine-mri":
      body = `<rect width="800" height="800" fill="#111"/>
        ${Array.from({ length: 6 }, (_, k) => `<rect x="${300 + t * 20}" y="${80 + k * 115}" width="150" height="90" rx="14" fill="#7d7d7d"/><rect x="${305 + t * 20}" y="${172 + k * 115}" width="140" height="20" rx="8" fill="${k === 3 ? "#444" : "#cfcfcf"}"/>`).join("")}
        <rect x="${470 + t * 20}" y="60" width="50" height="700" fill="#e5e5e5" opacity="0.8"/>
        <ellipse cx="${465 + t * 20}" cy="${80 + 3 * 115 + 102}" rx="28" ry="14" fill="#444"/>`;
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">${defs}${body}${label}</svg>`;
}

function imageUrlFor(c: SeedCase, i: number) {
  const base = c.slices > 1 ? `${c.slug}-${String(i + 1).padStart(2, "0")}` : c.slug;
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    if (fs.existsSync(path.join(SEED_DIR, base + ext))) return `/seed/${base}${ext}`;
  }
  const svgPath = path.join(SEED_DIR, `${base}.svg`);
  fs.writeFileSync(svgPath, placeholderSvg(c.placeholder, i, c.slices));
  return `/seed/${base}.svg`;
}

// ---------------------------------------------------------------------------
// Fake student reports
// ---------------------------------------------------------------------------
const OVERCALLS = [
  "Chap o'pka pastki bo'lagida o'choqli soya (o'sma) aniqlanadi.",
  "Qovurg'a sinishi belgilari aniqlanadi.",
  "Mediastinal limfa tugunlari kengaygan.",
];

function fakeReport(c: SeedCase, skill: number) {
  const lines: string[] = [];
  if (rand() < skill + 0.2) lines.push(`Texnika: ${c.referenceReport.split("\n")[0].replace(/^Texnika:\s*/, "")}`);
  const desc: string[] = [];
  for (const f of c.referenceFindings.findings) {
    const r = rand();
    if (r < skill) desc.push(f.text + ".");
    else if (r < skill + 0.2) desc.push(f.text.split(" ").slice(0, Math.ceil(f.text.split(" ").length * 0.45)).join(" ") + ".");
  }
  if (rand() > skill + 0.25) desc.push(pick(OVERCALLS));
  lines.push(`Tavsif: ${desc.join(" ") || "Aniq o'zgarishlar ko'rinmadi."}`);
  const ri = rand();
  if (ri < skill) lines.push(`Xulosa: ${c.referenceFindings.impression}.`);
  else if (ri < skill + 0.25) lines.push(`Xulosa: ${c.referenceFindings.impression.split(" ").slice(0, 3).join(" ")}.`);
  else if (ri < skill + 0.4) lines.push("Xulosa: Patologik o'zgarishlar aniqlanmadi.");
  if (rand() < skill) lines.push(`Tavsiya: ${c.referenceFindings.recommendations}.`);
  return lines.join("\n");
}

async function main() {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  console.log("Tozalanmoqda…");
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.findingRegion.deleteMany();
  await prisma.caseImage.deleteMany();
  await prisma.case.deleteMany();
  await prisma.user.updateMany({ data: { groupId: null } });
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const teacher = await prisma.user.create({
    data: { name: "Dr. Nodira Karimova", email: "teacher@demo.uz", passwordHash, role: "TEACHER" },
  });
  const group = await prisma.group.create({
    data: { name: "Radiologiya 4-kurs, 1-guruh", code: "RAD4-1", teacherId: teacher.id },
  });

  const studentDefs = [
    { name: "Aziz Rahimov", skill: 0.72, weak: "o'sma" },
    { name: "Malika Tosheva", skill: 0.6, weak: "pnevmotoraks" },
    { name: "Jasur Yusupov", skill: 0.5, weak: "tuberkulyoz" },
    { name: "Dilnoza Ergasheva", skill: 0.45, weak: "insult" },
    { name: "Sardor Aliyev", skill: 0.35, weak: "kardiomegaliya" },
    { name: "Gulnora Saidova", skill: 0.28, weak: "plevrit" },
  ];
  const students = [];
  for (const [i, s] of studentDefs.entries()) {
    const u = await prisma.user.create({
      data: { name: s.name, email: `student${i + 1}@demo.uz`, passwordHash, role: "STUDENT", groupId: group.id },
    });
    students.push({ ...s, id: u.id });
  }

  console.log("Mashqlar yaratilmoqda…");
  const cases = [];
  for (const c of SEED_CASES) {
    const created = await prisma.case.create({
      data: {
        title: c.title,
        modality: c.modality,
        bodyRegion: c.bodyRegion,
        difficulty: c.difficulty,
        clinicalInfo: c.clinicalInfo,
        referenceReport: c.referenceReport,
        referenceFindings: JSON.stringify(c.referenceFindings),
        tags: JSON.stringify(c.tags),
        isPublished: true,
        createdById: teacher.id,
        images: {
          create: Array.from({ length: c.slices }, (_, i) => ({
            url: imageUrlFor(c, i),
            order: i,
            label: c.slices > 1 ? `Aksial kesim ${i + 1}` : null,
          })),
        },
      },
    });
    cases.push({ ...c, id: created.id });
  }

  console.log("Javoblar yaratilmoqda…");
  const now = Date.now();
  let count = 0;
  for (const s of students) {
    const shuffled = [...cases].sort(() => rand() - 0.5).slice(0, 6 + Math.floor(rand() * 2));
    for (const [k, c] of shuffled.entries()) {
      const attempts = rand() < 0.15 ? 2 : 1;
      for (let a = 0; a < attempts; a++) {
        const skill = Math.min(0.98, s.skill - (c.tags.includes(s.weak) ? 0.35 : 0) + a * 0.15 + (rand() - 0.5) * 0.15);
        const reportText = fakeReport(c, skill);
        const evaluation = {
          ...finalizeEvaluation(
            offlineEvaluate({ referenceFindings: c.referenceFindings, referenceReport: c.referenceReport, studentReport: reportText }),
            c.referenceFindings,
          ),
          source: "offline" as const,
        };
        const daysAgo = 28 - Math.floor((k / shuffled.length) * 27) - a;
        await prisma.submission.create({
          data: {
            studentId: s.id,
            caseId: c.id,
            reportText,
            durationSec: 180 + Math.floor(rand() * 720),
            score: evaluation.score,
            evaluation: JSON.stringify(evaluation),
            status: "DONE",
            createdAt: new Date(now - Math.max(0, daysAgo) * 86_400_000 - Math.floor(rand() * 36_000_000)),
          },
        });
        count++;
      }
    }
  }

  // One demo assignment (P1).
  await prisma.assignment.create({
    data: {
      title: "Ko'krak qafasi rentgenologiyasi — 1-nazorat",
      groupId: group.id,
      caseIds: JSON.stringify(cases.filter((c) => c.modality === "XRAY").slice(0, 3).map((c) => c.id)),
      mode: "PRACTICE",
      startsAt: new Date(now - 86_400_000),
      endsAt: new Date(now + 7 * 86_400_000),
      showFeedback: true,
    },
  });

  console.log(`Tayyor: 1 o'qituvchi, ${students.length} talaba, ${cases.length} mashq, ${count} javob.`);

  console.log("Haqiqiy KT holatlari (prisma/real-cases)…");
  await importRealCases(prisma);

  await seedMammo(prisma, passwordHash);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
