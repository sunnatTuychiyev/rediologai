"use server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { MAMMO_DIR } from "@/lib/imaging";
import {
  computeEditStats,
  diffPayload,
  finalText,
  FINDING_TYPE_LABEL,
  describeFinding,
  overallOf,
  payloadFromDraft,
  pendingAiFindings,
  recommendationFor,
  biradsSeverity,
} from "@/lib/mammo-rules";
import { getOwnedStudy, nextStudyCode, readPayload, renderMetaFor } from "@/lib/mammo-study";
import { imageMetaSchema, mammoDraftSchema, reportPayloadSchema, studyInputSchema, type ReportPayload, type StudyInput } from "@/lib/mammo-types";
import { parseJson } from "@/lib/utils";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const AUDIT_EDIT_MIN_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Tekshiruv
// ---------------------------------------------------------------------------
export async function createStudy(input: StudyInput): Promise<Result<{ id: string; code: string }>> {
  const user = await requireUser("DOCTOR");
  const parsed = studyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" };
  const d = parsed.data;
  if (d.priorStudyId) {
    const prior = await prisma.study.findFirst({ where: { id: d.priorStudyId, doctorId: user.id } });
    if (!prior) return { ok: false, error: "Oldingi tekshiruv topilmadi" };
  }
  // Kod noyob bo'lishi kerak — parallel so'rovlarda bir-ikki marta qayta urinamiz
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextStudyCode();
    try {
      const study = await prisma.study.create({
        data: { code, doctorId: user.id, patientAge: d.patientAge, indication: d.indication, clinicalInfo: d.clinicalInfo, priorStudyId: d.priorStudyId },
      });
      await logAudit(user.id, "STUDY_CREATED", study.id, { code, indication: d.indication, hasPrior: Boolean(d.priorStudyId) });
      return { ok: true, data: { id: study.id, code } };
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  return { ok: false, error: "Tekshiruv yaratilmadi" };
}

export async function updateStudyInfo(id: string, input: StudyInput): Promise<Result> {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(id, user.id);
  if (!study) return { ok: false, error: "Tekshiruv topilmadi" };
  if (study.report?.status === "APPROVED") return { ok: false, error: "Tasdiqlangan tekshiruvni o'zgartirib bo'lmaydi" };
  const parsed = studyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" };
  const d = parsed.data;
  if (d.priorStudyId === id) return { ok: false, error: "Tekshiruv o'zini oldingi sifatida tanlay olmaydi" };
  await prisma.study.update({ where: { id }, data: { patientAge: d.patientAge, indication: d.indication, clinicalInfo: d.clinicalInfo, priorStudyId: d.priorStudyId } });
  return { ok: true };
}

export async function updateImageViews(id: string, meta: { id: string; laterality: "R" | "L"; view: "CC" | "MLO" | "OTHER" }[]): Promise<Result> {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(id, user.id);
  if (!study) return { ok: false, error: "Tekshiruv topilmadi" };
  if (study.drafts.length) return { ok: false, error: "Qoralama yaratilgan — proyeksiyalarni o'zgartirib bo'lmaydi" };
  const parsed = imageMetaSchema.safeParse(meta);
  if (!parsed.success) return { ok: false, error: "Proyeksiyalar noto'g'ri" };
  const ids = new Set(study.images.map((i) => i.id));
  if (!parsed.data.every((m) => ids.has(m.id))) return { ok: false, error: "Tasvir topilmadi" };
  const keys = parsed.data.filter((m) => m.view !== "OTHER").map((m) => `${m.laterality}-${m.view}`);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "Bir xil proyeksiya ikki marta tanlangan" };
  await prisma.$transaction(parsed.data.map((m) => prisma.studyImage.update({ where: { id: m.id }, data: { laterality: m.laterality, view: m.view } })));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Xulosa: avtosaqlash
// ---------------------------------------------------------------------------
function validatePayload(payload: ReportPayload) {
  const parsed = reportPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  // Shifokor qo'shgan topilmalar uchun id larni server tekshiradi
  const ids = new Set<string>();
  for (const side of ["right", "left"] as const) {
    for (const f of parsed.data.breasts[side].findings) {
      if (ids.has(f.id)) return null;
      ids.add(f.id);
    }
  }
  return parsed.data;
}

export async function saveReport(studyId: string, payload: ReportPayload): Promise<Result<{ text: string; savedAt: string }>> {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(studyId, user.id);
  if (!study?.report) return { ok: false, error: "Xulosa topilmadi" };
  if (study.report.status === "APPROVED") return { ok: false, error: "Xulosa tasdiqlangan — faqat o'qish uchun" };
  const p = validatePayload(payload);
  if (!p) return { ok: false, error: "Xulosa ma'lumotlari noto'g'ri" };

  const prev = readPayload(study.report.payload);
  const text = finalText(p, renderMetaFor(study));
  await prisma.report.update({ where: { id: study.report.id }, data: { payload: JSON.stringify(p), text, status: "IN_REVIEW" } });
  if (study.status === "DRAFT_READY" || study.status === "NEEDS_ATTENTION") await prisma.study.update({ where: { id: studyId }, data: { status: "IN_REVIEW" } });

  // Audit: har saqlashda emas, ko'pi bilan 30 soniyada bir marta. Diff oxirgi audit snapshotiga nisbatan.
  if (diffPayload(prev, p).length) {
    const last = await prisma.auditLog.findFirst({
      where: { studyId, action: { in: ["REPORT_EDITED", "DRAFT_CREATED", "DRAFT_GATED", "DRAFT_REVEALED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!last || last.action !== "REPORT_EDITED" || Date.now() - last.createdAt.getTime() >= AUDIT_EDIT_MIN_INTERVAL_MS) {
      const base = (parseJson<{ snapshot?: ReportPayload }>(last?.details, {}).snapshot ?? prev) as ReportPayload;
      const changes = diffPayload(reportPayloadSchema.safeParse(base).success ? base : prev, p);
      if (changes.length) await logAudit(user.id, "REPORT_EDITED", studyId, { changes, snapshot: p });
    }
  }
  return { ok: true, data: { text, savedAt: new Date().toISOString() } };
}

// ---------------------------------------------------------------------------
// Bloklangan qoralamani ko'rsatish
// ---------------------------------------------------------------------------
export async function revealGatedDraft(studyId: string): Promise<Result> {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(studyId, user.id);
  const draft = study?.drafts[0];
  if (!study?.report || !draft) return { ok: false, error: "Qoralama topilmadi" };
  if (study.report.status === "APPROVED") return { ok: false, error: "Xulosa tasdiqlangan" };
  if (!draft.gated) return { ok: false, error: "Bu qoralama bloklanmagan" };
  const parsed = mammoDraftSchema.safeParse(parseJson(draft.payload, null));
  if (!parsed.success) return { ok: false, error: "Qoralama o'qib bo'lmadi" };
  const payload = payloadFromDraft(parsed.data);
  await prisma.$transaction([
    prisma.draft.update({ where: { id: draft.id }, data: { revealed: true } }),
    prisma.report.update({ where: { id: study.report.id }, data: { payload: JSON.stringify(payload), text: finalText(payload, renderMetaFor(study)) } }),
  ]);
  await logAudit(user.id, "DRAFT_REVEALED", studyId, { draftId: draft.id, confidence: draft.overallConfidence, snapshot: payload });
  revalidatePath(`/doctor/studies/${studyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasdiqlash (inson nazorati — xavfsizlik qoidasi №1)
// ---------------------------------------------------------------------------
export async function approveReport(studyId: string, payload: ReportPayload, password: string, confirmed: boolean): Promise<Result> {
  const user = await requireUser("DOCTOR");
  if (!confirmed) return { ok: false, error: "Javobgarlikni tasdiqlovchi belgini qo'ying" };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !(await bcrypt.compare(password, dbUser.passwordHash))) return { ok: false, error: "Parol noto'g'ri" };

  const study = await getOwnedStudy(studyId, user.id);
  if (!study?.report) return { ok: false, error: "Xulosa topilmadi" };
  if (study.report.status === "APPROVED") return { ok: false, error: "Xulosa allaqachon tasdiqlangan" };
  const p = validatePayload(payload);
  if (!p) return { ok: false, error: "Xulosa ma'lumotlari noto'g'ri" };
  const pending = pendingAiFindings(p);
  if (pending.length) return { ok: false, error: `${pending.length} ta AI topilmasi ko'rib chiqilmagan — qabul qiling, tahrirlang yoki o'chiring` };
  if (!p.breastComposition) return { ok: false, error: "Ko'krak bezi tuzilishini (ACR) tanlang" };
  const imaged = new Set(study.images.map((i) => (i.laterality === "R" ? "right" : "left")));
  if ((imaged.has("right") && !p.breasts.right.birads) || (imaged.has("left") && !p.breasts.left.birads)) return { ok: false, error: "Tasvirlangan har bir tomon uchun BI-RADS ni tanlang" };
  if (!p.impression.trim()) return { ok: false, error: "Xulosa (impression) bo'sh" };

  const at = new Date();
  const text = finalText(p, renderMetaFor(study, { doctorName: dbUser.name, at }));

  // AI qoralamasining dastlabki holati (bloklangan bo'lsa — bo'sh shablon)
  const draft = study.drafts[0];
  const aiDraft = draft ? mammoDraftSchema.safeParse(parseJson(draft.payload, null)) : null;
  const aiPayload = aiDraft?.success && (!draft.gated || draft.revealed) ? payloadFromDraft(aiDraft.data) : readPayload(null);
  const aiText = draft?.renderedText ?? "";
  const editStats = computeEditStats(aiPayload, p, aiText, text);
  const changes = diffPayload(aiPayload, p);

  // Tasdiqlash va audit bitta tranzaksiyada — audit yozuvisiz tasdiq bo'lmaydi.
  await prisma.$transaction([
    prisma.report.update({
      where: { id: study.report.id },
      data: { payload: JSON.stringify(p), text, status: "APPROVED", approvedById: user.id, approvedAt: at, editStats: JSON.stringify(editStats) },
    }),
    prisma.study.update({ where: { id: studyId }, data: { status: "APPROVED" } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        studyId,
        action: "REPORT_APPROVED",
        details: JSON.stringify({ draftId: draft?.id ?? null, birads: overallOf(p), editStats, changes, snapshot: p }),
        createdAt: at,
      },
    }),
  ]);
  revalidatePath("/doctor");
  revalidatePath(`/doctor/studies/${studyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ta'lim modulga keys sifatida yuborish (faqat tasdiqlangan xulosa)
// ---------------------------------------------------------------------------
export async function sendToTrainer(studyId: string, teacherId: string): Promise<Result<{ caseId: string }>> {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(studyId, user.id);
  if (!study?.report || study.report.status !== "APPROVED") return { ok: false, error: "Faqat tasdiqlangan xulosani yuborish mumkin" };
  if (study.report.sentCaseId) return { ok: false, error: "Bu xulosa allaqachon yuborilgan" };
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER" } });
  if (!teacher) return { ok: false, error: "O'qituvchi topilmadi" };

  const p = readPayload(study.report.payload);
  const overall = overallOf(p);
  const importance = (b: string | null) => (biradsSeverity(b) >= biradsSeverity("4A") ? "critical" : biradsSeverity(b) >= biradsSeverity("3") ? "major" : "minor") as "critical" | "major" | "minor";
  const findings = (["right", "left"] as const).flatMap((side) =>
    p.breasts[side].findings.map((f) => ({
      key: `${side === "right" ? "r" : "l"}-${f.type.replace(/_/g, "-")}-${f.id}`,
      text: `${side === "right" ? "O'ng" : "Chap"} ko'krak bezi: ${describeFinding(f)}`.slice(0, 500),
      importance: importance(p.breasts[side].birads),
      category: "finding" as "finding" | "normal_structure",
    })),
  );
  if (!findings.length) findings.push({ key: "no-focal-lesion", text: "Ikkala ko'krak bezida o'choqli o'zgarishlar yo'q", importance: "major", category: "normal_structure" });

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const copied: { url: string; label: string; pixelSpacing: number | null; laterality: string; view: string }[] = [];
  for (const im of study.images) {
    const name = `${randomUUID()}.png`;
    await fs.copyFile(path.join(MAMMO_DIR, im.file), path.join(uploadDir, name));
    copied.push({ url: `/api/files/${name}`, label: `${im.laterality}-${im.view}`, pixelSpacing: im.pixelSpacing, laterality: im.laterality, view: im.view });
  }

  const caseId = await prisma.$transaction(async (tx) => {
    const c = await tx.case.create({
      data: {
        title: `Mammografiya: BI-RADS ${overall ?? "—"} (${study.code})`,
        modality: "XRAY",
        bodyRegion: "Ko'krak bezi",
        difficulty: biradsSeverity(overall) >= biradsSeverity("4A") ? "HARD" : findings.length > 1 ? "MEDIUM" : "EASY",
        clinicalInfo: `Ayol${study.patientAge ? `, ${study.patientAge} yosh` : ""}. ${study.indication === "DIAGNOSTIC" ? "Diagnostik" : "Skrining"} mammografiya. ${study.clinicalInfo}`.trim(),
        referenceReport: study.report!.text,
        referenceFindings: JSON.stringify({ findings, impression: `${p.impression.trim()} BI-RADS ${overall ?? "—"}.`, recommendations: p.recommendationOverride?.trim() || recommendationFor(overall) }),
        tags: JSON.stringify(["mammografiya", `bi-rads ${overall ?? "-"}`.toLowerCase(), ...new Set((["right", "left"] as const).flatMap((s) => p.breasts[s].findings.map((f) => (FINDING_TYPE_LABEL[f.type] ?? f.type).split(" (")[0].toLowerCase())))]),
        isPublished: false,
        createdById: teacher.id,
        images: { create: copied.map((c, i) => ({ url: c.url, order: i, label: c.label, pixelSpacing: c.pixelSpacing })) },
      },
      include: { images: true },
    });
    // AI/ shifokor belgilagan sohalar → ta'limdagi FindingRegion
    const imageByView = new Map(c.images.map((im) => [im.label, im.id]));
    for (const side of ["right", "left"] as const) {
      for (const f of p.breasts[side].findings) {
        if (!f.region) continue;
        const imageId = imageByView.get(f.region.view);
        if (!imageId) continue;
        await tx.findingRegion.create({
          data: { caseId: c.id, imageId, findingKey: `${side === "right" ? "r" : "l"}-${f.type.replace(/_/g, "-")}-${f.id}`, x: f.region.x, y: f.region.y, width: f.region.w, height: f.region.h },
        });
      }
    }
    await tx.report.update({ where: { id: study.report!.id }, data: { sentCaseId: c.id } });
    return c.id;
  });
  await logAudit(user.id, "EXPORTED", studyId, { kind: "trainer-case", caseId, teacherId: teacher.id });
  revalidatePath(`/doctor/studies/${studyId}`);
  return { ok: true, data: { caseId } };
}
