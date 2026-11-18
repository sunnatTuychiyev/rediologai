import Link from "next/link";
import { AlertOctagon, CheckCircle2, ClipboardList, FilePlus2, Gauge, Timer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { doctorMetrics } from "@/lib/doctor-stats";
import { overallOf } from "@/lib/mammo-rules";
import { readPayload } from "@/lib/mammo-study";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { StatCard } from "@/components/score-circle";
import { BiradsBadge, StudyStatusBadge } from "@/components/mammo/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DoctorDashboard() {
  const user = await requireUser("DOCTOR");
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [studies, grouped, metrics] = await Promise.all([
    prisma.study.findMany({
      where: { doctorId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { report: { select: { payload: true, status: true } }, _count: { select: { images: true } } },
    }),
    prisma.study.groupBy({ by: ["status"], where: { doctorId: user.id }, _count: true }),
    doctorMetrics(user.id),
  ]);
  const today = await prisma.study.count({ where: { doctorId: user.id, createdAt: { gte: startOfDay } } });
  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Record<string, number>;
  const waiting = (byStatus.UPLOADED ?? 0) + (byStatus.DRAFTING ?? 0) + (byStatus.ERROR ?? 0);
  const reviewing = (byStatus.DRAFT_READY ?? 0) + (byStatus.IN_REVIEW ?? 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Bosh sahifa"
        description="Mammografiya xulosa qoralamalari — AI yozadi, siz tasdiqlaysiz"
        actions={
          <Link href="/doctor/studies/new" className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-navy px-5 text-[15px] font-semibold text-white hover:bg-navy-700">
            <FilePlus2 className="h-4 w-4" /> Yangi tekshiruv
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bugungi tekshiruvlar" value={today} icon={ClipboardList} hint={`Qoralama kutilmoqda: ${waiting}`} />
        <StatCard label="Ko'rib chiqilmoqda" value={reviewing} icon={Gauge} hint={`E'tibor kerak: ${byStatus.NEEDS_ATTENTION ?? 0}`} />
        <StatCard label="Tasdiqlangan" value={byStatus.APPROVED ?? 0} icon={CheckCircle2} hint={metrics.approvedMinorEditsPct != null ? `${metrics.approvedMinorEditsPct}% — kichik tahrir bilan` : undefined} />
        <StatCard label="O'rtacha AI vaqti" value={metrics.avgLatencyMs != null ? `${(metrics.avgLatencyMs / 1000).toFixed(1)} s` : "—"} icon={Timer} hint={metrics.approvedNoFindingChangesPct != null ? `${metrics.approvedNoFindingChangesPct}% topilmalar o'zgarishsiz` : undefined} />
      </div>

      {(byStatus.NEEDS_ATTENTION ?? 0) > 0 && (
        <Link href="/doctor/studies?status=NEEDS_ATTENTION" className="mt-4 flex items-center gap-2 rounded-[14px] border border-red-200 bg-[#FDE8E8] p-3.5 text-[14px] font-semibold text-[#7F1D1D] hover:border-red-300">
          <AlertOctagon className="h-4 w-4" /> {byStatus.NEEDS_ATTENTION} ta tekshiruv shifokor e&apos;tiborini talab qiladi →
        </Link>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle>So&apos;nggi tekshiruvlar</CardTitle></CardHeader>
        <CardContent className="p-0">
          {studies.length === 0 ? (
            <div className="p-6"><EmptyState title="Hali tekshiruv yo'q" text="Birinchi mammografiya tekshiruvini yuklang." /></div>
          ) : (
            <Table>
              <THead><TR><TH>Kod</TH><TH>Holat</TH><TH>BI-RADS</TH><TH>Proyeksiya</TH><TH>Yangilangan</TH><TH /></TR></THead>
              <TBody>
                {studies.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-semibold">{s.code}</TD>
                    <TD><StudyStatusBadge status={s.status} /></TD>
                    <TD>{s.report ? <BiradsBadge value={overallOf(readPayload(s.report.payload))} /> : <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="text-sm text-muted-foreground">{s._count.images}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(s.updatedAt)}</TD>
                    <TD className="text-right"><Link href={`/doctor/studies/${s.id}`} className="text-sm font-semibold text-cyan-ink hover:underline">Ochish →</Link></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
