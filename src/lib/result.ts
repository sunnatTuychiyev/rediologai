import "server-only";
import { prisma } from "./prisma";
import { parseJson } from "./utils";
import type { Evaluation } from "./types";
import type { ViewerRegion } from "@/components/image-viewer";

export async function loadSubmission(id: string) {
  const sub = await prisma.submission.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true } },
      assignment: true,
      case: {
        select: {
          id: true, title: true, modality: true, bodyRegion: true, clinicalInfo: true, referenceReport: true, createdById: true,
          images: { select: { id: true, url: true, label: true, pixelSpacing: true }, orderBy: { order: "asc" } },
          regions: true,
        },
      },
    },
  });
  if (!sub) return null;
  const evaluation = parseJson<Evaluation | null>(sub.evaluation, null);
  const statusByKey = new Map(evaluation?.findingResults.map((f) => [f.key, f]) ?? []);
  const regions: ViewerRegion[] = sub.case.regions.map((r) => {
    const f = statusByKey.get(r.findingKey);
    return {
      imageId: r.imageId,
      x: r.x, y: r.y, width: r.width, height: r.height,
      key: r.findingKey,
      label: f
        ? `${f.status === "missed" ? "✗ O'tkazildi" : f.status === "partial" ? "≈ Qisman" : "✓ Topildi"}: ${f.referenceText.length > 34 ? f.referenceText.slice(0, 32) + "…" : f.referenceText}`
        : r.findingKey,
      color: f?.status === "correct" ? "green" : f?.status === "partial" ? "amber" : "red",
    };
  });
  return { sub, evaluation, regions };
}

/** Exam mode: feedback hidden until the deadline unless showFeedback is on. */
export function feedbackHidden(a: { mode: string; showFeedback: boolean; endsAt: Date } | null) {
  return Boolean(a && a.mode === "EXAM" && !a.showFeedback && new Date() < a.endsAt);
}
