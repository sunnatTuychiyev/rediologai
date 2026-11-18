import "server-only";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { generateMammoDraft } from "./mammo-ai";
import { analyzeWithEngine, draftFromEngine, riskOf, type EngineResult } from "./mammo-model";
import { applyText, writeReportText } from "./mammo-report-writer";
import { markNotImaged, sanitizeDraft } from "./mammo-rules";
import { emptyPayload, finalText, gateReasons, payloadFromDraft, renderMammoReport, viewLabel, type RenderMeta } from "./mammo-rules";
import { reportPayloadSchema, type ReportPayload, type ViewLabel } from "./mammo-types";
import { parseJson } from "./utils";

const HANG_ORDER: ViewLabel[] = ["R-MLO", "L-MLO", "R-CC", "L-CC"];

/**
 * Qoralama dvigateli: "model" (standart) — ixtisoslashgan model tasvirni tahlil qiladi, Claude faqat matn yozadi;
 * "claude-vision" — Claude tasvirni o'zi ko'radi (eski rejim, faqat taqqoslash uchun).
 */
export const DRAFT_ENGINE = (process.env.MAMMO_DRAFT_ENGINE || "model") as "model" | "claude-vision";

type Ctx = { patientAge: number | null; indication: string; clinicalInfo: string; prior: { date: string; text: string } | null };

async function generateModelDraft(images: { label: ViewLabel; file: string; laterality: string; view: string }[], ctx: Ctx) {
  const t0 = Date.now();
  const engine: EngineResult = await analyzeWithEngine(images.map((i) => ({ file: i.file, laterality: i.laterality, view: i.view })));
  const views = images.map((i) => i.label);
  let draft = sanitizeDraft(draftFromEngine(engine, views), views);
  if (engine.notMammogram?.length) {
    draft.imageCheck.isMammogram = false;
    draft.imageCheck.quality = "inadequate";
    draft.imageCheck.qualityNotes = engine.notMammogram.map((n) => `${n.label}: ${n.reason}`).join("; ");
  }
  const written = await writeReportText(engine, draft, ctx);
  draft = applyText(draft, written.text);
  // Topilmasi yo'q tomon uchun model matni "izoh" sifatida
  const sideNotes = {
    right: engine.breasts.R && !draft.breasts.right.findings.length ? written.text.rightText : "",
    left: engine.breasts.L && !draft.breasts.left.findings.length ? written.text.leftText : "",
  };
  const risks = (["R", "L"] as const).map((s) => (engine.breasts[s] ? riskOf(engine.breasts[s]!.cancerProbability) : null));
  return {
    draft,
    engineResult: engine,
    sideNotes,
    source: "AI" as const,
    model: `${engine.model}@${engine.modelRevision} + matn: ${written.writer}`,
    effort: `xavf: ${risks.map((r) => r ?? "-").join("/")}`,
    latencyMs: Date.now() - t0,
    inputTokens: written.tokens[0],
    outputTokens: written.tokens[1],
  };
}

