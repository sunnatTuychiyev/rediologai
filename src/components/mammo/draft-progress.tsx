"use client";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { at: 0, label: "Tasvirlar tayyorlanmoqda" },
  { at: 2, label: "AI tahlil qilmoqda" },
  { at: 9, label: "Qoralama yozilmoqda" },
];

/** So'rov davomida bosqichlarni ko'rsatadi (taxminiy vaqt bo'yicha). */
export function DraftProgress() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setSec((Date.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, []);
  const active = STEPS.reduce((acc, s, i) => (sec >= s.at ? i : acc), 0);
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-line-soft bg-card p-6 shadow-sm">
      <p className="font-display text-[17px] font-bold">Qoralama yaratilmoqda…</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Odatda 10–15 soniya. Sahifani yopmang.</p>
      <ol className="mt-4 space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s.label} className={cn("flex items-center gap-2.5 text-sm", i > active && "text-muted-foreground")}>
            <span className={cn("grid h-6 w-6 place-items-center rounded-full", i < active ? "bg-emerald-100 text-emerald-700" : i === active ? "bg-cyan-100 text-cyan-ink" : "bg-sand")}>
              {i < active ? <Check className="h-3.5 w-3.5" /> : i === active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[11px]">{i + 1}</span>}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-right text-xs tabular-nums text-muted-foreground">{sec.toFixed(0)} s</p>
    </div>
  );
}

export async function requestDraft(studyId: string): Promise<{ ok: boolean; gated?: boolean; error?: string }> {
  const res = await fetch(`/api/doctor/studies/${studyId}/draft`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error ?? "AI javob bermadi. Qayta urinib ko'ring." };
  return body;
}
