import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INDICATION_LABEL, STUDY_STATUS_LABEL, overallOf } from "@/lib/mammo-rules";
import { readPayload } from "@/lib/mammo-study";
import { BIRADS, STUDY_STATUSES } from "@/lib/mammo-types";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { BiradsBadge, StudyStatusBadge } from "@/components/mammo/badges";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type SP = { status?: string; birads?: string; q?: string; from?: string; to?: string };

export default async function StudiesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("DOCTOR");
  const status = STUDY_STATUSES.includes(searchParams.status as never) ? searchParams.status : undefined;
  const birads = BIRADS.includes(searchParams.birads as never) ? searchParams.birads : undefined;
  const q = searchParams.q?.trim().toUpperCase().slice(0, 30) || undefined;
  const from = searchParams.from && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from) ? new Date(searchParams.from) : undefined;
  const to = searchParams.to && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to) ? new Date(new Date(searchParams.to).getTime() + 86_400_000) : undefined;

  const rows = await prisma.study.findMany({
    where: { doctorId: user.id, status, code: q ? { contains: q } : undefined, createdAt: from || to ? { gte: from, lt: to } : undefined },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { report: { select: { payload: true } }, _count: { select: { images: true } }, drafts: { orderBy: { version: "desc" }, take: 1, select: { source: true, overallConfidence: true } } },
  });
  const list = rows
    .map((s) => ({ ...s, overall: s.report ? overallOf(readPayload(s.report.payload)) : null }))
    .filter((s) => !birads || s.overall === birads);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Tekshiruvlar"
        description="Anonim kod bo'yicha qidiring va holat bo'yicha saralang"
        actions={<Link href="/doctor/studies/new" className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-navy px-5 text-[15px] font-semibold text-white hover:bg-navy-700"><FilePlus2 className="h-4 w-4" /> Yangi tekshiruv</Link>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]" method="get">
        <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Kod bo'yicha qidirish, masalan MG-2026-0004" aria-label="Qidirish" />
        <Select name="status" defaultValue={status ?? ""} aria-label="Holat" className="sm:w-48">
          <option value="">Barcha holatlar</option>
          {STUDY_STATUSES.map((s) => <option key={s} value={s}>{STUDY_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select name="birads" defaultValue={birads ?? ""} aria-label="BI-RADS" className="sm:w-36">
          <option value="">BI-RADS: barchasi</option>
          {BIRADS.map((b) => <option key={b} value={b}>BI-RADS {b}</option>)}
        </Select>
        <Input type="date" name="from" defaultValue={searchParams.from ?? ""} aria-label="Sanadan" className="sm:w-40" />
        <Input type="date" name="to" defaultValue={searchParams.to ?? ""} aria-label="Sanagacha" className="sm:w-40" />
        <Button type="submit" variant="outline">Saralash</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="p-6"><EmptyState title="Hech narsa topilmadi" text="Filtrlarni o'zgartiring yoki yangi tekshiruv yarating." /></div>
          ) : (
            <Table>
              <THead><TR><TH>Kod</TH><TH>Sana</TH><TH>Yosh</TH><TH>Ko&apos;rsatma</TH><TH>Holat</TH><TH>BI-RADS</TH><TH>AI</TH><TH /></TR></THead>
              <TBody>
                {list.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-semibold">{s.code}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(s.createdAt)}</TD>
                    <TD>{s.patientAge ?? "—"}</TD>
                    <TD className="text-sm">{INDICATION_LABEL[s.indication]}</TD>
                    <TD><StudyStatusBadge status={s.status} /></TD>
                    <TD>{s.overall ? <BiradsBadge value={s.overall} /> : <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="text-xs text-muted-foreground">{s.drafts[0] ? `${s.drafts[0].source === "OFFLINE" ? "oflayn" : "AI"} · ${Math.round(s.drafts[0].overallConfidence * 100)}%` : "—"}</TD>
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
