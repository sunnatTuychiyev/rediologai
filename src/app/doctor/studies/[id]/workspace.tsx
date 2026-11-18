"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertOctagon,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  GraduationCap,
  History,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MammoViewer, type MammoImage } from "@/components/mammo/mammo-viewer";
import { FindingCard } from "@/components/mammo/finding-card";
import { BiradsBadge, ConfidenceBadge, StudyStatusBadge } from "@/components/mammo/badges";
import { DraftProgress, requestDraft } from "@/components/mammo/draft-progress";
import { ModelPanel, type ModelEval } from "@/components/mammo/model-panel";
import { PrintPdfButton } from "@/components/mammo/print-pdf-button";
import { ModelMetricsCorner } from "@/components/mammo/model-metrics-corner";
import type { EngineResult } from "@/lib/mammo-model";
import {
  AUDIT_ACTION_LABEL,
  COMPOSITION_LABEL,
  INDICATION_LABEL,
  QUALITY_LABEL,
  SIDE_LABEL,
  finalText,
  overallOf,
  pendingAiFindings,
  recommendationFor,
  type RenderMeta,
} from "@/lib/mammo-rules";
import { BIRADS, COMPOSITIONS, QUALITIES, type Change, type EditStats, type MammoFinding, type ReportPayload, type Side, type ViewLabel } from "@/lib/mammo-types";
import { cn, formatDate } from "@/lib/utils";
import { approveReport, revealGatedDraft, saveReport, sendToTrainer } from "../../actions";

export type DraftInfo = {
  id: string;
  version: number;
  source: string;
  model: string;
  effort: string;
  latencyMs: number;
  confidence: number;
  gated: boolean;
  revealed: boolean;
  attentionReasons: string[];
  limitations: string;
  createdAt: string;
};

export type TimelineEntry = { id: string; action: string; at: string; user: string; summary: string; changes: Change[] };

type Props = {
  study: { id: string; code: string; status: string; error: string | null };
  meta: RenderMeta;
  images: MammoImage[];
  initialPayload: ReportPayload;
  reportStatus: "IN_REVIEW" | "APPROVED";
  approvedText: string | null;
  approved: { doctorName: string; at: string } | null;
  editStats: EditStats | null;
  draft: DraftInfo | null;
  timeline: TimelineEntry[];
  teachers: { id: string; name: string }[];
  sentCaseId: string | null;
  engineResult: EngineResult | null;
  modelEval: ModelEval;
  groundTruth: { label: string; abnormality?: string; source?: string } | null;
};

type Tab = "structured" | "text" | "history";

