import Link from "next/link";
import { History } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MODALITY_LABEL } from "@/lib/labels";
import { formatDate, formatDuration, scoreBg } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function HistoryPage() {
  const user = await requireUser("STUDENT");
  const subs = await prisma.submission.findMany({
    where: { studentId: user.id },
    orderBy: { createdAt: "desc" },
    include: { case: { select: { title: true, modality: true, bodyRegion: true } } },
  });
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Tarix" description="Barcha yuborilgan xulosalaringiz" />
      {subs.length === 0 ? (
        <EmptyState icon={History} title="Hali xulosa yubormagansiz" text="Mashqlar bo'limidan birinchi mashqni boshlang." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR><TH>Sana</TH><TH>Mashq</TH><TH>Vaqt</TH><TH>Ball</TH><TH /></TR>
            </THead>
            <TBody>
              {subs.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(s.createdAt)}</TD>
                  <TD>
                    <div className="font-medium">{s.case.title}</div>
                    <div className="text-xs text-muted-foreground">{MODALITY_LABEL[s.case.modality]} · {s.case.bodyRegion}</div>
                  </TD>
                  <TD className="tabular-nums text-muted-foreground">{formatDuration(s.durationSec)}</TD>
                  <TD>
                    {s.status === "DONE" ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(s.score)}`}>{s.score}</span>
                    ) : (
                      <Badge variant={s.status === "ERROR" ? "danger" : "muted"}>{s.status === "ERROR" ? "Xatolik" : "Tekshirilmoqda"}</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Link href={`/student/submissions/${s.id}`} className="text-sm font-medium text-primary hover:underline">Natija →</Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
