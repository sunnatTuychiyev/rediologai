import Link from "next/link";
import { Activity, Award, BookOpen, ClipboardList, Sparkles, TrendingDown } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentStats } from "@/lib/stats";
import { parseJson, formatDate } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { StatCard } from "@/components/score-circle";
import { ActivityBars, ScoreLineChart } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function StudentDashboard() {
  const user = await requireUser("STUDENT");
  const stats = await getStudentStats(user.id);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { groupId: true } });
  const now = new Date();
  const assignments = me?.groupId
    ? await prisma.assignment.findMany({ where: { groupId: me.groupId, startsAt: { lte: now }, endsAt: { gte: now } }, orderBy: { endsAt: "asc" } })
    : [];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title={`Salom, ${user.name.split(" ")[0]}!`}
        description="Bugun ham bir nechta tasvirni o'qib, xulosa yozing."
        actions={
          stats.recommendedId ? (
            <Link href={`/student/cases/${stats.recommendedId}`} className={buttonVariants()}>
              <Sparkles /> Tavsiya etilgan mashq
            </Link>
          ) : (
            <Link href="/student/cases" className={buttonVariants()}>
              <BookOpen /> Mashqlar
            </Link>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bajarilgan mashqlar" value={stats.completed} hint={`${stats.attempts} ta urinish`} icon={BookOpen} />
        <StatCard label="O'rtacha ball" value={stats.attempts ? stats.average : "—"} hint="Barcha urinishlar bo'yicha" icon={Award} />
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            Oxirgi 7 kun <Activity className="h-4 w-4" />
          </div>
          <div className="mt-2 flex items-end gap-4">
            <span className="text-2xl font-semibold">{stats.last7}</span>
            <div className="flex-1"><ActivityBars data={stats.activity} /></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ball dinamikasi</CardTitle>
            <CardDescription>Har bir urinish natijasi</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.series.length ? (
              <ScoreLineChart data={stats.series} />
            ) : (
              <EmptyState title="Hali natija yo'q" text="Birinchi mashqni bajaring — natijalaringiz shu yerda ko'rinadi." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Zaif mavzular</CardTitle>
            <CardDescription>Eng past o&apos;rtacha ball</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.weakTags.length === 0 && <p className="text-sm text-muted-foreground">Mashq bajarganingizdan so&apos;ng zaif mavzular aniqlanadi.</p>}
            {stats.weakTags.map((t) => (
              <div key={t.tag} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium first-letter:uppercase">{t.tag}</span>
                  <span className="text-muted-foreground">{t.avg} ball · {t.missed} o&apos;tkazilgan</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${t.avg < 50 ? "bg-red-500" : t.avg < 80 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${t.avg}%` }} />
                </div>
              </div>
            ))}
            {stats.recommendedId && (
              <Link href={`/student/cases/${stats.recommendedId}`} className={buttonVariants({ variant: "outline", className: "mt-2 w-full" })}>
                <Sparkles /> Tavsiya etilgan mashq
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Faol topshiriqlar</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hozircha o&apos;qituvchidan faol topshiriq yo&apos;q.</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => {
                const ids = parseJson<string[]>(a.caseIds, []);
                const done = ids.filter((id) => stats.doneCaseIds.has(id)).length;
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {a.title}
                        <Badge variant={a.mode === "EXAM" ? "danger" : "default"}>{a.mode === "EXAM" ? "Imtihon" : "Mashq"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Muddat: {formatDate(a.endsAt)} · {done}/{ids.length} bajarildi{a.timeLimitMin ? ` · ${a.timeLimitMin} daqiqa` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ids.map((id, i) => (
                        <Link key={id} href={`/student/cases/${id}?assignment=${a.id}`}>
                          <Button size="sm" variant={stats.doneCaseIds.has(id) ? "secondary" : "outline"}>{i + 1}-mashq</Button>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
