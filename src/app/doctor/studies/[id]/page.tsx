import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedStudy, readPayload, renderMetaFor } from "@/lib/mammo-study";
import { overallOf } from "@/lib/mammo-rules";
import { mammoDraftSchema, type Change, type EditStats } from "@/lib/mammo-types";
import { parseJson } from "@/lib/utils";
import { StudyWizard, type WizardImage } from "../study-wizard";
import { readModelEval } from "@/lib/model-eval";
import type { EngineResult } from "@/lib/mammo-model";
import { Workspace, type TimelineEntry } from "./workspace";

export const dynamic = "force-dynamic";

function summarize(action: string, d: Record<string, unknown>): string {
  switch (action) {
    case "DRAFT_CREATED":
    case "DRAFT_GATED":
      return [
        d.source === "OFFLINE" ? "Oflayn" : `Model: ${d.model}`,
        typeof d.latencyMs === "number" ? `${(d.latencyMs / 1000).toFixed(1)} s` : null,
        typeof d.confidence === "number" ? `ishonch ${Math.round(d.confidence * 100)}%` : null,
        d.birads ? `BI-RADS ${d.birads}` : null,
        typeof d.findings === "number" ? `${d.findings} ta topilma` : null,
        Array.isArray(d.reasons) ? (d.reasons as string[]).join(" ") : null,
      ].filter(Boolean).join(" · ");
    case "REPORT_EDITED":
      return `${(d.changes as unknown[] | undefined)?.length ?? 0} ta o'zgarish`;
    case "REPORT_APPROVED": {
      const s = d.editStats as EditStats | undefined;
      return s ? `${(d.changes as unknown[] | undefined)?.length ?? 0} ta o'zgarish AI qoralamasiga nisbatan · BI-RADS ${s.aiBirads} → ${s.finalBirads}` : "";
    }
    case "IMAGE_UPLOADED":
      return `${d.format} · ${d.laterality}-${d.view} · ${d.width}×${d.height}`;
    case "ANONYMIZED":
      return Array.isArray(d.removed) && d.removed.length ? `Olib tashlandi: ${(d.removed as string[]).join(", ")}. Asl fayl saqlanmadi.` : "Metama'lumotlar olib tashlandi. Asl fayl saqlanmadi.";
    case "DRAFT_FAILED":
      return String(d.error ?? "");
    case "EXPORTED":
      return d.kind === "trainer-case" ? "Ta'lim moduliga keys sifatida" : String(d.kind ?? "");
    default:
      return "";
  }
}

export default async function StudyPage({ params }: { params: { id: string } }) {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(params.id, user.id);
  if (!study) notFound();

  const images = study.images.map((im) => ({
    id: im.id,
    url: `/api/doctor/files/${im.file}`,
    laterality: im.laterality as "R" | "L",
    view: im.view as "CC" | "MLO" | "OTHER",
    sourceFormat: im.sourceFormat,
    width: im.width,
    height: im.height,
    pixelSpacing: im.pixelSpacing,
  }));

  // Qoralama hali yo'q — yuklash ustasini davom ettiramiz
  if (!study.report && !study.drafts.length && study.status !== "DRAFTING") {
    const priors = await prisma.study.findMany({
      where: { doctorId: user.id, report: { status: "APPROVED" }, id: { not: study.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { report: { select: { payload: true } } },
    });
    return (
      <StudyWizard
        priorStudies={priors.map((p) => ({ id: p.id, code: p.code, date: p.createdAt.toISOString().slice(0, 10), birads: overallOf(readPayload(p.report?.payload)) }))}
        existing={{
          id: study.id,
          code: study.code,
          patientAge: study.patientAge,
          indication: study.indication as "SCREENING" | "DIAGNOSTIC",
          clinicalInfo: study.clinicalInfo,
          priorStudyId: study.priorStudyId,
          images: images as WizardImage[],
        }}
      />
    );
  }

  const [logs, teachers, approver] = await Promise.all([
    prisma.auditLog.findMany({ where: { studyId: study.id }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } }, take: 200 }),
    prisma.user.findMany({ where: { role: "TEACHER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    study.report?.approvedById ? prisma.user.findUnique({ where: { id: study.report.approvedById }, select: { name: true } }) : null,
  ]);

  const d = study.drafts[0];
  const draftJson = d ? mammoDraftSchema.safeParse(parseJson(d.payload, null)) : null;
  const timeline: TimelineEntry[] = logs.map((l) => {
    const det = parseJson<Record<string, unknown>>(l.details, {});
    return { id: l.id, action: l.action, at: l.createdAt.toISOString(), user: l.user.name, summary: summarize(l.action, det), changes: (det.changes as Change[] | undefined) ?? [] };
  });
  const approved = study.report?.status === "APPROVED" && study.report.approvedAt ? { doctorName: approver?.name ?? "—", at: study.report.approvedAt.toISOString() } : null;
  const meta = renderMetaFor(study);
  const engineResult = parseJson<EngineResult | null>(d?.engineResult, null);
  const heatByFile = new Map<string, string>();
  for (const b of Object.values(engineResult?.breasts ?? {})) for (const v of b?.views ?? []) if (v.heatmap) heatByFile.set(v.file, v.heatmap);

  return (
    <Workspace
      key={`${d?.id ?? "none"}-${d?.revealed ? 1 : 0}-${study.report?.status ?? ""}`}
      study={{ id: study.id, code: study.code, status: study.status, error: study.error }}
      meta={{ ...meta, date: study.createdAt.toISOString() }}
      images={study.images.map((im) => ({ id: im.id, url: `/api/doctor/files/${im.file}`, label: `${im.laterality}-${im.view}`, pixelSpacing: im.pixelSpacing, width: im.width, height: im.height, heatmapUrl: heatByFile.has(im.file) ? `/api/doctor/files/${heatByFile.get(im.file)}` : null }))}
      initialPayload={readPayload(study.report?.payload)}
      reportStatus={study.report?.status === "APPROVED" ? "APPROVED" : "IN_REVIEW"}
      approvedText={study.report?.status === "APPROVED" ? study.report.text : null}
      approved={approved}
      editStats={parseJson<EditStats | null>(study.report?.editStats, null)}
      draft={
        d
          ? {
              id: d.id,
              version: d.version,
              source: d.source,
              model: d.model,
              effort: d.effort,
              latencyMs: d.latencyMs,
              confidence: d.overallConfidence,
              gated: d.gated,
              revealed: d.revealed,
              attentionReasons: draftJson?.success ? draftJson.data.attentionReasons : [],
              limitations: draftJson?.success ? draftJson.data.limitations : "",
              createdAt: d.createdAt.toISOString(),
            }
          : null
      }
      timeline={timeline}
      teachers={teachers}
      sentCaseId={study.report?.sentCaseId ?? null}
      engineResult={engineResult}
      modelEval={readModelEval()}
      groundTruth={parseJson(study.groundTruth, null)}
    />
  );
}
