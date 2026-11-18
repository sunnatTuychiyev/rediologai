import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentStats } from "@/lib/stats";
import { formatDate, formatDuration, scoreBg } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { StatCard } from "@/components/score-circle";
import { ScoreLineChart, TagBarChart } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function StudentDetail({ params }: { params: { id: string } }) {
  const teacher = await requireUser("TEACHER");
  const student = await prisma.user.findFirst({
    where: { id: params.id, role: "STUDENT", group: { teacherId: teacher.id } },
    include: { group: { select: { name: true } } },
  });
  if (!student) notFound();
  const [stats, subs] = await Promise.all([
    getStudentStats(student.id),
    prisma.submission.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" }, include: { case: { select: { title: true } } } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link href="/teacher/students" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> O&apos;quvchilar</Link>
      <PageHeader title={student.name} description={`${student.email} · ${student.group?.name ?? "Guruhsiz"}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bajarilgan mashqlar" value={stats.completed} hint={`${stats.attempts} ta urinish`} />
        <StatCard label="O'rtacha ball" value={stats.attempts ? stats.average : "—"} />
        <StatCard label="Oxirgi 7 kun" value={stats.last7} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ball dinamikasi</CardTitle></CardHeader>
          <CardContent>{stats.series.length ? <ScoreLineChart data={stats.series} /> : <EmptyState title="Natija yo'q" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mavzular bo&apos;yicha</CardTitle></CardHeader>
          <CardContent>{stats.allTags.length ? <TagBarChart data={stats.allTags} height={240} /> : <EmptyState title="Natija yo'q" />}</CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Barcha javoblar</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Sana</TH><TH>Mashq</TH><TH>Vaqt</TH><TH>Ball</TH><TH /></TR></THead>
            <TBody>
              {subs.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(s.createdAt)}</TD>
                  <TD>{s.case.title}</TD>
                  <TD className="tabular-nums text-muted-foreground">{formatDuration(s.durationSec)}</TD>
                  <TD>{s.status === "DONE" ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(s.score)}`}>{s.score}</span> : <Badge variant="muted">{s.status}</Badge>}</TD>
                  <TD className="text-right"><Link href={`/teacher/submissions/${s.id}`} className="text-sm text-primary hover:underline">Natija →</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
