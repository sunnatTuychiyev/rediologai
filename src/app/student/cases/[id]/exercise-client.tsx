"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Clock, FileText, Loader2, RefreshCw, Send, Stethoscope } from "lucide-react";
import { ImageViewer, type ViewerImage } from "@/components/image-viewer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DIFFICULTY_LABEL, MODALITY_LABEL, REPORT_TEMPLATE } from "@/lib/labels";
import { formatDuration } from "@/lib/utils";

type Props = {
  data: { id: string; modality: string; bodyRegion: string; difficulty: string; clinicalInfo: string; images: ViewerImage[] };
  assignment: { id: string; title: string; mode: string; timeLimitMin: number | null; existingId: string | null } | null;
};

const MIN_CHARS = 30;
const LOADING_STEPS = ["AI xulosangizni tekshirmoqda…", "Topilmalar shifokor xulosasi bilan solishtirilmoqda…", "Ball hisoblanmoqda…", "Tavsiyalar tayyorlanmoqda…"];

export function ExerciseClient({ data, assignment }: Props) {
  const router = useRouter();
  const draftKey = `draft:${data.id}`;
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [failedId, setFailedId] = useState<string | null>(null);
  const startRef = useRef(Date.now());
  const autoSubmitted = useRef(false);

  const isExam = assignment?.mode === "EXAM";
  const limitSec = isExam && assignment?.timeLimitMin ? assignment.timeLimitMin * 60 : null;
  const remaining = limitSec != null ? Math.max(0, limitSec - elapsed) : null;

  // Restore draft (practice mode only).
  useEffect(() => {
    if (isExam) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {}
  }, [draftKey, isExam]);
  useEffect(() => {
    if (isExam) return;
    try {
      if (text) localStorage.setItem(draftKey, text);
    } catch {}
  }, [text, draftKey, isExam]);

  useEffect(() => {
    if (state !== "idle") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => {
    if (state !== "loading") return;
    const t = setInterval(() => setLoadingStep((s) => (s + 1) % LOADING_STEPS.length), 3000);
    return () => clearInterval(t);
  }, [state]);

  async function handleResult(res: Response) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.id) {
      router.push(`/student/submissions/${body.id}`);
      return;
    }
    if (!res.ok) {
      setState("idle");
      toast.error(body.error ?? "Xatolik yuz berdi");
      return;
    }
    if (body.status === "DONE") {
      try { localStorage.removeItem(draftKey); } catch {}
      toast.success("Xulosangiz tekshirildi!");
      router.push(`/student/submissions/${body.id}`);
    } else {
      setFailedId(body.id);
      setState("error");
    }
  }

  async function submit() {
    setConfirmOpen(false);
    setState("loading");
    setLoadingStep(0);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: data.id, assignmentId: assignment?.id ?? null, reportText: text, durationSec: elapsed }),
      });
      await handleResult(res);
    } catch {
      setState("idle");
      toast.error("Tarmoq xatosi. Internetni tekshiring.");
    }
  }

  async function retry() {
    if (!failedId) return;
    setState("loading");
    try {
      await handleResult(await fetch(`/api/submissions/${failedId}/retry`, { method: "POST" }));
    } catch {
      setState("error");
    }
  }

  // Auto-submit when exam time runs out.
  useEffect(() => {
    if (remaining === 0 && state === "idle" && !autoSubmitted.current) {
      autoSubmitted.current = true;
      if (text.trim().length >= MIN_CHARS) {
        toast.warning("Vaqt tugadi — xulosa avtomatik yuborilmoqda");
        submit();
      } else toast.error("Vaqt tugadi");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  if (assignment?.existingId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="font-medium">Siz bu imtihon mashqini allaqachon topshirgansiz.</p>
          <Link href={`/student/submissions/${assignment.existingId}`} className={buttonVariants({ className: "mt-4" })}>Natijani ko&apos;rish</Link>
        </div>
      </div>
    );
  }

  const tooShort = text.trim().length < MIN_CHARS;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <ImageViewer images={data.images} className="h-[55vh] lg:h-full lg:w-[60%]" />

      <div className="flex min-h-0 flex-1 flex-col border-l bg-card lg:w-[40%]">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <Link href="/student/cases" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Mashqlar
          </Link>
          <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm tabular-nums ${remaining != null && remaining < 60 ? "bg-red-100 text-red-700" : "bg-muted"}`}>
            <Clock className="h-4 w-4" />
            {remaining != null ? formatDuration(remaining) : formatDuration(elapsed)}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {assignment && (
            <div className="rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm">
              <span className="font-medium">{assignment.title}</span> · {isExam ? "Imtihon rejimi" : "Mashq rejimi"}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge>{MODALITY_LABEL[data.modality]}</Badge>
            <Badge variant="secondary">{data.bodyRegion}</Badge>
            <Badge variant={data.difficulty === "HARD" ? "danger" : data.difficulty === "MEDIUM" ? "warning" : "success"}>{DIFFICULTY_LABEL[data.difficulty]}</Badge>
          </div>
          <div className="rounded-md bg-muted/60 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Stethoscope className="h-3.5 w-3.5" /> Klinik ma&apos;lumot
            </div>
            <p className="text-sm">{data.clinicalInfo}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="report" className="text-sm font-medium">Xulosa yozish</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setText((t) => (t.trim() ? `${t}\n\n${REPORT_TEMPLATE}` : REPORT_TEMPLATE))}
                disabled={state !== "idle"}
              >
                <FileText /> Shablonni qo&apos;yish
              </Button>
            </div>
            <Textarea
              id="report"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={state !== "idle"}
              placeholder="Tasvirni tizimli tahlil qiling va radiologik xulosangizni yozing…"
              className="min-h-[220px] resize-y font-mono text-[13px] leading-relaxed lg:min-h-[300px]"
              maxLength={8000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tooShort ? `Kamida ${MIN_CHARS} ta belgi kerak` : "Tayyor bo'lsa — yuboring"}</span>
              <span className="tabular-nums">{text.length} / 8000</span>
            </div>
          </div>

          {state === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> AI tekshiruvida xatolik yuz berdi</div>
              <p className="mt-1 text-red-600/80">Xulosangiz saqlandi. Qayta urinib ko&apos;ring.</p>
              <Button variant="destructive" size="sm" className="mt-2" onClick={retry}><RefreshCw /> Qayta urinish</Button>
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <Button className="w-full" size="lg" disabled={tooShort || state !== "idle"} onClick={() => setConfirmOpen(true)}>
            {state === "loading" ? <Loader2 className="animate-spin" /> : <Send />}
            {state === "loading" ? LOADING_STEPS[loadingStep] : "Yuborish"}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xulosani yuborasizmi?"
        description="Yuborganingizdan so'ng xulosani o'zgartira olmaysiz. AI uni shifokor xulosasi bilan solishtiradi."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Bekor qilish</Button>
            <Button onClick={submit}><Send /> Yuborish</Button>
          </>
        }
      />

      {state === "loading" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 shadow-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">{LOADING_STEPS[loadingStep]}</p>
            <p className="text-xs text-muted-foreground">Odatda 5–15 soniya davom etadi</p>
          </div>
        </div>
      )}
    </div>
  );
}
