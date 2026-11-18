import "server-only";
import { prisma } from "./prisma";
import { parseJson } from "./utils";
import type { EditStats } from "./mammo-types";

export type DoctorMetrics = Awaited<ReturnType<typeof doctorMetrics>>;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Model kartasi va bosh sahifa uchun jonli ko'rsatkichlar. doctorId bo'lmasa — butun tizim bo'yicha. */
export async function doctorMetrics(doctorId?: string) {
  const where = doctorId ? { study: { doctorId } } : {};
  const [drafts, reports] = await Promise.all([
    prisma.draft.findMany({ where, select: { gated: true, latencyMs: true, source: true, model: true, overallConfidence: true, createdAt: true } }),
    prisma.report.findMany({ where: { ...where, status: "APPROVED" }, select: { editStats: true, approvedAt: true } }),
  ]);
  const stats = reports.map((r) => parseJson<EditStats | null>(r.editStats, null)).filter((s): s is EditStats => Boolean(s));
  const aiStats = stats.filter((s) => s.aiFindings > 0 || s.aiBirads !== "—");
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
  const count = (arr: string[]) => Object.entries(arr.reduce<Record<string, number>>((a, t) => ((a[t] = (a[t] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);

  const aiLatencies = drafts.filter((d) => d.source === "AI").map((d) => d.latencyMs);
  const noFindingChanges = aiStats.filter((s) => s.modified === 0 && s.removed === 0 && s.added === 0).length;
  const minorEdits = aiStats.filter((s) => s.removed + s.added <= 1 && !s.biradsChanged).length;
  const agreement = new Map<string, number>();
  for (const s of aiStats) agreement.set(`${s.aiBirads}→${s.finalBirads}`, (agreement.get(`${s.aiBirads}→${s.finalBirads}`) ?? 0) + 1);

  return {
    drafts: drafts.length,
    aiDrafts: drafts.filter((d) => d.source === "AI").length,
    gatedPct: pct(drafts.filter((d) => d.gated).length, drafts.length),
    // Kechikish faqat haqiqiy AI chaqiruvlari bo'yicha (oflayn/demo qoralamalar ~0 ms — aralashtirmaymiz)
    medianLatencyMs: median(aiLatencies),
    avgLatencyMs: aiLatencies.length ? Math.round(aiLatencies.reduce((a, x) => a + x, 0) / aiLatencies.length) : null,
    seededDrafts: drafts.filter((d) => d.model === "demo-seed").length,
    approved: reports.length,
    approvedNoFindingChangesPct: pct(noFindingChanges, aiStats.length),
    approvedMinorEditsPct: pct(minorEdits, aiStats.length),
    biradsChangedPct: pct(aiStats.filter((s) => s.biradsChanged).length, aiStats.length),
    deletedTypes: count(aiStats.flatMap((s) => s.removedTypes)),
    addedTypes: count(aiStats.flatMap((s) => s.addedTypes)),
    totalAiFindings: aiStats.reduce((a, s) => a + s.aiFindings, 0),
    acceptedFindings: aiStats.reduce((a, s) => a + s.accepted, 0),
    modifiedFindings: aiStats.reduce((a, s) => a + s.modified, 0),
    removedFindings: aiStats.reduce((a, s) => a + s.removed, 0),
    biradsTransitions: Array.from(agreement.entries()).sort((a, b) => b[1] - a[1]),
  };
}
