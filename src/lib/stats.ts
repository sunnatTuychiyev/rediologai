import "server-only";
import { prisma } from "./prisma";
import { avg, parseJson } from "./utils";
import type { Evaluation } from "./types";

type SubRow = {
  id: string;
  studentId: string;
  caseId: string;
  score: number | null;
  createdAt: Date;
  evaluation: string | null;
  case: { title: string; tags: string };
};

export function tagAverages(subs: SubRow[]) {
  const map = new Map<string, { scores: number[]; missed: number }>();
  for (const s of subs) {
    if (s.score == null) continue;
    const ev = parseJson<Evaluation | null>(s.evaluation, null);
    const missed = ev?.findingResults.filter((f) => f.status === "missed").length ?? 0;
    for (const tag of parseJson<string[]>(s.case.tags, [])) {
      const e = map.get(tag) ?? { scores: [], missed: 0 };
      e.scores.push(s.score);
      e.missed += missed;
      map.set(tag, e);
    }
  }
  return [...map.entries()]
    .map(([tag, v]) => ({ tag, avg: avg(v.scores), count: v.scores.length, missed: v.missed }))
    .sort((a, b) => a.avg - b.avg || b.missed - a.missed);
}

export function mostMissedFindings(subs: SubRow[], limit = 10) {
  const map = new Map<string, { text: string; caseTitle: string; caseId: string; missed: number; total: number }>();
  for (const s of subs) {
    const ev = parseJson<Evaluation | null>(s.evaluation, null);
    if (!ev) continue;
    for (const f of ev.findingResults) {
      const k = `${s.caseId}:${f.key}`;
      const e = map.get(k) ?? { text: f.referenceText, caseTitle: s.case.title, caseId: s.caseId, missed: 0, total: 0 };
      e.total++;
      if (f.status === "missed") e.missed++;
      map.set(k, e);
    }
  }
  return [...map.values()]
    .filter((e) => e.missed > 0)
    .map((e) => ({ ...e, rate: Math.round((e.missed / e.total) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.missed - a.missed)
    .slice(0, limit);
}

export async function getStudentStats(studentId: string) {
  const subs = await prisma.submission.findMany({
    where: { studentId, status: "DONE" },
    orderBy: { createdAt: "asc" },
    include: { case: { select: { title: true, tags: true } } },
  });
  const scores = subs.map((s) => s.score ?? 0);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const doneCaseIds = new Set(subs.map((s) => s.caseId));
  const tags = tagAverages(subs);

  // Recommended next case: published case from the weakest tag(s) not yet done.
  const published = await prisma.case.findMany({
    where: { isPublished: true },
    select: { id: true, tags: true, modality: true, bodyRegion: true, difficulty: true },
  });
  let recommended: (typeof published)[number] | undefined;
  for (const t of tags) {
    recommended = published.find((c) => !doneCaseIds.has(c.id) && parseJson<string[]>(c.tags, []).includes(t.tag));
    if (recommended) break;
  }
  recommended ??= published.find((c) => !doneCaseIds.has(c.id));

  // Activity for the last 7 days (per day count).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const activity = days.map((d) => {
    const next = d.getTime() + 86_400_000;
    return { day: d.toISOString(), count: subs.filter((s) => s.createdAt.getTime() >= d.getTime() && s.createdAt.getTime() < next).length };
  });

  return {
    completed: doneCaseIds.size,
    attempts: subs.length,
    average: avg(scores),
    last7: subs.filter((s) => s.createdAt.getTime() >= weekAgo).length,
    series: subs.map((s) => ({ date: s.createdAt.toISOString(), score: s.score ?? 0, title: s.case.title })),
    weakTags: tags.slice(0, 3),
    allTags: tags,
    activity,
    recommendedId: recommended?.id ?? null,
    doneCaseIds,
  };
}

export async function getTeacherSubmissions(teacherId: string) {
  return prisma.submission.findMany({
    where: { status: "DONE", case: { createdById: teacherId } },
    orderBy: { createdAt: "desc" },
    include: {
      case: { select: { title: true, tags: true } },
      student: { select: { id: true, name: true, group: { select: { name: true } } } },
    },
  });
}
