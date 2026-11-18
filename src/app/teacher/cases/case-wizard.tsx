"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, GripVertical, ImagePlus, Loader2, Plus, Save, Send, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BODY_REGIONS, CATEGORY_LABEL, DIFFICULTY_LABEL, IMPORTANCE_LABEL, MODALITY_LABEL } from "@/lib/labels";
import type { CaseInput, ReferenceFinding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { extractReferenceFindings, saveCase, type RegionInput } from "./actions";

export type WizardInitial = Omit<CaseInput, "images" | "isPublished"> & {
  images: { url: string; label: string | null }[];
  isPublished: boolean;
  regions: RegionInput[];
};

const EMPTY: WizardInitial = {
  title: "",
  modality: "XRAY",
  bodyRegion: "Ko'krak qafasi",
  difficulty: "MEDIUM",
  clinicalInfo: "",
  tags: [],
  referenceReport: "",
  referenceFindings: { findings: [], impression: "", recommendations: "" },
  images: [],
  isPublished: false,
  regions: [],
};

const STEPS = ["Asosiy ma'lumot", "Rasmlar", "Shifokor xulosasi", "Belgilash (ixtiyoriy)"];

export function CaseWizard({ caseId, initial }: { caseId: string | null; initial?: WizardInitial }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<WizardInitial>(initial ?? EMPTY);
  const [saving, startSave] = useTransition();
  const set = <K extends keyof WizardInitial>(k: K, val: WizardInitial[K]) => setV((p) => ({ ...p, [k]: val }));

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (v.title.trim().length < 3) return "Sarlavhani kiriting";
      if (v.clinicalInfo.trim().length < 5) return "Klinik ma'lumotni kiriting";
    }
    if (s === 1 && v.images.length === 0) return "Kamida bitta rasm yuklang";
    if (s === 2 && v.referenceReport.trim().length < 20) return "Shifokor xulosasini kiriting";
    return null;
  }

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const err = validateStep(s);
        if (err) {
          toast.error(err);
          setStep(s);
          return;
        }
      }
    }
    setStep(to);
  }

  function save(publish: boolean) {
    for (let s = 0; s < 3; s++) {
      const err = validateStep(s);
      if (err) {
        toast.error(err);
        setStep(s);
        return;
      }
    }
    if (publish && v.referenceFindings.findings.length === 0) {
      toast.error("Nashr qilish uchun topilmalarni ajrating (3-qadam)");
      setStep(2);
      return;
    }
    const { regions, ...rest } = v;
    startSave(async () => {
      const res = await saveCase(caseId, { ...rest, isPublished: publish }, regions);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(publish ? "Mashq nashr qilindi" : "Qoralama saqlandi");
      router.push("/teacher/cases");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => go(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
                i === step ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card hover:bg-muted",
              )}
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs", i < step ? "bg-primary text-white" : i === step ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <StepBasics v={v} set={set} />}
      {step === 1 && <StepImages images={v.images} onChange={(imgs) => { set("images", imgs); set("regions", v.regions.filter((r) => imgs.some((i) => i.url === r.imageUrl))); }} />}
      {step === 2 && <StepReport v={v} set={set} />}
      {step === 3 && <StepRegions v={v} set={set} />}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-4 backdrop-blur">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0}>Orqaga</Button>
          {step < STEPS.length - 1 && <Button variant="secondary" onClick={() => go(step + 1)}>Keyingi qadam</Button>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Qoralama sifatida saqlash
          </Button>
          <Button onClick={() => save(true)} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Send />} Nashr qilish
          </Button>
        </div>
      </div>
    </div>
  );
}

type StepProps = { v: WizardInitial; set: <K extends keyof WizardInitial>(k: K, val: WizardInitial[K]) => void };

