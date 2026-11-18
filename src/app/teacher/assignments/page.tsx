import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { AssignmentsClient } from "./assignments-client";

export default async function AssignmentsPage() {
  const user = await requireUser("TEACHER");
  const [groups, cases, assignments] = await Promise.all([
    prisma.group.findMany({ where: { teacherId: user.id }, select: { id: true, name: true } }),
    prisma.case.findMany({ where: { createdById: user.id, isPublished: true }, select: { id: true, title: true, modality: true }, orderBy: { createdAt: "asc" } }),
    prisma.assignment.findMany({
      where: { group: { teacherId: user.id } },
      include: { group: { select: { name: true } }, _count: { select: { submissions: true } } },
      orderBy: { startsAt: "desc" },
    }),
  ]);
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Topshiriqlar" description="Guruhga mashq yoki imtihon tayinlash" />
      <AssignmentsClient
        groups={groups}
        cases={cases}
        assignments={assignments.map((a) => ({
          id: a.id, title: a.title, group: a.group.name, mode: a.mode, timeLimitMin: a.timeLimitMin,
          startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), showFeedback: a.showFeedback,
          caseCount: parseJson<string[]>(a.caseIds, []).length, submissions: a._count.submissions,
        }))}
      />
    </div>
  );
}
