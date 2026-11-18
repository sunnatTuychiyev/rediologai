"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Search, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app-shell";
import { formatDate, scoreBg } from "@/lib/utils";

type Row = { id: string; name: string; email: string; group: string; count: number; avg: number | null; last: string | null; weakest: string | null };
type Key = "name" | "group" | "count" | "avg" | "last";

export function StudentsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "avg", dir: 1 });

  const data = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => !s || r.name.toLowerCase().includes(s) || r.email.includes(s) || r.group.toLowerCase().includes(s))
      .sort((a, b) => {
        const av = a[sort.key] ?? -1, bv = b[sort.key] ?? -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
  }, [rows, q, sort]);

  const H = ({ k, children }: { k: Key; children: React.ReactNode }) => (
    <TH>
      <button className="flex items-center gap-1 uppercase" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {children} <ArrowUpDown className="h-3 w-3" />
      </button>
    </TH>
  );

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Ism, email yoki guruh…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {data.length === 0 ? (
        <EmptyState icon={Users} title="Talaba topilmadi" text="Guruhlar bo'limida talabalarni qo'shing yoki guruh kodini ularga bering." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR><H k="name">Ism</H><H k="group">Guruh</H><H k="count">Javoblar</H><H k="avg">O&apos;rtacha</H><H k="last">Oxirgi faollik</H><TH>Zaif mavzu</TH></TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.id} className="cursor-pointer" onClick={() => router.push(`/teacher/students/${r.id}`)}>
                  <TD><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TD>
                  <TD className="text-sm">{r.group}</TD>
                  <TD className="tabular-nums">{r.count}</TD>
                  <TD>{r.avg != null ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(r.avg)}`}>{r.avg}</span> : "—"}</TD>
                  <TD className="text-xs text-muted-foreground">{r.last ? formatDate(r.last) : "—"}</TD>
                  <TD>{r.weakest ? <Badge variant="danger">#{r.weakest}</Badge> : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
