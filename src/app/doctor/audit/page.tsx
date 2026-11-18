import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTION_LABEL } from "@/lib/mammo-rules";
import { AUDIT_ACTIONS } from "@/lib/mammo-types";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AuditDetails } from "./audit-details";

export const dynamic = "force-dynamic";

/** To'liq xulosa snapshotlari klientga yuborilmaydi (sahifa yengil bo'lsin); ular bazada va CSV/tarixda saqlanadi. */
function stripSnapshot(details: string) {
  try {
    const { snapshot, ...rest } = JSON.parse(details) as Record<string, unknown>;
    return JSON.stringify(snapshot ? { ...rest, snapshot: "(saqlangan)" } : rest);
  } catch {
    return details;
  }
}

export default async function AuditPage({ searchParams }: { searchParams: { action?: string; q?: string } }) {
  const user = await requireUser("DOCTOR");
  const action = AUDIT_ACTIONS.includes(searchParams.action as never) ? searchParams.action : undefined;
  const q = searchParams.q?.trim().toUpperCase().slice(0, 30) || undefined;
  const logs = await prisma.auditLog.findMany({
    where: { action, OR: [{ userId: user.id }, { study: { doctorId: user.id } }], study: q ? { code: { contains: q } } : undefined },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } }, study: { select: { code: true, id: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Audit jurnali"
        description="AI nimani taklif qilgani va shifokor nimani o'zgartirgani. Yozuvlar faqat qo'shiladi — o'zgartirib yoki o'chirib bo'lmaydi."
        actions={
          <a href={`/api/doctor/audit/export${action ? `?action=${action}` : ""}`} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-line bg-card px-5 text-[15px] font-semibold text-navy hover:border-navy">
            <Download className="h-4 w-4" /> CSV eksport
          </a>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Tekshiruv kodi" className="max-w-xs" aria-label="Tekshiruv kodi" />
        <Select name="action" defaultValue={action ?? ""} className="max-w-xs" aria-label="Amal">
          <option value="">Barcha amallar</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>)}
        </Select>
        <Button type="submit" variant="outline">Saralash</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Vaqt</TH><TH>Shifokor</TH><TH>Tekshiruv</TH><TH>Amal</TH><TH>Tafsilot</TH></TR></THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id} className="align-top">
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(l.createdAt)}</TD>
                  <TD className="text-sm">{l.user.name}</TD>
                  <TD className="text-sm">{l.study ? <Link href={`/doctor/studies/${l.study.id}`} className="font-semibold text-cyan-ink hover:underline">{l.study.code}</Link> : "—"}</TD>
                  <TD className="text-sm font-medium">{AUDIT_ACTION_LABEL[l.action] ?? l.action}</TD>
                  <TD className="max-w-[420px]"><AuditDetails json={stripSnapshot(l.details)} /></TD>
                </TR>
              ))}
              {logs.length === 0 && <TR><TD colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Yozuv yo&apos;q</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
