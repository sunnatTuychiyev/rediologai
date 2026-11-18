"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app-shell";
import { MODALITY_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { createAssignment, deleteAssignment } from "../groups/actions";

type A = { id: string; title: string; group: string; mode: string; timeLimitMin: number | null; startsAt: string; endsAt: string; showFeedback: boolean; caseCount: number; submissions: number };

const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function AssignmentsClient({ groups, cases, assignments }: { groups: { id: string; name: string }[]; cases: { id: string; title: string; modality: string }[]; assignments: A[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: "", groupId: groups[0]?.id ?? "", caseIds: [] as string[], mode: "PRACTICE" as "PRACTICE" | "EXAM",
    timeLimitMin: "", startsAt: toLocal(new Date()), endsAt: toLocal(new Date(Date.now() + 7 * 86400000)), showFeedback: false,
  });

  function submit() {
    start(async () => {
      const r = await createAssignment({
        ...f,
        timeLimitMin: f.timeLimitMin ? Number(f.timeLimitMin) : null,
        startsAt: new Date(f.startsAt),
        endsAt: new Date(f.endsAt),
      });
      if (r.ok) { toast.success("Topshiriq yaratildi"); setOpen(false); router.refresh(); } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      {!open ? (
        <Button onClick={() => setOpen(true)} disabled={!groups.length}><Plus /> Yangi topshiriq</Button>
      ) : (
        <Card>
          <CardHeader><CardTitle>Yangi topshiriq</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Nomi</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Guruh</Label>
              <Select value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
            </div>
            <div className="space-y-2"><Label>Rejim</Label>
              <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "PRACTICE" | "EXAM" })}>
                <option value="PRACTICE">Mashq (natija darhol)</option><option value="EXAM">Imtihon (1 urinish, taymer)</option>
              </Select>
            </div>
            <div className="space-y-2"><Label>Boshlanish</Label><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></div>
            <div className="space-y-2"><Label>Tugash</Label><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></div>
            {f.mode === "EXAM" && (
              <>
                <div className="space-y-2"><Label>Vaqt chegarasi (daqiqa, har bir mashq)</Label><Input type="number" min={1} value={f.timeLimitMin} onChange={(e) => setF({ ...f, timeLimitMin: e.target.value })} /></div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" checked={f.showFeedback} onChange={(e) => setF({ ...f, showFeedback: e.target.checked })} className="accent-[#0F1E3A]" />
                  Natijani darhol ko&apos;rsatish (aks holda muddat tugagach)
                </label>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Mashqlar ({f.caseIds.length} tanlandi)</Label>
              <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {cases.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" className="accent-[#0F1E3A]" checked={f.caseIds.includes(c.id)} onChange={(e) => setF({ ...f, caseIds: e.target.checked ? [...f.caseIds, c.id] : f.caseIds.filter((x) => x !== c.id) })} />
                    <Badge variant="secondary">{MODALITY_LABEL[c.modality]}</Badge> <span className="line-clamp-1">{c.title}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={submit} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Yaratish</Button>
              <Button variant="outline" onClick={() => setOpen(false)}>Bekor qilish</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {assignments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Topshiriq yo'q" text="Guruhga mashq yoki imtihon tayinlang." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 font-medium">{a.title} <Badge variant={a.mode === "EXAM" ? "danger" : "default"}>{a.mode === "EXAM" ? "Imtihon" : "Mashq"}</Badge></div>
                  <p className="text-xs text-muted-foreground">
                    {a.group} · {a.caseCount} mashq · {formatDate(a.startsAt)} — {formatDate(a.endsAt)}
                    {a.timeLimitMin ? ` · ${a.timeLimitMin} daq.` : ""} · {a.submissions} javob
                    {a.mode === "EXAM" && !a.showFeedback ? " · natija muddatdan keyin" : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-red-600" disabled={pending} onClick={() => start(async () => { const r = await deleteAssignment(a.id); if (r.ok) { toast.success("O'chirildi"); router.refresh(); } else toast.error(r.error); })}>
                  <Trash2 />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
