"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Copy, Eye, EyeOff, Pencil, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app-shell";
import { DIFFICULTY_LABEL, MODALITY_LABEL } from "@/lib/labels";
import { scoreBg } from "@/lib/utils";
import { deleteCase, duplicateCase, togglePublish } from "./actions";

type Row = {
  id: string; title: string; modality: string; bodyRegion: string; difficulty: string; tags: string[];
  isPublished: boolean; thumb: string | null; attempts: number; avgScore: number | null;
};

export function CasesTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [modality, setModality] = useState("");
  const [status, setStatus] = useState("");
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!s || r.title.toLowerCase().includes(s) || r.tags.some((t) => t.includes(s)) || r.bodyRegion.toLowerCase().includes(s)) &&
        (!modality || r.modality === modality) &&
        (!status || (status === "pub" ? r.isPublished : !r.isPublished)),
    );
  }, [rows, q, modality, status]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(msg);
        router.refresh();
      } else toast.error(res.error ?? "Xatolik");
    });

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Qidirish: sarlavha, teg, soha…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={modality} onChange={(e) => setModality(e.target.value)}>
          <option value="">Barcha modalliklar</option>
          {Object.entries(MODALITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Barcha holatlar</option>
          <option value="pub">Nashr qilingan</option>
          <option value="draft">Qoralama</option>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="Mashq topilmadi" text="Yangi mashq qo'shing yoki qidiruvni o'zgartiring." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR><TH>Mashq</TH><TH>Modallik</TH><TH>Qiyinlik</TH><TH>Urinishlar</TH><TH>O&apos;rtacha</TH><TH>Holat</TH><TH className="text-right">Amallar</TH></TR>
            </THead>
            <TBody>
              {filtered.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.thumb ? <img src={r.thumb} alt="" className="h-10 w-10 rounded bg-neutral-900 object-cover" /> : <div className="h-10 w-10 rounded bg-muted" />}
                      <div>
                        <div className="font-medium">{r.title}</div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {r.tags.map((t) => <span key={t} className="text-xs text-muted-foreground">#{t}</span>)}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD><Badge variant="secondary">{MODALITY_LABEL[r.modality]}</Badge> <span className="text-xs text-muted-foreground">{r.bodyRegion}</span></TD>
                  <TD>{DIFFICULTY_LABEL[r.difficulty]}</TD>
                  <TD className="tabular-nums">{r.attempts}</TD>
                  <TD>{r.avgScore != null ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(r.avgScore)}`}>{r.avgScore}</span> : "—"}</TD>
                  <TD>
                    <button disabled={pending} onClick={() => run(() => togglePublish(r.id), r.isPublished ? "Qoralamaga o'tkazildi" : "Nashr qilindi")}>
                      {r.isPublished ? <Badge variant="success"><Eye className="h-3 w-3" /> Nashr qilingan</Badge> : <Badge variant="muted"><EyeOff className="h-3 w-3" /> Qoralama</Badge>}
                    </button>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/teacher/cases/${r.id}/edit`}><Button variant="ghost" size="icon" title="Tahrirlash"><Pencil /></Button></Link>
                      <Button variant="ghost" size="icon" title="Nusxa olish" disabled={pending} onClick={() => run(() => duplicateCase(r.id), "Nusxa yaratildi")}><Copy /></Button>
                      <Button variant="ghost" size="icon" title="O'chirish" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setToDelete(r)}><Trash2 /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <Dialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Mashqni o'chirasizmi?"
        description={<>&quot;{toDelete?.title}&quot; va unga tegishli barcha talaba javoblari o&apos;chiriladi. Bu amalni qaytarib bo&apos;lmaydi.</>}
        footer={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)}>Bekor qilish</Button>
            <Button variant="destructive" disabled={pending} onClick={() => { const id = toDelete!.id; setToDelete(null); run(() => deleteCase(id), "O'chirildi"); }}>
              <Trash2 /> O&apos;chirish
            </Button>
          </>
        }
      />
    </>
  );
}