// ---------------------------------------------------------------------------
function StepBasics({ v, set }: StepProps) {
  const [tagInput, setTagInput] = useState("");
  const addTag = () => {
    const parts = tagInput.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (parts.length) set("tags", Array.from(new Set([...v.tags, ...parts])));
    setTagInput("");
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Asosiy ma&apos;lumot</CardTitle>
        <CardDescription>Sarlavha talabalarga ko&apos;rsatilmaydi (tashxisni oshkor qilmaslik uchun).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Sarlavha (ichki)</Label>
          <Input id="title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="masalan: O'ng tomonlama pastki bo'lak pnevmoniyasi" />
        </div>
        <div className="space-y-2">
          <Label>Modallik</Label>
          <Select value={v.modality} onChange={(e) => set("modality", e.target.value as WizardInitial["modality"])}>
            {Object.entries(MODALITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Qiyinlik</Label>
          <Select value={v.difficulty} onChange={(e) => set("difficulty", e.target.value as WizardInitial["difficulty"])}>
            {Object.entries(DIFFICULTY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">Tana sohasi</Label>
          <Input id="region" list="regions" value={v.bodyRegion} onChange={(e) => set("bodyRegion", e.target.value)} />
          <datalist id="regions">{BODY_REGIONS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">Teglar (patologiya)</Label>
          <div className="flex gap-2">
            <Input id="tags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} placeholder="pnevmoniya, plevrit…" />
            <Button type="button" variant="outline" onClick={addTag}><Plus /></Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {v.tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                #{t}
                <button type="button" onClick={() => set("tags", v.tags.filter((x) => x !== t))} aria-label="O'chirish"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clinical">Klinik ma&apos;lumot (talabaga ko&apos;rsatiladi)</Label>
          <Textarea id="clinical" value={v.clinicalInfo} onChange={(e) => set("clinicalInfo", e.target.value)} placeholder="Erkak, 45 yosh, 5 kundan beri isitma va yo'tal" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function StepImages({ images, onChange }: { images: WizardInitial["images"]; onChange: (imgs: WizardInitial["images"]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type));
    if (!list.length) return toast.error("Faqat PNG, JPG yoki WEBP fayllar");
    const big = list.find((f) => f.size > 10 * 1024 * 1024);
    if (big) return toast.error(`${big.name}: 10 MB dan katta`);
    setUploading(true);
    const fd = new FormData();
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onChange([...images, ...body.files.map((f: { url: string }) => ({ url: f.url, label: null }))]);
      toast.success(`${body.files.length} ta rasm yuklandi`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Yuklashda xatolik");
    } finally {
      setUploading(false);
    }
  }

  function onReorder(to: number) {
    const from = dragIndex.current;
    if (from == null || from === to) return;
    const next = [...images];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    dragIndex.current = to;
    onChange(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Rasmlar</CardTitle>
        <CardDescription>Rentgen — odatda 1 ta rasm. KT/MRT — bir nechta kesim (tartibini sudrab o&apos;zgartiring). PNG/JPG/WEBP, har biri 10 MB gacha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition", dragOver ? "border-primary bg-accent" : "hover:bg-muted/50")}
        >
          {uploading ? <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" /> : <Upload className="mb-2 h-8 w-8 text-muted-foreground" />}
          <p className="font-medium">{uploading ? "Yuklanmoqda…" : "Rasmlarni shu yerga tashlang yoki bosing"}</p>
          <p className="text-xs text-muted-foreground">Bir nechta faylni birdaniga tanlash mumkin</p>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
        </div>
        {images.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><ImagePlus className="h-4 w-4" /> Hali rasm yuklanmagan.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {images.map((img, i) => (
              <div
                key={img.url}
                draggable
                onDragStart={() => (dragIndex.current = i)}
                onDragEnter={() => onReorder(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => (dragIndex.current = null)}
                className="group relative overflow-hidden rounded-md border bg-neutral-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                <div className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1 text-xs text-white">
                  <GripVertical className="h-3 w-3 cursor-grab" /> {i + 1}
                </div>
                <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100" aria-label="O'chirish">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <input
                  value={img.label ?? ""}
                  onChange={(e) => onChange(images.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="Belgi (ixtiyoriy)"
                  className="w-full border-t border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white placeholder:text-neutral-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function StepReport({ v, set }: StepProps) {
  const [loading, setLoading] = useState(false);
  const rf = v.referenceFindings;
  const setRf = (patch: Partial<typeof rf>) => set("referenceFindings", { ...rf, ...patch });
  const setFinding = (i: number, patch: Partial<ReferenceFinding>) => setRf({ findings: rf.findings.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  async function extract() {
    if (v.referenceReport.trim().length < 20) return toast.error("Avval shifokor xulosasini kiriting");
    if (rf.findings.length && !confirm("Mavjud topilmalar almashtiriladi. Davom etasizmi?")) return;
    setLoading(true);
    const res = await extractReferenceFindings(v.referenceReport);
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    const { source, ...data } = res.data!;
    set("referenceFindings", data);
    toast.success(source === "ai" ? `AI ${data.findings.length} ta topilmani ajratdi — tekshirib chiqing` : `Oflayn rejim: ${data.findings.length} ta topilma ajratildi (AI kaliti sozlanmagan)`);
  }

  function addFinding() {
    let n = rf.findings.length + 1;
    while (rf.findings.some((f) => f.key === `finding-${n}`)) n++;
    setRf({ findings: [...rf.findings, { key: `finding-${n}`, text: "", importance: "major", category: "finding" }] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>3. Shifokor xulosasi</CardTitle>
          <CardDescription>Haqiqiy shifokor xulosasini joylashtiring (o&apos;zbek, rus yoki ingliz tilida). Talabalarga faqat javob yuborilgandan keyin ko&apos;rsatiladi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={v.referenceReport} onChange={(e) => set("referenceReport", e.target.value)} className="min-h-[320px] font-mono text-[13px]" placeholder={"Texnika: …\nTavsif: …\nXulosa: …\nTavsiya: …"} />
          <Button onClick={extract} disabled={loading} className="w-full">
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} AI bilan topilmalarni ajratish
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Topilmalar ({rf.findings.length})</CardTitle>
          <CardDescription>Baholash aynan shu ro&apos;yxat asosida bo&apos;ladi. Tahrirlang, o&apos;chiring yoki qo&apos;shing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rf.findings.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">&quot;AI bilan topilmalarni ajratish&quot; tugmasini bosing yoki qo&apos;lda qo&apos;shing.</p>}
          {rf.findings.map((f, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <div className="flex gap-2">
                <Textarea value={f.text} onChange={(e) => setFinding(i, { text: e.target.value })} className="min-h-[40px] text-sm" rows={2} placeholder="Topilma matni" />
                <Button variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => setRf({ findings: rf.findings.filter((_, j) => j !== i) })} aria-label="O'chirish"><Trash2 /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={f.importance} onChange={(e) => setFinding(i, { importance: e.target.value as ReferenceFinding["importance"] })} className="h-8 text-xs">
                  {Object.entries(IMPORTANCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
                <Select value={f.category} onChange={(e) => setFinding(i, { category: e.target.value as ReferenceFinding["category"] })} className="h-8 text-xs">
                  {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addFinding}><Plus /> Topilma qo&apos;shish</Button>
          <div className="space-y-2 pt-2">
            <Label>Yakuniy xulosa (tashxis)</Label>
            <Textarea value={rf.impression} onChange={(e) => setRf({ impression: e.target.value })} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Tavsiyalar</Label>
            <Textarea value={rf.recommendations} onChange={(e) => setRf({ recommendations: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function StepRegions({ v, set }: StepProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [findingKey, setFindingKey] = useState(v.referenceFindings.findings.find((f) => f.category === "finding")?.key ?? v.referenceFindings.findings[0]?.key ?? "");
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const img = v.images[imgIdx];
  const findings = v.referenceFindings.findings;
  const regions = v.regions.filter((r) => r.imageUrl === img?.url);

  const rel = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  if (!img || findings.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Belgilash uchun avval rasm yuklang va topilmalarni ajrating.</CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Topilmalarni rasmda belgilash</CardTitle>
        <CardDescription>Topilmani tanlang va rasm ustida to&apos;rtburchak chizing. Natija sahifasida o&apos;tkazib yuborilgan topilmalar qizil ramka bilan ko&apos;rsatiladi.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {v.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {v.images.map((im, i) => (
                <button key={im.url} type="button" onClick={() => setImgIdx(i)} className={cn("relative shrink-0 overflow-hidden rounded border-2", i === imgIdx ? "border-primary" : "border-transparent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="h-14 w-14 object-cover" />
                  <span className="absolute bottom-0 right-0 bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-center rounded-md bg-neutral-950 p-2">
            <div
              ref={boxRef}
              className="relative cursor-crosshair touch-none select-none"
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = rel(e); setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
              onPointerMove={(e) => draft && setDraft({ ...draft, x1: rel(e).x, y1: rel(e).y })}
              onPointerUp={() => {
                if (!draft) return;
                const x = Math.min(draft.x0, draft.x1), y = Math.min(draft.y0, draft.y1);
                const width = Math.abs(draft.x1 - draft.x0), height = Math.abs(draft.y1 - draft.y0);
                setDraft(null);
                if (width < 0.02 || height < 0.02 || !findingKey) return;
                set("regions", [...v.regions, { imageUrl: img.url, findingKey, x, y, width, height }]);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" draggable={false} className="block max-h-[480px] max-w-full" />
              {regions.map((r, i) => (
                <div key={i} className="pointer-events-none absolute border-2 border-red-500" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }}>
                  <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-red-600 px-1 text-[10px] text-white">{findings.find((f) => f.key === r.findingKey)?.text.slice(0, 30)}</span>
                </div>
              ))}
              {draft && (
                <div className="pointer-events-none absolute border-2 border-dashed border-cyan" style={{ left: `${Math.min(draft.x0, draft.x1) * 100}%`, top: `${Math.min(draft.y0, draft.y1) * 100}%`, width: `${Math.abs(draft.x1 - draft.x0) * 100}%`, height: `${Math.abs(draft.y1 - draft.y0) * 100}%` }} />
              )}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Chiziladigan topilma</Label>
            <Select value={findingKey} onChange={(e) => setFindingKey(e.target.value)}>
              {findings.map((f) => <option key={f.key} value={f.key}>{f.text.slice(0, 60) || f.key}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Belgilangan sohalar ({v.regions.length})</Label>
            {v.regions.length === 0 && <p className="text-sm text-muted-foreground">Hali belgilanmagan.</p>}
            {v.regions.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                <span className="line-clamp-1">
                  <span className="text-muted-foreground">#{v.images.findIndex((im) => im.url === r.imageUrl) + 1}</span> {findings.find((f) => f.key === r.findingKey)?.text ?? r.findingKey}
                </span>
                <button type="button" onClick={() => set("regions", v.regions.filter((_, j) => j !== i))} className="text-red-600" aria-label="O'chirish"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
