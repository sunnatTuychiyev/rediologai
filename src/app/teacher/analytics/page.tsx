import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { MODALITY_LABEL } from "@/lib/labels";
import { scoreBg } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

function heatColor(v: number) {
  // red (0) → amber (60) → green (100)
  const t = Math.max(0, Math.min(1, (v - 35) / 60)); // ≤35 → red, ≥95 → green
  const hue = Math.round(t * 130);
  return `hsl(${hue} 70% ${88 - v * 0.15}%)`;
}

export default async function AnalyticsPage() {
  const user = await requireUser("TEACHER");
  const { tags, heatmap, perCase } = await getAnalytics(user.id);
  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Statistika"
        description="Talabalar × mavzular bo'yicha natijalar"
        actions={<a href="/api/teacher/export" className={buttonVariants({ variant: "outline" })}><Download /> CSV yuklab olish</a>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Issiqlik xaritasi</CardTitle>
          <CardDescription>Har bir katak — talabaning shu mavzudagi o&apos;rtacha bali</CardDescription>
        </CardHeader>
        <CardContent>
          {heatmap.length === 0 || tags.length === 0 ? (
            <EmptyState title="Ma'lumot yo'q" />
          ) : (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card" />
                    {tags.map((t) => (
                      <th key={t} className="h-28 w-12 align-bottom font-medium text-muted-foreground">
                        <div className="mx-auto w-4 whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{t}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => (
                    <tr key={row.id}>
                      <td className="sticky left-0 whitespace-nowrap bg-card pr-3 text-sm font-medium">
                        <Link href={`/teacher/students/${row.id}`} className="hover:underline">{row.name}</Link>
                      </td>
                      {row.cells.map((c, i) => (
                        <td
                          key={i}
                          title={c ? `${row.name} · ${tags[i]}: ${c.avg} (${c.n} ta)` : "Bajarilmagan"}
                          className="h-10 w-12 rounded text-center font-semibold tabular-nums"
                          style={c ? { background: heatColor(c.avg), color: c.avg < 50 ? "#7f1d1d" : c.avg < 80 ? "#78350f" : "#064e3b" } : { background: "hsl(210 20% 96%)", color: "#cbd5e1" }}
                        >
                          {c ? c.avg : "·"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Mashqlar bo&apos;yicha</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Mashq</TH><TH>Urinishlar</TH><TH>Talabalar</TH><TH>O&apos;rtacha</TH><TH>Eng ko&apos;p o&apos;tkazilgan topilma</TH></TR></THead>
            <TBody>
              {perCase.map((c) => (
                <TR key={c.id}>
                  <TD><div className="font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{MODALITY_LABEL[c.modality]}</div></TD>
                  <TD className="tabular-nums">{c.attempts}</TD>
                  <TD className="tabular-nums">{c.students}</TD>
                  <TD>{c.avg != null ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(c.avg)}`}>{c.avg}</span> : "—"}</TD>
                  <TD className="max-w-sm text-sm text-muted-foreground">{c.mostMissed ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
