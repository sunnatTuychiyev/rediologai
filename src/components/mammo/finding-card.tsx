"use client";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "./badges";
import { cn } from "@/lib/utils";
import {
  DENSITY_LABEL,
  DEPTH_LABEL,
  FINDING_TYPE_LABEL,
  LOW_FINDING_CONFIDENCE,
  MARGIN_LABEL,
  QUADRANT_LABEL,
  SHAPE_LABEL,
  describeFinding,
} from "@/lib/mammo-rules";
import { DENSITIES, DEPTHS, FINDING_TYPES, MARGINS, QUADRANTS, SHAPES, type MammoFinding, type ViewLabel } from "@/lib/mammo-types";

type Props = {
  finding: MammoFinding;
  sideViews: ViewLabel[];
  selected: boolean;
  editing: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onToggleEdit: () => void;
  onAccept: () => void;
  onDelete: () => void;
  onChange: (f: MammoFinding) => void;
};

export function FindingCard({ finding: f, sideViews, selected, editing, readOnly, onSelect, onToggleEdit, onAccept, onDelete, onChange }: Props) {
  const low = f.origin === "ai" && f.confidence < LOW_FINDING_CONFIDENCE;
  const set = (patch: Partial<MammoFinding>) => onChange({ ...f, ...patch, review: f.origin === "doctor" ? "accepted" : "edited" });
  const setDesc = (patch: Partial<MammoFinding["descriptors"]>) => set({ descriptors: { ...f.descriptors, ...patch } });
  const setLoc = (patch: Partial<MammoFinding["location"]>) => set({ location: { ...f.location, ...patch } });

  return (
    <div
      id={`finding-${f.id}`}
      onClick={onSelect}
      className={cn(
        "rounded-[14px] border bg-card p-3.5 transition-shadow",
        low ? "border-amber-400" : "border-line-soft",
        selected && "ring-[3px] ring-cyan/60",
        f.review === "pending" && !readOnly && "bg-[#FFFBF2]",
      )}
      title={low ? "AI ishonchi past — diqqat bilan tekshiring" : undefined}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">{f.id}</span>
        <b className="text-[14.5px] text-navy">{FINDING_TYPE_LABEL[f.type]}</b>
        {f.origin === "ai" ? <ConfidenceBadge value={f.confidence} /> : <Badge variant="success">Shifokor</Badge>}
        {!readOnly && f.origin === "ai" && (
          <Badge variant={f.review === "pending" ? "warning" : f.review === "edited" ? "secondary" : "success"}>
            {f.review === "pending" ? "Ko'rib chiqilmagan" : f.review === "edited" ? "Tahrirlangan" : "Qabul qilingan"}
          </Badge>
        )}
        {f.region && <Badge variant="outline">{f.region.view}</Badge>}
      </div>
      {low && !readOnly && <p className="mt-1.5 text-[12.5px] font-medium text-[#7A3E06]">AI ishonchi past — diqqat bilan tekshiring</p>}
      {!editing && <p className="mt-2 text-[13.5px] leading-relaxed text-navy/90">{describeFinding(f)}</p>}

      {editing && !readOnly && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
          <Field label="Turi">
            <Select value={f.type} onChange={(e) => set({ type: e.target.value as MammoFinding["type"] })}>
              {FINDING_TYPES.map((t) => <option key={t} value={t}>{FINDING_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Joylashuv">
            <Select value={f.location.quadrant} onChange={(e) => setLoc({ quadrant: e.target.value as MammoFinding["location"]["quadrant"] })}>
              {QUADRANTS.map((q) => <option key={q} value={q}>{QUADRANT_LABEL[q]}</option>)}
            </Select>
          </Field>
          <Field label="Soat">
            <Input value={f.location.clockFace ?? ""} onChange={(e) => setLoc({ clockFace: e.target.value.replace(/[^\d:]/g, "").slice(0, 5) || null })} placeholder="10" />
          </Field>
          <Field label="Chuqurlik">
            <Select value={f.location.depth ?? ""} onChange={(e) => setLoc({ depth: (e.target.value || null) as MammoFinding["location"]["depth"] })}>
              <option value="">—</option>
              {DEPTHS.map((d) => <option key={d} value={d}>{DEPTH_LABEL[d]}</option>)}
            </Select>
          </Field>
          <Field label="O'lchami, mm">
            <Input
              inputMode="numeric"
              value={f.sizeMm ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                set({ sizeMm: v ? Number(v) : null });
              }}
              placeholder="—"
            />
          </Field>
          {f.type === "mass" || f.type === "intramammary_lymph_node" ? (
            <>
              <Field label="Shakli">
                <Select value={f.descriptors.shape ?? ""} onChange={(e) => setDesc({ shape: (e.target.value || null) as MammoFinding["descriptors"]["shape"] })}>
                  <option value="">—</option>
                  {SHAPES.map((s) => <option key={s} value={s}>{SHAPE_LABEL[s]}</option>)}
                </Select>
              </Field>
              <Field label="Chekkasi">
                <Select value={f.descriptors.margin ?? ""} onChange={(e) => setDesc({ margin: (e.target.value || null) as MammoFinding["descriptors"]["margin"] })}>
                  <option value="">—</option>
                  {MARGINS.map((s) => <option key={s} value={s}>{MARGIN_LABEL[s]}</option>)}
                </Select>
              </Field>
              <Field label="Zichligi">
                <Select value={f.descriptors.density ?? ""} onChange={(e) => setDesc({ density: (e.target.value || null) as MammoFinding["descriptors"]["density"] })}>
                  <option value="">—</option>
                  {DENSITIES.map((s) => <option key={s} value={s}>{DENSITY_LABEL[s]}</option>)}
                </Select>
              </Field>
            </>
          ) : null}
          {f.type === "calcifications" && (
            <>
              <Field label="Morfologiyasi">
                <Input value={f.descriptors.calcMorphology ?? ""} onChange={(e) => setDesc({ calcMorphology: e.target.value || null })} placeholder="masalan, amorf, pleomorf" />
              </Field>
              <Field label="Tarqalishi">
                <Input value={f.descriptors.calcDistribution ?? ""} onChange={(e) => setDesc({ calcDistribution: e.target.value || null })} placeholder="masalan, guruhli, segmentar" />
              </Field>
            </>
          )}
          <Field label="Proyeksiyalar" className="sm:col-span-2" group>
            <div className="flex flex-wrap gap-3 pt-1 text-sm">
              {sideViews.map((v) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={f.seenOnViews.includes(v)}
                    onChange={(e) => set({ seenOnViews: e.target.checked ? [...f.seenOnViews, v] : f.seenOnViews.filter((x) => x !== v) })}
                  />
                  {v}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Tavsif" className="sm:col-span-2">
            <Textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {f.origin === "ai" && f.review === "pending" && (
            <Button size="sm" variant="cyan" onClick={onAccept}><Check /> Qabul qilish</Button>
          )}
          <Button size="sm" variant="outline" onClick={onToggleEdit}><Pencil /> {editing ? "Tayyor" : "Tahrirlash"}</Button>
          <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={onDelete}><Trash2 /> O&apos;chirish</Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className, group }: { label: string; children: React.ReactNode; className?: string; group?: boolean }) {
  const cls = cn("flex flex-col gap-1 text-[12.5px] font-semibold text-muted-foreground", className);
  if (group) {
    return (
      <fieldset className={cls}>
        <legend className="mb-1">{label}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <label className={cls}>
      {label}
      {children}
    </label>
  );
}
