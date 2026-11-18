"use client";
import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageViewer, type ViewerImage, type ViewerRegion } from "./image-viewer";

type FindingLite = { key: string; referenceText: string; status: "correct" | "partial" | "missed" };

const STATUS = {
  missed: { dot: "bg-[#F87171]", ring: "border-[#F87171]", text: "O'tkazib yuborilgan", cls: "text-[#7F1D1D] bg-[#FDE8E8]" },
  partial: { dot: "bg-[#FBBF24]", ring: "border-[#FBBF24]", text: "Qisman", cls: "text-[#7A3E06] bg-[#FDF1DC]" },
  correct: { dot: "bg-[#4ADE80]", ring: "border-[#4ADE80]", text: "To'g'ri topilgan", cls: "text-[#14532D] bg-[#E7F6EC]" },
};
const ORDER = { missed: 0, partial: 1, correct: 2 };

/**
 * Natija sahifasidagi tasvir: o'tkazib yuborilgan topilmalar qizil, to'g'ri topilganlar yashil doira bilan.
 * Ro'yxatdagi topilma bosilsa, ko'rish oynasi o'sha topilma eng katta ko'rinadigan kesimga o'tadi.
 */
export function ResultImage({ images, regions, findings, className }: { images: ViewerImage[]; regions: ViewerRegion[]; findings: FindingLite[]; className?: string }) {
  const indexById = useMemo(() => new Map(images.map((im, i) => [im.id, i])), [images]);

  // Har bir topilma uchun: eng katta sohali kesim
  const targets = useMemo(() => {
    const best = new Map<string, { index: number; area: number }>();
    for (const r of regions) {
      if (!r.key) continue;
      const idx = indexById.get(r.imageId);
      if (idx == null) continue;
      const area = r.width * r.height;
      const cur = best.get(r.key);
      if (!cur || area > cur.area) best.set(r.key, { index: idx, area });
    }
    return best;
  }, [regions, indexById]);

  const marked = findings
    .filter((f) => targets.has(f.key))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const unmarked = findings.filter((f) => !targets.has(f.key) && f.status !== "correct");

  const first = marked[0];
  const [focus, setFocus] = useState<{ index: number; n: number } | undefined>(first ? { index: targets.get(first.key)!.index, n: 0 } : undefined);
  const [active, setActive] = useState<string | undefined>(first?.key);

  const go = (key: string) => {
    const t = targets.get(key);
    if (!t) return;
    setActive(key);
    setFocus((f) => ({ index: t.index, n: (f?.n ?? 0) + 1 }));
  };

  return (
    <div className={cn("flex flex-col lg:flex-row", className)}>
      <ImageViewer images={images} regions={regions} regionShape="circle" focus={focus} className="h-[480px] lg:h-[600px] lg:flex-1" />
      <aside className="flex w-full flex-col gap-3 border-t border-line-soft p-4 lg:w-[320px] lg:border-l lg:border-t-0">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-dashed border-[#F87171]" /> O&apos;tkazib yuborilgan</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-[#4ADE80]" /> To&apos;g&apos;ri topilgan</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-[#FBBF24]" /> Qisman</span>
        </div>

        {marked.length === 0 ? (
          <p className="rounded-lg bg-surface2 p-3 text-sm text-muted-foreground">
            Bu mashqda tasvirda joylar belgilanmagan — topilmalar tahlilini yuqoridagi jadvaldan ko&apos;ring.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {marked.map((f) => {
              const st = STATUS[f.status];
              const t = targets.get(f.key)!;
              return (
                <li key={f.key}>
                  <button
                    type="button"
                    onClick={() => go(f.key)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-xl border bg-card p-3 text-left text-sm transition hover:border-navy",
                      active === f.key ? "border-navy shadow-sm" : "border-line-soft",
                    )}
                  >
                    <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", st.dot)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("mb-1 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold", st.cls)}>{st.text}</span>
                      <span className="block leading-snug text-navy">{f.referenceText}</span>
                      {images.length > 1 && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-cyan-ink">
                          <Crosshair className="h-3.5 w-3.5" /> {t.index + 1}-kesimda ko&apos;rsatish
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {unmarked.length > 0 && marked.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Yana {unmarked.length} ta o&apos;tkazilgan/qisman topilma tasvirda belgilanmagan (masalan, normal tuzilmalar) — jadvalga qarang.
          </p>
        )}
      </aside>
    </div>
  );
}