export async function getOwnedStudy(id: string, doctorId: string) {
  const study = await prisma.study.findUnique({
    where: { id },
    include: { images: { orderBy: { order: "asc" } }, report: true, drafts: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!study || study.doctorId !== doctorId) return null;
  return study;
}

export function studyViews(images: { laterality: string; view: string }[]) {
  return images
    .map((i) => viewLabel(i.laterality, i.view) ?? `${i.laterality}-${i.view}`)
    .sort((a, b) => HANG_ORDER.indexOf(a as ViewLabel) - HANG_ORDER.indexOf(b as ViewLabel));
}

export function renderMetaFor(
  study: { code: string; createdAt: Date; indication: string; clinicalInfo: string; patientAge: number | null; images: { laterality: string; view: string }[] },
  approved?: RenderMeta["approved"],
): RenderMeta {
  return {
    code: study.code,
    date: study.createdAt,
    indication: study.indication,
    clinicalInfo: study.clinicalInfo,
    patientAge: study.patientAge,
    views: studyViews(study.images),
    approved: approved ?? null,
  };
}

export function readPayload(raw: string | null | undefined): ReportPayload {
  const parsed = reportPayloadSchema.safeParse(parseJson(raw, null));
  return parsed.success ? parsed.data : emptyPayload();
}

export async function nextStudyCode() {
  const year = new Date().getFullYear();
  const prefix = `MG-${year}-`;
  const last = await prisma.study.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Qoralama yaratadi: AI (yoki oflayn) → server qoidalari → ishonch chegarasi → Draft + Report (IN_REVIEW emas, DRAFT_READY).
 * Hech qachon xulosani tasdiqlamaydi. Xatoni o'zi ushlaydi.
 */
export async function runMammoDraft(studyId: string, userId: string) {
  const study = await prisma.study.findUnique({ where: { id: studyId }, include: { images: { orderBy: { order: "asc" } }, report: true } });
  if (!study) throw new Error("Tekshiruv topilmadi");
  if (study.report?.status === "APPROVED") throw new Error("Tasdiqlangan xulosani qayta yaratib bo'lmaydi");
  if (!study.images.length) throw new Error("Avval tasvir yuklang");

  await prisma.study.update({ where: { id: studyId }, data: { status: "DRAFTING", error: null } });
  await logAudit(userId, "DRAFT_REQUESTED", studyId, { images: study.images.length });

  let prior: { date: string; text: string } | null = null;
  if (study.priorStudyId) {
    const p = await prisma.study.findFirst({ where: { id: study.priorStudyId, doctorId: study.doctorId }, include: { report: true } });
    if (p?.report?.status === "APPROVED") prior = { date: p.createdAt.toISOString().slice(0, 10), text: p.report.text };
  }

  try {
    const images = study.images
      .map((im) => ({ label: viewLabel(im.laterality, im.view), file: im.file, aiFile: im.aiFile, originalName: im.originalName, laterality: im.laterality, view: im.view }))
      .filter((im): im is typeof im & { label: ViewLabel } => im.label !== null);
    if (!images.length) throw new Error("Proyeksiyalar belgilanmagan (O'ng/Chap, CC/MLO)");

    const ctx = { patientAge: study.patientAge, indication: study.indication, clinicalInfo: study.clinicalInfo, prior };
    const res = DRAFT_ENGINE === "claude-vision" ? { ...(await generateMammoDraft({ ...ctx, images })), engineResult: null, sideNotes: null } : await generateModelDraft(images, ctx);
    const reasons = gateReasons(res.draft);
    const gated = reasons.length > 0;
    if (gated) res.draft.attentionReasons = Array.from(new Set([...reasons, ...res.draft.attentionReasons]));
    const meta = renderMetaFor(study);
    const draftPayload = payloadFromDraft(res.draft);
    if (res.sideNotes) draftPayload.sideNotes = res.sideNotes;
    const imagedSides = Array.from(new Set(images.map((i) => (i.laterality === "R" ? "right" : "left")))) as ("right" | "left")[];
    markNotImaged(draftPayload, imagedSides);
    const renderedText = renderMammoReport(draftPayload, meta);
    const version = (await prisma.draft.count({ where: { studyId } })) + 1;

    const draft = await prisma.draft.create({
      data: {
        studyId,
        version,
        source: res.source,
        model: res.model,
        effort: res.effort,
        payload: JSON.stringify(res.draft),
        renderedText,
        overallConfidence: res.draft.overallConfidence,
        gated,
        latencyMs: res.latencyMs,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        engineResult: res.engineResult ? JSON.stringify(res.engineResult) : null,
      },
    });
    // Bloklangan bo'lsa — bo'sh shablon (shifokor qo'lda to'ldiradi), aks holda AI qoralamasi.
    const payload = gated
      ? markNotImaged({ ...emptyPayload(), quality: res.draft.imageCheck.quality, qualityNotes: res.draft.imageCheck.qualityNotes }, imagedSides)
      : draftPayload;
    const text = finalText(payload, meta);
    await prisma.report.upsert({
      where: { studyId },
      create: { studyId, draftId: draft.id, payload: JSON.stringify(payload), text, status: "IN_REVIEW" },
      update: { draftId: draft.id, payload: JSON.stringify(payload), text, status: "IN_REVIEW", editStats: null },
    });
    await prisma.study.update({ where: { id: studyId }, data: { status: gated ? "NEEDS_ATTENTION" : "DRAFT_READY" } });
    await logAudit(userId, gated ? "DRAFT_GATED" : "DRAFT_CREATED", studyId, {
      draftId: draft.id,
      version,
      source: res.source,
      model: res.model,
      effort: res.effort,
      latencyMs: res.latencyMs,
      confidence: res.draft.overallConfidence,
      birads: res.draft.overallBirads,
      findings: res.draft.breasts.right.findings.length + res.draft.breasts.left.findings.length,
      reasons: gated ? reasons : undefined,
      snapshot: payload,
    });
    return { ok: true as const, gated, draftId: draft.id };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : "Noma'lum xatolik";
    console.error("[mammo-draft] failed", studyId, err);
    await prisma.study.update({ where: { id: studyId }, data: { status: "ERROR", error: message } });
    await logAudit(userId, "DRAFT_FAILED", studyId, { error: message });
    return { ok: false as const, error: message };
  }
}
