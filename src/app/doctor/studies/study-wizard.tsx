"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, FileImage, Loader2, ShieldCheck, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DraftProgress, requestDraft } from "@/components/mammo/draft-progress";
import { INDICATION_LABEL } from "@/lib/mammo-rules";
import { DEMO_STUDIES, demoFileBase } from "@/lib/mammo-demo";
import { cn } from "@/lib/utils";
import { createStudy, updateImageViews, updateStudyInfo } from "../actions";

export type WizardImage = {
  id: string;
  url: string;
  laterality: "R" | "L";
  view: "CC" | "MLO" | "OTHER";
  sourceFormat: string;
  width: number;
  height: number;
  pixelSpacing: number | null;
  fromDicom?: boolean;
};

type Existing = {
  id: string;
  code: string;
  patientAge: number | null;
  indication: "SCREENING" | "DIAGNOSTIC";
  clinicalInfo: string;
  priorStudyId: string | null;
  images: WizardImage[];
};

const STEPS = ["Bemor va klinik ma'lumot", "Tasvirlar", "Tekshirish va yuborish"];
const ACCEPT = ".dcm,.dicom,application/dicom,image/png,image/jpeg,image/webp";

export function StudyWizard({ priorStudies, existing }: { priorStudies: { id: string; code: string; date: string; birads: string | null }[]; existing?: Existing }) {
  const router = useRouter();
  const [step, setStep] = useState(existing ? 1 : 0);
  const [studyId, setStudyId] = useState<string | null>(existing?.id ?? null);
  const [code, setCode] = useState(existing?.code ?? "");
  const [age, setAge] = useState(existing?.patientAge ? String(existing.patientAge) : "");
  const [indication, setIndication] = useState<"SCREENING" | "DIAGNOSTIC">(existing?.indication ?? "SCREENING");
  const [clinicalInfo, setClinicalInfo] = useState(existing?.clinicalInfo ?? "");
  const [priorId, setPriorId] = useState(existing?.priorStudyId ?? "");
  const [images, setImages] = useState<WizardImage[]>(existing?.images ?? []);
  const [uploading, setUploading] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [realDemos, setRealDemos] = useState<{ title: string; files: string[]; clinicalInfo: string; age: number }[]>([]);
  useEffect(() => {
    fetch("/demo/mammo/cmmd/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRealDemos)
      .catch(() => setRealDemos([]));
  }, []);

  async function loadRealDemo(d: { files: string[]; clinicalInfo: string; age: number }) {
    const files: File[] = [];
    for (const f of d.files) {
      const res = await fetch(`/demo/mammo/cmmd/${f}`);
      if (!res.ok) return toast.error(`${f} topilmadi`);
      files.push(new File([await res.blob()], f, { type: "application/dicom" }));
    }
    if (!clinicalInfo && studyId) {
      setClinicalInfo(d.clinicalInfo);
      setAge(String(d.age));
      await updateStudyInfo(studyId, { patientAge: d.age, indication, clinicalInfo: d.clinicalInfo, priorStudyId: priorId || null });
    }
    await upload(files);
  }

  const info = () => ({ patientAge: age ? Number(age) : null, indication, clinicalInfo, priorStudyId: priorId || null });

  async function submitInfo() {
    if (age && (!/^\d+$/.test(age) || Number(age) < 18 || Number(age) > 110)) return toast.error("Yoshni to'g'ri kiriting (18–110)");
    setBusy(true);
    const res = studyId ? await updateStudyInfo(studyId, info()) : await createStudy(info());
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (!studyId && res.data) {
      const d = res.data as { id: string; code: string };
      setStudyId(d.id);
      setCode(d.code);
      // Sahifa yangilansa ham davom ettirish mumkin bo'lsin
      window.history.replaceState(null, "", `/doctor/studies/${d.id}`);
    }
    setStep(1);
  }

  const upload = useCallback(
    async (files: File[]) => {
      if (!studyId) return;
      const free = 4 - images.length - uploading.length;
      if (files.length > free) toast.warning(`Ko'pi bilan 4 ta proyeksiya. ${Math.max(free, 0)} ta fayl qabul qilinadi.`);
      for (const f of files.slice(0, Math.max(free, 0))) {
        setUploading((u) => [...u, f.name]);
        const form = new FormData();
        form.append("file", f);
        try {
          const res = await fetch(`/api/doctor/studies/${studyId}/images`, { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) toast.error(body.error ?? `${f.name}: yuklab bo'lmadi`);
          else {
            setImages((im) => [...im, body.image]);
            if (body.warnings?.length) setWarnings((w) => [...w, ...body.warnings]);
            if (body.removedTags?.length && body.image.sourceFormat === "DICOM") toast.success(`${f.name}: ${body.removedTags.length} ta shaxsiy teg olib tashlandi`);
          }
        } catch {
          toast.error(`${f.name}: tarmoq xatosi`);
        } finally {
          setUploading((u) => u.filter((n) => n !== f.name));
        }
      }
    },
    [studyId, images.length, uploading.length],
  );

  async function loadDemo(slug: string) {
    const demo = DEMO_STUDIES.find((d) => d.slug === slug);
    if (!demo) return;
    const files: File[] = [];
    for (const v of demo.views) {
      const name = `${demoFileBase(slug, v)}.png`;
      const res = await fetch(`/demo/mammo/${name}`);
      if (!res.ok) return toast.error(`${name} topilmadi — avval "npx prisma db seed" ni ishga tushiring`);
      files.push(new File([await res.blob()], name, { type: "image/png" }));
    }
    if (!clinicalInfo && step === 1 && studyId) {
      // Demo uchun klinik ma'lumotni ham to'ldiramiz
      setClinicalInfo(demo.clinicalInfo);
      setAge(String(demo.patientAge));
      setIndication(demo.indication);
      await updateStudyInfo(studyId, { patientAge: demo.patientAge, indication: demo.indication, clinicalInfo: demo.clinicalInfo, priorStudyId: priorId || null });
    }
    await upload(files);
  }

  async function removeImage(id: string) {
    if (!studyId) return;
    const res = await fetch(`/api/doctor/studies/${studyId}/images/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "O'chirib bo'lmadi");
    setImages((im) => im.filter((i) => i.id !== id));
  }

  const keys = images.filter((i) => i.view !== "OTHER").map((i) => `${i.laterality}-${i.view}`);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  const missing = ["R-CC", "L-CC", "R-MLO", "L-MLO"].filter((v) => !keys.includes(v));

  async function saveViews() {
    if (!studyId) return false;
    if (!images.length) {
      toast.error("Kamida bitta tasvir yuklang");
      return false;
    }
    if (duplicates.length) {
      toast.error(`Bir xil proyeksiya ikki marta: ${Array.from(new Set(duplicates)).join(", ")}`);
      return false;
    }
    setBusy(true);
    const res = await updateImageViews(studyId, images.map((i) => ({ id: i.id, laterality: i.laterality, view: i.view })));
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    return res.ok;
  }

  async function generate() {
    if (!studyId) return;
    if (!(await saveViews())) return;
    setDrafting(true);
    const res = await requestDraft(studyId);
    if (!res.ok) {
      setDrafting(false);
      toast.error(res.error);
      return;
    }
    if (res.gated) toast.warning("Shifokor e'tibori kerak — qoralama bloklandi");
    else toast.success("Qoralama tayyor");
    router.replace(`/doctor/studies/${studyId}`);
    router.refresh();
  }

  if (drafting) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <DraftProgress />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.02em] sm:text-[32px]">Yangi tekshiruv</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">Mammografiya — ko&apos;krak bezi rentgenografiyasi{code && <> · <b className="text-navy">{code}</b></>}</p>
      </div>

      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold", i === step ? "border-navy bg-navy text-white" : i < step ? "border-line bg-cyan-100 text-[#075E6A]" : "border-line text-muted-foreground")}>
            <span className="tabular-nums">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bemor va klinik ma&apos;lumot</CardTitle>
            <CardDescription>Tizim faqat anonim tekshiruv kodi bilan ishlaydi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-[14px] border border-amber-200 bg-[#FDF1DC] p-3.5 text-[13.5px] text-[#7A3E06]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Bemorning shaxsiy ma&apos;lumotlarini kiritmang (ism, pasport, telefon). Tizim faqat anonim kod bilan ishlaydi.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="age">Yoshi</Label>
                <Input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Masalan, 52" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind">Ko&apos;rsatma</Label>
                <Select id="ind" value={indication} onChange={(e) => setIndication(e.target.value as "SCREENING" | "DIAGNOSTIC")}>
                  <option value="SCREENING">{INDICATION_LABEL.SCREENING}</option>
                  <option value="DIAGNOSTIC">{INDICATION_LABEL.DIAGNOSTIC}</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci">Klinik ma&apos;lumot</Label>
              <Textarea
                id="ci"
                rows={4}
                value={clinicalInfo}
                onChange={(e) => setClinicalInfo(e.target.value)}
                placeholder="Shikoyatlar, paypaslanadigan hosila tomoni, oilaviy anamnez, gormonal terapiya, oldingi operatsiyalar…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prior">Oldingi tekshiruv (ixtiyoriy)</Label>
              <Select id="prior" value={priorId} onChange={(e) => setPriorId(e.target.value)}>
                <option value="">— Yo&apos;q —</option>
                {priorStudies.filter((p) => p.id !== studyId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.date}{p.birads ? ` · BI-RADS ${p.birads}` : ""}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Faqat tasdiqlangan xulosasi bor tekshiruvlar. AI oldingi xulosa matni bilan solishtiradi.</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={submitInfo} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Davom etish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Tasvirlar</CardTitle>
            <CardDescription>1–4 ta proyeksiya: R-CC, L-CC, R-MLO, L-MLO. DICOM (.dcm) ≤ 50 MB, PNG/JPG/WEBP ≤ 10 MB.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                upload(Array.from(e.dataTransfer.files));
              }}
              className={cn("flex flex-col items-center justify-center rounded-[14px] border-2 border-dashed px-4 py-8 text-center transition-colors", dragOver ? "border-cyan-ink bg-cyan-100" : "border-line bg-surface2")}
            >
              <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="font-semibold text-navy">Fayllarni shu yerga tashlang</p>
              <p className="text-[13px] text-muted-foreground">yoki</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => inputRef.current?.click()} disabled={images.length + uploading.length >= 4}>
                <FileImage /> Fayl tanlash
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  upload(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              {images.length + uploading.length === 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <span>Demo to&apos;plam:</span>
                  {DEMO_STUDIES.map((d) => (
                    <button key={d.slug} type="button" onClick={() => loadDemo(d.slug)} className="rounded-full border border-line bg-card px-2.5 py-1 font-semibold text-navy hover:border-cyan-ink hover:bg-cyan-100">
                      {d.title}
                    </button>
                  ))}
                  <a className="ml-1 text-cyan-ink underline" href="/demo/mammo/index.html" target="_blank" rel="noreferrer">fayllar</a>
                  {realDemos.length > 0 && (
                    <span className="flex w-full flex-wrap items-center justify-center gap-1.5 pt-1">
                      <span>Haqiqiy DICOM (CMMD):</span>
                      {realDemos.map((d) => (
                        <button key={d.title} type="button" onClick={() => loadRealDemo(d)} className="rounded-full border border-cyan-ink/40 bg-cyan-100 px-2.5 py-1 font-semibold text-navy hover:border-cyan-ink">
                          {d.title.replace("Haqiqiy DICOM: ", "")}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((im) => (
                <div key={im.id} className="flex gap-3 rounded-[14px] border border-line-soft bg-card p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="h-24 w-20 shrink-0 rounded-md bg-black object-contain" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary">{im.sourceFormat}</Badge>
                      <span className="truncate text-xs text-muted-foreground">{im.width}×{im.height}{im.pixelSpacing ? ` · ${im.pixelSpacing.toFixed(3)} mm/px` : ""}</span>
                      <button type="button" className="ml-auto text-muted-foreground hover:text-red-600" onClick={() => removeImage(im.id)} aria-label="O'chirish">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select aria-label="Tomon" className="min-h-9 text-sm" value={im.laterality} onChange={(e) => setImages((all) => all.map((x) => (x.id === im.id ? { ...x, laterality: e.target.value as "R" | "L" } : x)))}>
                        <option value="R">O&apos;ng (R)</option>
                        <option value="L">Chap (L)</option>
                      </Select>
                      <Select aria-label="Proyeksiya" className="min-h-9 text-sm" value={im.view} onChange={(e) => setImages((all) => all.map((x) => (x.id === im.id ? { ...x, view: e.target.value as WizardImage["view"] } : x)))}>
                        <option value="CC">CC</option>
                        <option value="MLO">MLO</option>
                        <option value="OTHER">Boshqa</option>
                      </Select>
                    </div>
                    {im.fromDicom && <p className="text-[11px] text-muted-foreground">DICOM teglaridan to&apos;ldirildi</p>}
                  </div>
                </div>
              ))}
              {uploading.map((n) => (
                <div key={n} className="flex items-center gap-3 rounded-[14px] border border-dashed border-line p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {n} — anonimlashtirilmoqda…
                </div>
              ))}
            </div>

            {(duplicates.length > 0 || (images.length > 0 && missing.length > 0) || warnings.length > 0) && (
              <div className="space-y-1.5 rounded-[14px] border border-amber-200 bg-[#FDF1DC] p-3.5 text-[13.5px] text-[#7A3E06]">
                {duplicates.length > 0 && <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Takrorlangan proyeksiya: {Array.from(new Set(duplicates)).join(", ")}</p>}
                {images.length > 0 && missing.length > 0 && <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Yetishmayotgan proyeksiyalar: {missing.join(", ")} — AI ishonchi pasayadi.</p>}
                {warnings.map((w, i) => <p key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}</p>)}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft /> Orqaga</Button>
              <Button onClick={async () => (await saveViews()) && setStep(2)} disabled={busy || uploading.length > 0 || !images.length}>
                {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Davom etish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Tekshirish va yuborish</CardTitle>
            <CardDescription>AI qoralama yozadi — tashxis qo&apos;ymaydi. Yakuniy xulosani siz tasdiqlaysiz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Tekshiruv kodi</dt><dd className="font-semibold">{code}</dd></div>
              <div><dt className="text-muted-foreground">Yoshi / ko&apos;rsatma</dt><dd className="font-semibold">{age || "—"} · {INDICATION_LABEL[indication]}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Klinik ma&apos;lumot</dt><dd>{clinicalInfo || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Proyeksiyalar</dt><dd className="font-semibold">{images.map((i) => `${i.laterality}-${i.view}`).join(", ")}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {images.map((im) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={im.id} src={im.url} alt={`${im.laterality}-${im.view}`} className="h-28 w-24 rounded-md bg-black object-contain" />
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft /> Orqaga</Button>
              <Button variant="cyan" size="lg" onClick={generate} disabled={busy}>
                <Sparkles /> Qoralama yaratish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
