import Link from "next/link";
import { Award, BookOpen, Send, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTeacherSubmissions, mostMissedFindings, tagAverages } from "@/lib/stats";
import { avg, formatDate, scoreBg } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { StatCard } from "@/components/score-circle";
import { TagBarChart } from "@/components/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function TeacherDashboard() {
  const user = await requireUser("TEACHER");
  const [subs, studentsCount, casesCount] = await Promise.all([
    getTeacherSubmissions(user.id),
    prisma.user.count({ where: { role: "STUDENT", group: { teacherId: user.id } } }),
    prisma.case.count({ where: { createdById: user.id } }),
  ]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const tags = tagAverages(subs);
  const missed = mostMissedFindings(subs, 8);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Bosh sahifa" description="Guruhingiz natijalari bir qarashda" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Talabalar" value={studentsCount} icon={Users} />
        <StatCard label="Bu hafta javoblar" value={subs.filter((s) => s.createdAt.getTime() >= weekAgo).length} hint={`Jami: ${subs.length}`} icon={Send} />
        <StatCard label="Guruh o'rtacha bali" value={subs.length ? avg(subs.map((s) => s.score ?? 0)) : "—"} icon={Award} />
        <StatCard label="Mashqlar" value={casesCount} icon={BookOpen} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Guruh eng ko&apos;p qiynalayotgan mavzular</CardTitle>
            <CardDescription>Teg bo&apos;yicha o&apos;rtacha ball (eng pastdan)</CardDescription>
          </CardHeader>
          <CardContent>
            {tags.length ? <TagBarChart data={tags.slice(0, 10)} /> : <EmptyState title="Ma'lumot yo'q" text="Talabalar mashq bajargach statistika paydo bo'ladi." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Eng ko&apos;p o&apos;tkazib yuborilgan topilmalar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>Topilma</TH><TH>Mashq</TH><TH className="text-right">O&apos;tkazish</TH></TR></THead>
              <TBody>
                {missed.map((m, i) => (
                  <TR key={i}>
                    <TD className="max-w-[220px] text-sm">{m.text}</TD>
                    <TD className="max-w-[160px] text-xs text-muted-foreground">{m.caseTitle}</TD>
                    <TD className="text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.rate >= 60 ? "bg-red-100 text-red-700" : m.rate >= 30 ? "bg-amber-100 text-amber-700" : "bg-muted"}`}>{m.rate}%</span>
                      <div className="text-[10px] text-muted-foreground">{m.missed}/{m.total}</div>
                    </TD>
                  </TR>
                ))}
                {missed.length === 0 && <TR><TD colSpan={3} className="py-8 text-center text-sm text-muted-foreground">Hali ma&apos;lumot yo&apos;q</TD></TR>}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>So&apos;nggi javoblar</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Talaba</TH><TH>Mashq</TH><TH>Sana</TH><TH>Ball</TH><TH /></TR></THead>
            <TBody>
              {subs.slice(0, 10).map((s) => (
                <TR key={s.id}>
                  <TD><Link href={`/teacher/students/${s.student.id}`} className="font-medium hover:underline">{s.student.name}</Link></TD>
                  <TD className="text-sm text-muted-foreground">{s.case.title}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(s.createdAt)}</TD>
                  <TD><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(s.score)}`}>{s.score}</span></TD>
                  <TD className="text-right"><Link href={`/teacher/submissions/${s.id}`} className="text-sm text-primary hover:underline">Ko&apos;rish →</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
