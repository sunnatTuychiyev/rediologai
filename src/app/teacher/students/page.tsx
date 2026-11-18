import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tagAverages } from "@/lib/stats";
import { avg } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { StudentsTable } from "./students-table";

export default async function StudentsPage() {
  const user = await requireUser("TEACHER");
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", group: { teacherId: user.id } },
    include: {
      group: { select: { name: true } },
      submissions: { where: { status: "DONE" }, include: { case: { select: { title: true, tags: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  const rows = students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    group: s.group?.name ?? "—",
    count: s.submissions.length,
    avg: s.submissions.length ? avg(s.submissions.map((x) => x.score ?? 0)) : null,
    last: s.submissions[0]?.createdAt.toISOString() ?? null,
    weakest: tagAverages(s.submissions)[0]?.tag ?? null,
  }));
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="O'quvchilar" description="Talabalar natijalari va zaif mavzulari" />
      <StudentsTable rows={rows} />
    </div>
  );
}
