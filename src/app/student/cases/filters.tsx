"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { DIFFICULTY_LABEL, MODALITY_LABEL } from "@/lib/labels";

export function CaseFilters({ regions, hideModality = false }: { regions: string[]; hideModality?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = new URLSearchParams(params.toString());
    if (e.target.value) p.set(k, e.target.value);
    else p.delete(k);
    router.replace(`${pathname}?${p.toString()}`);
  };
  return (
    <div className={`mb-6 grid gap-3 ${hideModality ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
      {!hideModality && (
        <Select value={params.get("modality") ?? ""} onChange={set("modality")} aria-label="Modallik">
          <option value="">Barcha modalliklar</option>
          {Object.entries(MODALITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      )}
      <Select value={params.get("region") ?? ""} onChange={set("region")} aria-label="Soha">
        <option value="">Barcha sohalar</option>
        {regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
      <Select value={params.get("difficulty") ?? ""} onChange={set("difficulty")} aria-label="Qiyinlik">
        <option value="">Barcha qiyinliklar</option>
        {Object.entries(DIFFICULTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <Select value={params.get("status") ?? ""} onChange={set("status")} aria-label="Holat">
        <option value="">Barchasi</option>
        <option value="done">Yechilgan</option>
        <option value="todo">Yechilmagan</option>
      </Select>
    </div>
  );
}
