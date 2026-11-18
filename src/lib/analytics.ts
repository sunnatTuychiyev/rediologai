import "server-only";
import { prisma } from "./prisma";
import { avg, parseJson } from "./utils";
import { mostMissedFindings } from "./stats";

export async function getAnalytics(teacherId: string) {
  const [students, cases] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT", group: { teacherId } },
      select: { id: true, name: true, group: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.case.findMany({
      where: { createdById: teacherId },
      select: {
        id: true, title: true, modality: true, tags: true,
        submissions: { where: { status: "DONE" }, select: { id: true, studentId: true, caseId: true, score: true, createdAt: true, evaluation: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const tags = Array.from(new Set(cases.flatMap((c) => parseJson<string[]>(c.tags, [])))).sort();
  const cell = new Map<string, number[]>();
  for (const c of cases) {
    for (const s of c.submissions) {
      for (const t of parseJson<string[]>(c.tags, [])) {
        const k = `${s.studentId}|${t}`;
        cell.set(k, [...(cell.get(k) ?? []), s.score ?? 0]);
      }
    }
  }
  const heatmap = students.map((st) => ({
    id: st.id,
    name: st.name,
    group: st.group?.name ?? "—",
    cells: tags.map((t) => {
      const v = cell.get(`${st.id}|${t}`);
      return v ? { avg: avg(v), n: v.length } : null;
    }),
  }));

  const perCase = cases.map((c) => {
    const subsWithCase = c.submissions.map((s) => ({ ...s, case: { title: c.title, tags: c.tags } }));
    const top = mostMissedFindings(subsWithCase, 1)[0];
    return {
      id: c.id,
      title: c.title,
      modality: c.modality,
      attempts: c.submissions.length,
      students: new Set(c.submissions.map((s) => s.studentId)).size,
      avg: c.submissions.length ? avg(c.submissions.map((s) => s.score ?? 0)) : null,
      mostMissed: top ? `${top.text} (${top.rate}%)` : null,
    };
  });

  return { tags, heatmap, perCase };
}
