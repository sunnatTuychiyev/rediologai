/**
 * Shifokor yordamchisi (mammografiya) uchun demo ma'lumotlar.
 *  - public/demo/mammo/*.png — sintetik mammogrammalar (shifokor ularni yuklab demo qilishi mumkin)
 *  - doctor@demo.uz va 5 ta demo + bir nechta tarixiy tasdiqlangan tekshiruv, audit izi bilan
 *
 * Haqiqiy tasvir ishlatish: public/seed/mammo/<base>.(png|jpg|jpeg|webp) ni qo'ying (masalan mg-normal-rcc.png) —
 * u sintetik SVG dan ustun turadi. Eslatma: oflayn qoralamadagi sohalar sintetik tasvirga moslangan.
 *
 * Alohida ishga tushirish (faqat shu modul): npx tsx prisma/seed-mammo.ts
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { DEMO_STUDIES, demoFileBase, type DemoLesion, type DemoStudy } from "../src/lib/mammo-demo";
import { MAMMO_DIR, processUpload } from "../src/lib/imaging";
import { computeEditStats, diffPayload, finalText, gateReasons, payloadFromDraft, renderMammoReport, sanitizeDraft, emptyPayload, overallOf } from "../src/lib/mammo-rules";
import type { ReportPayload, ViewLabel } from "../src/lib/mammo-types";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "public", "seed", "mammo");
const DEMO_DIR = path.join(ROOT, "public", "demo", "mammo");
const W = 1000;
const H = 1300;

// Deterministik PRNG
let state = 7;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296), state / 4294967296);

// ---------------------------------------------------------------------------
// Sintetik mammogramma (SVG -> PNG)
// ---------------------------------------------------------------------------
function lesionSvg(l: DemoLesion, view: "CC" | "MLO") {
  const c = view === "CC" ? l.cc : l.mlo;
  const cx = c.x * W;
  const cy = c.y * H;
  const r = l.r * W;
  switch (l.kind) {
    case "spiculated": {
      const spikes = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
        const len = r * (2.2 + rand() * 1.8);
        return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * len).toFixed(1)}" y2="${(cy + Math.sin(a) * len).toFixed(1)}" stroke="#fff" stroke-width="${(2 + rand() * 2.5).toFixed(1)}" opacity="0.7"/>`;
      }).join("");
      const blob = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const rr = r * (0.75 + rand() * 0.45);
        return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
      }).join(" ");
      return `<g filter="url(#soft)">${spikes}<polygon points="${blob}" fill="#f2f2f2" opacity="0.9"/></g>`;
    }
    case "oval":
      return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.25}" ry="${r}" fill="#e6e6e6" opacity="0.62" filter="url(#edge)"/>`;
    case "calc-coarse":
      return Array.from({ length: 9 }, () => {
        const x = cx + (rand() - 0.5) * r * 2.2;
        const y = cy + (rand() - 0.5) * r * 2.2;
        return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(3 + rand() * 6).toFixed(1)}" ry="${(3 + rand() * 5).toFixed(1)}" fill="#fff"/>`;
      }).join("");
    case "asym":
      return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 2}" ry="${r * 1.4}" fill="#fff" opacity="0.28" filter="url(#wide)"/>`;
  }
}

function mammoSvg(study: DemoStudy, view: ViewLabel, seed: number) {
  const side = view[0] as "R" | "L";
  const proj = view.slice(2) as "CC" | "MLO";
  const outline =
    proj === "CC"
      ? "M1000,110 C620,120 230,330 190,650 C230,970 620,1180 1000,1190 Z"
      : "M1000,0 L700,0 C520,200 230,420 200,760 C215,1030 560,1235 1000,1265 Z";
  const gland =
    proj === "CC"
      ? "M1000,230 C700,240 420,400 360,650 C420,900 700,1060 1000,1070 Z"
      : "M1000,120 C760,240 450,450 390,760 C420,1000 700,1150 1000,1170 Z";
  const k = 1.5 + study.density * 0.6;
  const b = -0.55 + study.density * 0.45;
  const lesions = study.lesions.filter((l) => l.side === side).map((l) => lesionSvg(l, proj)).join("");
  const pectoral = proj === "MLO" ? `<path d="M1000,0 L640,0 Q760,380 1000,800 Z" fill="#a8a8a8" opacity="0.85" filter="url(#soft)"/>` : "";
  const marker = `<text x="${side === "R" ? 48 : W - 48}" y="80" text-anchor="${side === "R" ? "start" : "end"}" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#e8e8e8">${side} ${proj}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="tissue" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.016" numOctaves="5" seed="${seed}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.86  0 0 0 0 0.86  ${k} 0 0 0 ${b}"/>
      <feGaussianBlur stdDeviation="1.4"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="${seed + 3}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.25 0 0 0 0"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="2.5"/></filter>
    <filter id="edge"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="wide"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="45"/></filter>
    <radialGradient id="fat" cx="100%" cy="50%" r="95%">
      <stop offset="0%" stop-color="#5a5a5a"/><stop offset="75%" stop-color="#3b3b3b"/><stop offset="100%" stop-color="#2a2a2a"/>
    </radialGradient>
    <clipPath id="breast"><path d="${outline}"/></clipPath>
    <mask id="gland" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><path d="${gland}" fill="#fff" filter="url(#feather)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="#000"/>
  <g ${side === "L" ? `transform="translate(${W},0) scale(-1,1)"` : ""}>
    <path d="${outline}" fill="url(#fat)"/>
    <g clip-path="url(#breast)">
      <g mask="url(#gland)"><rect width="${W}" height="${H}" filter="url(#tissue)"/></g>
      ${pectoral}
      ${lesions}
      <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.5"/>
    </g>
    <path d="${outline}" fill="none" stroke="#6f6f6f" stroke-width="3"/>
  </g>
  ${marker}
  <text x="${W / 2}" y="${H - 24}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#777">Sintetik demo tasvir — klinik emas</text>
</svg>`;
}

async function ensureDemoImage(study: DemoStudy, view: ViewLabel, seed: number) {
  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  const base = demoFileBase(study.slug, view);
  const out = path.join(DEMO_DIR, `${base}.png`);
  const real = [".png", ".jpg", ".jpeg", ".webp"].map((e) => path.join(SRC_DIR, base + e)).find((p) => fs.existsSync(p));
  if (real) {
    await sharp(real).png().toFile(out);
    return out;
  }
  if (study.kind === "chest") {
    const cxr = [".png", ".jpg", ".jpeg", ".webp", ".svg"].map((e) => path.join(ROOT, "public", "seed", `cxr-normal${e}`)).find((p) => fs.existsSync(p));
    if (!cxr) throw new Error("public/seed/cxr-normal.* topilmadi — avval asosiy seed ni ishga tushiring");
    await sharp(cxr).resize(1000, 1000, { fit: "contain", background: "#000" }).png().toFile(out);
    return out;
  }
  const svg = mammoSvg(study, view, seed);
  fs.writeFileSync(path.join(SRC_DIR, `${base}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}

function writeIndex() {
  const items = DEMO_STUDIES.map(
    (s) =>
      `<li><b>${s.title}</b> (${s.patientAge} yosh) — ${s.views.map((v) => `<a href="${demoFileBase(s.slug, v)}.png" download>${v}</a>`).join(" · ")}<br><small>${s.clinicalInfo}</small></li>`,
  ).join("\n");
  fs.writeFileSync(
    path.join(DEMO_DIR, "index.html"),
    `<!doctype html><html lang="uz"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo mammografiya fayllari</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#0F1E3A;background:#F5F7FB}li{margin:12px 0}a{color:#0B7A8A;font-weight:600}small{color:#5B6B82}</style>
<h1>Demo mammografiya fayllari</h1><p>Sintetik tasvirlar (klinik emas). Yuklab oling va "Yangi tekshiruv" sahifasida tashlang.</p><ul>${items}</ul></html>`,
  );
}

// ---------------------------------------------------------------------------
// Bazaga yozish
// ---------------------------------------------------------------------------
type Plan = {
  slug: string;
  minutesAgo: number;
  outcome: "approved" | "draft" | "gated";
  edit?: (p: ReportPayload) => void;
};

const accept = (p: ReportPayload) => {
  for (const s of ["right", "left"] as const) p.breasts[s].findings = p.breasts[s].findings.map((f) => ({ ...f, review: "accepted" as const }));
};

const PLANS: Plan[] = [
  // Tarixiy tasdiqlanganlar (model kartasi va bosh sahifa statistikasi uchun)
  { slug: "normal", minutesAgo: 60 * 24 * 19, outcome: "approved", edit: accept },
  { slug: "spiculated", minutesAgo: 60 * 24 * 17, outcome: "approved", edit: (p) => {
      accept(p);
      const del = p.breasts.left.findings.find((f) => f.id === "l1");
      if (del) p.deletedAiFindings.push(del);
      p.breasts.left.findings = [];
      p.breasts.left.birads = "1";
      const m = p.breasts.right.findings[0];
      if (m) { m.descriptors.margin = "spiculated"; m.sizeMm = 18; m.review = "edited"; }
      p.breasts.right.birads = "5";
      p.impression = "O'ng ko'krak bezi yuqori-tashqi kvadrantida spikulali chekkali noto'g'ri shakldagi hosila — xavfli o'smaga yuqori shubha.";
    } },
  { slug: "oval-mass", minutesAgo: 60 * 24 * 14, outcome: "approved", edit: accept },
  { slug: "benign-calc", minutesAgo: 60 * 24 * 12, outcome: "approved", edit: (p) => {
      accept(p);
      p.breasts.right.findings.push({
        id: "dseed1", type: "intramammary_lymph_node", description: "Yog' darvozali kichik limfa tuguni.", location: { quadrant: "UOQ", clockFace: "10", depth: "posterior" },
        sizeMm: 6, descriptors: { shape: "oval", margin: "circumscribed", density: "fat-containing", calcMorphology: null, calcDistribution: null },
        seenOnViews: ["R-MLO"], region: null, confidence: 1, origin: "doctor", review: "accepted",
      });
      p.breasts.right.birads = "2";
    } },
  { slug: "normal", minutesAgo: 60 * 24 * 9, outcome: "approved", edit: (p) => { accept(p); p.breastComposition = "C"; } },
  { slug: "spiculated", minutesAgo: 60 * 24 * 7, outcome: "approved", edit: (p) => {
      accept(p);
      const del = p.breasts.left.findings[0];
      if (del) p.deletedAiFindings.push(del);
      p.breasts.left.findings = [];
      p.breasts.left.birads = "1";
      p.breasts.right.birads = "4C";
    } },
  { slug: "benign-calc", minutesAgo: 60 * 24 * 5, outcome: "approved", edit: accept },
  { slug: "normal", minutesAgo: 60 * 24 * 2, outcome: "approved", edit: accept },
  // Bugungi navbat (demo uchun)
  { slug: "not-mammo", minutesAgo: 180, outcome: "gated" },
  { slug: "spiculated", minutesAgo: 95, outcome: "draft" },
  { slug: "oval-mass", minutesAgo: 40, outcome: "draft" },
];

export async function seedMammo(prisma: PrismaClient, passwordHash?: string) {
  console.log("Mammografiya demo tasvirlari…");
  fs.rmSync(MAMMO_DIR, { recursive: true, force: true });
  const processed = new Map<string, { view: ViewLabel; img: Awaited<ReturnType<typeof processUpload>>; name: string }[]>();
  for (const [si, s] of DEMO_STUDIES.entries()) {
    const list = [];
    for (const [vi, v] of s.views.entries()) {
      const file = await ensureDemoImage(s, v, 11 + si * 7 + vi * (v.startsWith("R") ? 1 : 2));
      list.push({ view: v, img: await processUpload(fs.readFileSync(file)), name: path.basename(file) });
    }
    processed.set(s.slug, list);
  }
  writeIndex();

  await prisma.user.deleteMany({ where: { email: "doctor@demo.uz" } });
  const doctor = await prisma.user.create({
    data: { name: "Dr. Kamola Rasulova", email: "doctor@demo.uz", passwordHash: passwordHash ?? (await bcrypt.hash("demo1234", 10)), role: "DOCTOR" },
  });

  const now = Date.now();
  let n = 0;
  for (const plan of PLANS.sort((a, b) => b.minutesAgo - a.minutesAgo)) {
    const demo = DEMO_STUDIES.find((d) => d.slug === plan.slug)!;
    const imgs = processed.get(plan.slug)!;
    const t0 = now - plan.minutesAgo * 60_000;
    const at = (sec: number) => new Date(t0 + sec * 1000);
    n++;
    const code = `MG-${new Date(t0).getFullYear()}-${String(n).padStart(4, "0")}`;

    const study = await prisma.study.create({
      data: {
        code,
        doctorId: doctor.id,
        patientAge: demo.patientAge + (n % 3) * 2,
        indication: demo.indication,
        clinicalInfo: demo.clinicalInfo,
        status: "UPLOADED",
        createdAt: at(0),
        images: {
          create: imgs.map((x, i) => ({
            file: x.img.file, aiFile: x.img.aiFile, originalName: x.name, sourceFormat: x.img.sourceFormat,
            laterality: x.view[0], view: x.view.slice(2), width: x.img.width, height: x.img.height, pixelSpacing: 0.1, order: i, createdAt: at(20 + i * 5),
          })),
        },
      },
      include: { images: true },
    });
    const log = (action: string, sec: number, details: Record<string, unknown>) =>
      prisma.auditLog.create({ data: { userId: doctor.id, studyId: study.id, action, createdAt: at(sec), details: JSON.stringify(details) } });

    await log("STUDY_CREATED", 0, { code, indication: demo.indication, hasPrior: false, seed: true });
    for (const [i, x] of imgs.entries()) {
      await log("IMAGE_UPLOADED", 20 + i * 5, { format: x.img.sourceFormat, laterality: x.view[0], view: x.view.slice(2), width: x.img.width, height: x.img.height });
      await log("ANONYMIZED", 21 + i * 5, { removed: x.img.removedTags, kept: Object.keys(x.img.keptTags), originalStored: false });
    }
    await log("DRAFT_REQUESTED", 60, { images: imgs.length });

    const views = imgs.map((x) => x.view);
    const draft = sanitizeDraft(structuredClone(demo.draft), views);
    const reasons = gateReasons(draft);
    const gated = reasons.length > 0;
    if (gated) draft.attentionReasons = Array.from(new Set([...reasons, ...draft.attentionReasons]));
    const meta = { code, date: study.createdAt, indication: study.indication, clinicalInfo: study.clinicalInfo, patientAge: study.patientAge, views };
    const aiPayload = payloadFromDraft(draft);
    const renderedText = renderMammoReport(aiPayload, meta);
    const d = await prisma.draft.create({
      data: {
        studyId: study.id, version: 1, source: "OFFLINE", model: "demo-seed", effort: "-", payload: JSON.stringify(draft), renderedText,
        overallConfidence: draft.overallConfidence, gated, latencyMs: 0, createdAt: at(62),
      },
    });
    const startPayload = gated ? { ...emptyPayload(), quality: draft.imageCheck.quality, qualityNotes: draft.imageCheck.qualityNotes } : aiPayload;
    await log(gated ? "DRAFT_GATED" : "DRAFT_CREATED", 62, {
      draftId: d.id, version: 1, source: "OFFLINE", model: "demo-seed", latencyMs: 0, confidence: draft.overallConfidence, birads: draft.overallBirads,
      findings: draft.breasts.right.findings.length + draft.breasts.left.findings.length, reasons: gated ? reasons : undefined, snapshot: startPayload,
    });

    if (plan.outcome !== "approved") {
      await prisma.report.create({ data: { studyId: study.id, draftId: d.id, payload: JSON.stringify(startPayload), text: finalText(startPayload, meta), status: "IN_REVIEW", createdAt: at(62) } });
      await prisma.study.update({ where: { id: study.id }, data: { status: gated ? "NEEDS_ATTENTION" : "DRAFT_READY" } });
      continue;
    }

    const final = structuredClone(aiPayload);
    plan.edit?.(final);
    const approvedAt = at(60 * (4 + Math.floor(rand() * 9)));
    const text = finalText(final, { ...meta, approved: { doctorName: doctor.name, at: approvedAt } });
    const editStats = computeEditStats(aiPayload, final, renderedText, text);
    const changes = diffPayload(aiPayload, final);
    if (changes.length) await log("REPORT_EDITED", 150, { changes, snapshot: final });
    await prisma.report.create({
      data: {
        studyId: study.id, draftId: d.id, payload: JSON.stringify(final), text, status: "APPROVED", approvedById: doctor.id, approvedAt,
        editStats: JSON.stringify(editStats), createdAt: at(62),
      },
    });
    await prisma.study.update({ where: { id: study.id }, data: { status: "APPROVED" } });
    await prisma.auditLog.create({
      data: { userId: doctor.id, studyId: study.id, action: "REPORT_APPROVED", createdAt: approvedAt, details: JSON.stringify({ draftId: d.id, birads: overallOf(final), editStats, changes, snapshot: final }) },
    });
  }
  console.log(`Tayyor: 1 rentgenolog (doctor@demo.uz), ${PLANS.length} ta mammografiya tekshiruvi.`);
}

// Alohida ishga tushirilganda
if (require.main === module) {
  const prisma = new PrismaClient();
  seedMammo(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
