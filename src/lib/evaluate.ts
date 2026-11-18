import "server-only";
import { prisma } from "./prisma";
import { evaluateReport } from "./ai";
import { parseJson } from "./utils";
import type { ReferenceFindings } from "./types";

/** Runs the AI evaluation for a submission and persists the result. Never throws. */
export async function runEvaluation(submissionId: string) {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, include: { case: true } });
  if (!sub) return null;
  try {
    const referenceFindings = parseJson<ReferenceFindings>(sub.case.referenceFindings, { findings: [], impression: "", recommendations: "" });
    const evaluation = await evaluateReport({
      clinicalInfo: sub.case.clinicalInfo,
      modality: sub.case.modality,
      bodyRegion: sub.case.bodyRegion,
      referenceReport: sub.case.referenceReport,
      referenceFindings,
      studentReport: sub.reportText,
    });
    return prisma.submission.update({
      where: { id: sub.id },
      data: { status: "DONE", score: evaluation.score, evaluation: JSON.stringify(evaluation), error: null },
    });
  } catch (err) {
    console.error("[evaluation] failed", submissionId, err);
    return prisma.submission.update({
      where: { id: sub.id },
      data: { status: "ERROR", error: err instanceof Error ? err.message.slice(0, 500) : "Noma'lum xatolik" },
    });
  }
}