export function Workspace(props: Props) {
  const { study, meta, images, draft, reportStatus } = props;
  const router = useRouter();
  const readOnly = reportStatus === "APPROVED";
  const [payload, setPayload] = useState<ReportPayload>(props.initialPayload);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(readOnly ? "text" : "structured");
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; at?: string }>({ kind: "idle" });
  const [approveOpen, setApproveOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const dirty = useRef(false);
  const latest = useRef(payload);
  latest.current = payload;

  const gatedHidden = Boolean(draft?.gated && !draft.revealed && !readOnly);
  const overall = overallOf(payload);
  const text = useMemo(() => (readOnly && props.approvedText ? props.approvedText : finalText(payload, meta)), [payload, meta, readOnly, props.approvedText]);
  const pending = pendingAiFindings(payload);
  const allFindings = [...payload.breasts.right.findings, ...payload.breasts.left.findings];

  // -------- Avtosaqlash (har o'zgarishdan 2.5 s keyin) --------
  const flush = useCallback(async () => {
    if (!dirty.current || readOnly) return true;
    dirty.current = false;
    setSaveState({ kind: "saving" });
    const res = await saveReport(study.id, latest.current);
    if (!res.ok) {
      dirty.current = true;
      setSaveState({ kind: "error" });
      toast.error(res.error);
      return false;
    }
    setSaveState({ kind: "saved", at: res.data?.savedAt });
    return true;
  }, [study.id, readOnly]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(flush, 2500);
    return () => clearTimeout(t);
  }, [payload, flush]);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const update = (fn: (p: ReportPayload) => ReportPayload) => {
    if (readOnly) return;
    dirty.current = true;
    setPayload((p) => fn(structuredClone(p)));
  };

  const changeFinding = (side: Side, f: MammoFinding) =>
    update((p) => {
      p.breasts[side].findings = p.breasts[side].findings.map((x) => (x.id === f.id ? f : x));
      return p;
    });

  const deleteFinding = (side: Side, id: string) =>
    update((p) => {
      const f = p.breasts[side].findings.find((x) => x.id === id);
      p.breasts[side].findings = p.breasts[side].findings.filter((x) => x.id !== id);
      if (f?.origin === "ai") p.deletedAiFindings.push(f);
      return p;
    });

  const addFinding = (side: Side) => {
    const id = `d${Date.now().toString(36).slice(-6)}`;
    update((p) => {
      p.breasts[side].findings.push({
        id,
        type: "mass",
        description: "",
        location: { quadrant: "UOQ", clockFace: null, depth: null },
        sizeMm: null,
        descriptors: { shape: null, margin: null, density: null, calcMorphology: null, calcDistribution: null },
        seenOnViews: [],
        region: null,
        confidence: 1,
        origin: "doctor",
        review: "accepted",
      });
      return p;
    });
    setEditing(id);
    setSelected(id);
  };

  const select = (id: string) => {
    setSelected(id);
    setTab("structured");
    requestAnimationFrame(() => document.getElementById(`finding-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  async function regenerate() {
    if (!confirm("Yangi qoralama yaratilsinmi? Joriy tahrirlaringiz yangi AI qoralamasi bilan almashtiriladi (audit jurnalida saqlanadi).")) return;
    await flush();
    setRegenerating(true);
    const res = await requestDraft(study.id);
    setRegenerating(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.gated ? "Qoralama bloklandi — shifokor e'tibori kerak" : "Yangi qoralama tayyor");
    router.refresh();
  }

  async function reveal() {
    const res = await revealGatedDraft(study.id);
    if (!res.ok) return toast.error(res.error);
    toast.message("Bloklangan qoralama ko'rsatildi — audit jurnaliga yozildi");
    router.refresh();
  }

  const sideViews = (side: Side) => images.map((i) => i.label as ViewLabel).filter((l) => l.startsWith(side === "right" ? "R" : "L"));

  if (regenerating || study.status === "DRAFTING") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        {regenerating ? <DraftProgress /> : (
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">AI tahlil qilmoqda…</p>
            <Button variant="outline" className="mt-4" onClick={() => router.refresh()}>Yangilash</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-card px-4 py-2.5">
        <Link href="/doctor/studies" className="text-[13px] font-semibold text-cyan-ink hover:underline">← Tekshiruvlar</Link>
        <h1 className="font-display text-lg font-extrabold">{study.code}</h1>
        <StudyStatusBadge status={study.status} />
        <span className="text-[13px] text-muted-foreground">
          {meta.patientAge ? `${meta.patientAge} yosh · ` : ""}
          {INDICATION_LABEL[meta.indication]}
        </span>
        {draft && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {draft.source === "OFFLINE" ? "Oflayn qoralama" : props.engineResult ? `Model v${draft.version}` : `AI v${draft.version}`} · {(draft.latencyMs / 1000).toFixed(1)} s · {props.engineResult ? "ansambl kelishuvi" : "ishonch"} <ConfidenceBadge value={draft.confidence} />
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!readOnly && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {saveState.kind === "saving" ? "Saqlanmoqda…" : saveState.kind === "saved" ? `Saqlandi ${saveState.at ? formatDate(saveState.at).slice(-5) : ""}` : saveState.kind === "error" ? "Saqlanmadi" : ""}
            </span>
          )}
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={regenerate}><RefreshCw /> Qayta yaratish</Button>
          )}
          <PrintPdfButton studyId={study.id} code={study.code} approved={readOnly} saveFirst={readOnly ? undefined : flush} />
          {readOnly ? null : (
            <Button size="sm" onClick={async () => { await flush(); setApproveOpen(true); }}>
              <ClipboardCheck /> Tasdiqlash
            </Button>
          )}
        </div>
      </div>

      {/* Doimiy ogohlantirish */}
      <div className={cn("flex items-center gap-2 px-4 py-1.5 text-[12.5px] font-semibold", readOnly ? "bg-[#E7F6EC] text-[#14532D]" : "bg-[#FDF1DC] text-[#7A3E06]")}>
        {readOnly ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        {readOnly && props.approved
          ? `Tasdiqlangan xulosa — ${props.approved.doctorName}, ${formatDate(props.approved.at)}. Faqat o'qish uchun.`
          : "AI qoralamasi — tashxis emas. Yakuniy xulosa uchun shifokor javobgar."}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <MammoViewer images={images} findings={allFindings} selectedId={selected} onSelect={select} className="h-[70vh] lg:h-auto" />

        <div className="flex min-h-0 flex-col border-l border-line-soft bg-background">
          <div className="flex gap-1 border-b border-line-soft bg-card px-3 pt-2">
            {([
              ["structured", "Tuzilgan muharrir", ClipboardCheck],
              ["text", readOnly ? "Xulosa matni" : "Matn rejimi", FileText],
              ["history", "Tarix", History],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-semibold", tab === key ? "border-navy text-navy" : "border-transparent text-muted-foreground hover:text-navy")}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {study.status === "ERROR" && study.error && (
              <div className="rounded-[14px] border border-red-200 bg-[#FDE8E8] p-3.5 text-[13.5px] text-[#7F1D1D]">Oxirgi urinishda xatolik: {study.error}</div>
            )}

            {gatedHidden && draft && (
              <div className="rounded-[14px] border-2 border-red-300 bg-[#FDE8E8] p-4 text-[#7F1D1D]">
                <p className="flex items-center gap-2 font-display text-[17px] font-bold"><AlertOctagon className="h-5 w-5" /> Shifokor e&apos;tibori kerak</p>
                <p className="mt-1 text-[13.5px]">AI qoralama yozmadi. Quyidagi shablonni o&apos;zingiz to&apos;ldiring.</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13.5px]">
                  {draft.attentionReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                <Button size="sm" variant="outline" className="mt-3 border-red-300" onClick={reveal}><Eye /> Baribir qoralamani ko&apos;rsatish</Button>
              </div>
            )}

            {!gatedHidden && !readOnly && draft && draft.attentionReasons.length > 0 && (
              <div className="rounded-[14px] border border-amber-200 bg-[#FDF1DC] p-3.5 text-[13.5px] text-[#7A3E06]">
                <p className="flex items-center gap-1.5 font-semibold"><Info className="h-4 w-4" /> AI e&apos;tibor so&apos;ragan joylar</p>
                <ul className="mt-1 list-disc pl-5">{draft.attentionReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                {draft.limitations && <p className="mt-1.5 text-[12.5px] opacity-80">Cheklov: {draft.limitations}</p>}
              </div>
            )}

            {tab === "structured" && (
              <>
                {props.engineResult && <ModelPanel result={props.engineResult} evalSummary={props.modelEval} groundTruth={props.groundTruth} />}
                <Section title="Texnika va tuzilish">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="comp">Ko&apos;krak bezi tuzilishi (ACR)</Label>
                      <Select id="comp" disabled={readOnly} value={payload.breastComposition ?? ""} onChange={(e) => update((p) => ({ ...p, breastComposition: (e.target.value || null) as ReportPayload["breastComposition"] }))}>
                        <option value="">— Tanlang —</option>
                        {COMPOSITIONS.map((c) => <option key={c} value={c}>{COMPOSITION_LABEL[c]}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="q">Tasvir sifati</Label>
                      <Select id="q" disabled={readOnly} value={payload.quality} onChange={(e) => update((p) => ({ ...p, quality: e.target.value as ReportPayload["quality"] }))}>
                        {QUALITIES.map((q) => <option key={q} value={q}>{QUALITY_LABEL[q]}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="qn">Sifat izohi</Label>
                      <Input id="qn" disabled={readOnly} value={payload.qualityNotes} onChange={(e) => update((p) => ({ ...p, qualityNotes: e.target.value }))} placeholder="masalan, pektoral mushak yetarli ko'rinadi" />
                    </div>
                  </div>
                </Section>

                {(["right", "left"] as const).map((side) => (
                  <Section
                    key={side}
                    title={SIDE_LABEL[side]}
                    right={
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`b-${side}`} className="text-xs text-muted-foreground">BI-RADS</Label>
                        <Select id={`b-${side}`} disabled={readOnly} className="min-h-9 w-24 text-sm" value={payload.breasts[side].birads ?? ""} onChange={(e) => update((p) => { p.breasts[side].birads = (e.target.value || null) as ReportPayload["breasts"]["right"]["birads"]; return p; })}>
                          <option value="">—</option>
                          {BIRADS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </Select>
                      </div>
                    }
                  >
                    <div className="space-y-2.5">
                      {(payload.sideNotes?.[side] || !readOnly) && (
                        <Textarea
                          aria-label={`${SIDE_LABEL[side]} — izoh`}
                          rows={2}
                          disabled={readOnly}
                          value={payload.sideNotes?.[side] ?? ""}
                          onChange={(e) => update((p) => { p.sideNotes = { ...(p.sideNotes ?? { right: "", left: "" }), [side]: e.target.value }; return p; })}
                          placeholder="Izoh (ixtiyoriy) — masalan model natijasi yoki umumiy tavsif"
                          className="text-[13.5px]"
                        />
                      )}
                      {payload.breasts[side].findings.length === 0 && <p className="text-[13.5px] text-muted-foreground">O&apos;choqli o&apos;zgarishlar aniqlanmadi.</p>}
                      {payload.breasts[side].findings.map((f) => (
                        <FindingCard
                          key={f.id}
                          finding={f}
                          sideViews={sideViews(side)}
                          selected={selected === f.id}
                          editing={editing === f.id}
                          readOnly={readOnly}
                          onSelect={() => setSelected(f.id)}
                          onToggleEdit={() => setEditing((e) => (e === f.id ? null : f.id))}
                          onAccept={() => changeFinding(side, { ...f, review: "accepted" })}
                          onDelete={() => deleteFinding(side, f.id)}
                          onChange={(nf) => changeFinding(side, nf)}
                        />
                      ))}
                      {!readOnly && (
                        <Button size="sm" variant="ghost" onClick={() => addFinding(side)}><Plus /> Topilma qo&apos;shish</Button>
                      )}
                    </div>
                  </Section>
                ))}

                <Section title="Limfa tugunlari va solishtirish">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ax">Qo&apos;ltiq osti limfa tugunlari</Label>
                      <Textarea id="ax" rows={2} disabled={readOnly} value={payload.axillaryLymphNodes} onChange={(e) => update((p) => ({ ...p, axillaryLymphNodes: e.target.value }))} placeholder="Bo'sh qolsa: «Patologik o'zgarishsiz»" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cmp">Oldingi tekshiruv bilan solishtirish</Label>
                      <Textarea id="cmp" rows={2} disabled={readOnly} value={payload.comparisonWithPrior} onChange={(e) => update((p) => ({ ...p, comparisonWithPrior: e.target.value }))} />
                    </div>
                  </div>
                </Section>

                <Section title="Xulosa va tavsiya" right={<BiradsBadge value={overall} prefix="Umumiy BI-RADS" />}>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="imp">Xulosa (impression)</Label>
                      <Textarea id="imp" rows={3} disabled={readOnly} value={payload.impression} onChange={(e) => update((p) => ({ ...p, impression: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="rec">Tavsiya</Label>
                        {!readOnly && (
                          <button type="button" className="text-xs font-semibold text-cyan-ink hover:underline" onClick={() => update((p) => ({ ...p, recommendationOverride: p.recommendationOverride === null ? recommendationFor(overallOf(p)) : null }))}>
                            {payload.recommendationOverride === null ? "Qo'lda o'zgartirish" : "Avtomatikka qaytarish"}
                          </button>
                        )}
                      </div>
                      {payload.recommendationOverride === null ? (
                        <p className="rounded-[10px] border border-line bg-surface2 px-3.5 py-2.5 text-[14px]">{recommendationFor(overall)} <span className="text-xs text-muted-foreground">(BI-RADS bo&apos;yicha avtomatik)</span></p>
                      ) : (
                        <Textarea id="rec" rows={2} disabled={readOnly} value={payload.recommendationOverride} onChange={(e) => update((p) => ({ ...p, recommendationOverride: e.target.value }))} />
                      )}
                    </div>
                  </div>
                </Section>

                <Section title="Jonli ko'rinish">
                  <pre className="whitespace-pre-wrap rounded-[10px] bg-surface2 p-3.5 font-sans text-[13px] leading-relaxed text-navy">{text}</pre>
                </Section>
              </>
            )}

            {tab === "text" && (
              <Section
                title={readOnly ? "Tasdiqlangan xulosa" : "Matn rejimi"}
                right={!readOnly && payload.textOverride !== null ? (
                  <button type="button" className="text-xs font-semibold text-cyan-ink hover:underline" onClick={() => update((p) => ({ ...p, textOverride: null }))}>Shablonga qaytarish</button>
                ) : null}
              >
                {!readOnly && (
                  <p className="mb-2 text-[12.5px] text-muted-foreground">
                    {payload.textOverride === null
                      ? "Matn tuzilgan muharrirdan avtomatik yig'iladi. Yakuniy so'zlarni shu yerda tahrirlashingiz mumkin."
                      : "Matn qo'lda tahrirlangan: tuzilgan muharrirdagi keyingi o'zgarishlar bu matnga avtomatik o'tmaydi."}
                  </p>
                )}
                {readOnly ? (
                  <pre className="whitespace-pre-wrap rounded-[10px] bg-surface2 p-3.5 font-sans text-[13.5px] leading-relaxed text-navy">{text}</pre>
                ) : (
                  <Textarea rows={24} className="font-mono text-[13px]" value={payload.textOverride ?? text} onChange={(e) => update((p) => ({ ...p, textOverride: e.target.value }))} />
                )}
                {readOnly && props.editStats && <EditSummary stats={props.editStats} />}
                {readOnly && <TrainerSend studyId={study.id} teachers={props.teachers} sentCaseId={props.sentCaseId} />}
              </Section>
            )}

            {tab === "history" && <Timeline entries={props.timeline} />}
          </div>
        </div>
      </div>

      {draft && <ModelMetricsCorner draftModel={draft.model} latencyMs={draft.latencyMs} engine={props.engineResult} evals={props.engineResult ? props.modelEval : []} />}

      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        blockers={[
          ...(pending.length ? [`${pending.length} ta AI topilmasi ko'rib chiqilmagan (${pending.map((f) => f.id.toUpperCase()).join(", ")})`] : []),
          ...(!payload.breastComposition ? ["Ko'krak bezi tuzilishi (ACR) tanlanmagan"] : []),
          ...(images.some((i) => i.label.startsWith("R")) && !payload.breasts.right.birads ? ["O'ng tomon uchun BI-RADS tanlanmagan"] : []),
          ...(images.some((i) => i.label.startsWith("L")) && !payload.breasts.left.birads ? ["Chap tomon uchun BI-RADS tanlanmagan"] : []),
          ...(!payload.impression.trim() ? ["Xulosa (impression) bo'sh"] : []),
        ]}
        onApprove={async (password, confirmed) => {
          const res = await approveReport(study.id, latest.current, password, confirmed);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          dirty.current = false;
          toast.success("Xulosa tasdiqlandi");
          router.push(`/doctor/studies/${study.id}/report`);
          return true;
        }}
        text={text}
        overall={overall}
        onJump={(id) => {
          setApproveOpen(false);
          select(id);
        }}
        pendingIds={pending.map((f) => f.id)}
      />
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line-soft bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-[16px] font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ApproveDialog({
  open,
  onOpenChange,
  blockers,
  onApprove,
  text,
  overall,
  pendingIds,
  onJump,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  blockers: string[];
  onApprove: (password: string, confirmed: boolean) => Promise<boolean>;
  text: string;
  overall: string | null;
  pendingIds: string[];
  onJump: (id: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirmed(false);
    }
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Xulosani tasdiqlash"
      className="max-w-lg"
      description={<>Tasdiqlangandan so&apos;ng xulosa rasmiy bo&apos;ladi va o&apos;zgartirib bo&apos;lmaydi. Umumiy: <b>BI-RADS {overall ?? "—"}</b>.</>}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button
            disabled={busy || blockers.length > 0 || !confirmed || !password}
            onClick={async () => {
              setBusy(true);
              const ok = await onApprove(password, confirmed);
              setBusy(false);
              if (ok) onOpenChange(false);
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} Tasdiqlash
          </Button>
        </>
      }
    >
      {blockers.length > 0 ? (
        <div className="rounded-[14px] border border-red-200 bg-[#FDE8E8] p-3.5 text-[13.5px] text-[#7F1D1D]">
          <p className="font-semibold">Tasdiqlashdan oldin:</p>
          <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          {pendingIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pendingIds.map((id) => (
                <button key={id} type="button" className="rounded-full border border-red-300 bg-white px-2 py-0.5 text-xs font-semibold" onClick={() => onJump(id)}>{id.toUpperCase()} ga o&apos;tish</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-surface2 p-3 font-sans text-[12px] leading-relaxed">{text}</pre>
          <label className="flex items-start gap-2.5 text-[13.5px] font-medium text-navy">
            <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Men tasvirlarni shaxsan ko&apos;rib chiqdim va xulosa uchun javobgarlikni o&apos;z zimmamga olaman
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Parolingizni qayta kiriting</Label>
            <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

function EditSummary({ stats }: { stats: EditStats }) {
  const items = [
    ["AI topilmalari", stats.aiFindings],
    ["O'zgarishsiz qabul", stats.accepted],
    ["Tahrirlangan", stats.modified],
    ["O'chirilgan", stats.removed],
    ["Shifokor qo'shgan", stats.added],
  ] as const;
  return (
    <div className="mt-4 rounded-[14px] border border-line-soft bg-surface2 p-3.5">
      <p className="mb-2 text-[13px] font-semibold text-navy">AI qoralamasi → yakuniy xulosa</p>
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
        {items.map(([l, v]) => (
          <div key={l} className="rounded-[10px] bg-card p-2">
            <div className="font-display text-xl font-extrabold tabular-nums">{v}</div>
            <div className="text-[11px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        BI-RADS: {stats.aiBirads} → {stats.finalBirads}{stats.biradsChanged ? " (shifokor o'zgartirdi)" : ""} · Matn tahrir masofasi: {stats.editDistance} belgi
      </p>
    </div>
  );
}

function TrainerSend({ studyId, teachers, sentCaseId }: { studyId: string; teachers: { id: string; name: string }[]; sentCaseId: string | null }) {
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(sentCaseId);
  const router = useRouter();
  if (sent) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-[14px] border border-line-soft bg-[#E7F6EC] p-3 text-[13.5px] text-[#14532D]">
        <GraduationCap className="h-4 w-4" /> Ta&apos;lim moduliga keys sifatida yuborilgan (nashr qilinmagan qoralama, o&apos;qituvchi ko&apos;rib chiqadi).
      </p>
    );
  }
  if (!teachers.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-[14px] border border-line-soft p-3">
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="teacher">Ta&apos;lim uchun keys sifatida yuborish</Label>
        <Select id="teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>
      <Button
        variant="outline"
        disabled={busy || !teacherId}
        onClick={async () => {
          setBusy(true);
          const res = await sendToTrainer(studyId, teacherId);
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          setSent(res.data?.caseId ?? "sent");
          toast.success("Keys o'qituvchiga yuborildi (nashr qilinmagan)");
          router.refresh();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <GraduationCap />} Yuborish
      </Button>
      <p className="w-full text-[11.5px] text-muted-foreground">Faqat tasdiqlangan, anonim xulosa va tasvirlar yuboriladi.</p>
    </div>
  );
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">Hali yozuv yo&apos;q.</p>;
  return (
    <ol className="relative space-y-3 border-l-2 border-line pl-5">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span className={cn("absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-background", dotColor(e.action))} />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <b className="text-[14px] text-navy">{AUDIT_ACTION_LABEL[e.action] ?? e.action}</b>
            <span className="text-xs text-muted-foreground">{formatDate(e.at)} · {e.user}</span>
          </div>
          {e.summary && <p className="text-[13px] text-muted-foreground">{e.summary}</p>}
          {e.changes.length > 0 && (
            <ul className="mt-1.5 space-y-1 rounded-[10px] bg-surface2 p-2.5 text-[12.5px]">
              {e.changes.slice(0, 12).map((c, i) => (
                <li key={i} className="break-words">
                  <code className="text-[11.5px] text-muted-foreground">{c.path}</code>:{" "}
                  <span className="text-red-700 line-through decoration-red-300">{fmtVal(c.from)}</span> → <span className="font-semibold text-emerald-800">{fmtVal(c.to)}</span>
                </li>
              ))}
              {e.changes.length > 12 && <li className="text-muted-foreground">… yana {e.changes.length - 12} ta</li>}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

const fmtVal = (v: unknown) => (v == null || v === "" ? "∅" : typeof v === "string" ? (v.length > 90 ? v.slice(0, 90) + "…" : v) : JSON.stringify(v));
const dotColor = (a: string) =>
  a === "REPORT_APPROVED" ? "bg-emerald-500" : a === "DRAFT_GATED" || a === "DRAFT_FAILED" ? "bg-red-500" : a === "REPORT_EDITED" ? "bg-amber-500" : a.startsWith("DRAFT") ? "bg-cyan-ink" : "bg-muted-foreground";
