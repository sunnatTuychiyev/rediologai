import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Clock, Lightbulb, RefreshCw, ThumbsUp, XCircle } from "lucide-react";
import type { Evaluation } from "@/lib/types";
import { EXTRA_TYPE_LABEL, FINDING_STATUS_LABEL, IMPORTANCE_LABEL, IMPRESSION_STATUS_LABEL, MODALITY_LABEL } from "@/lib/labels";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { ScoreCircle } from "./score-circle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";
import type { ViewerRegion } from "./image-viewer";
import { ResultImage } from "./result-image";
import { CopyButton } from "./copy-button";

type Props = {
  submission: { id: string; reportText: string; durationSec: number; createdAt: Date; score: number };
  evaluation: Evaluation;
  caseData: { id: string; title: string; modality: string; bodyRegion: string; clinicalInfo: string; referenceReport: string; images: { id: string; url: string; label: string | null; pixelSpacing?: number | null }[] };
  regions: ViewerRegion[];
  studentName?: string;
  actions?: { retryHref: string; nextHref: string | null };
};

const STATUS_BADGE = {
  correct: { variant: "success" as const, icon: "✅" },
  partial: { variant: "warning" as const, icon: "🟡" },
  missed: { variant: "danger" as const, icon: "❌" },
};
const IMPORTANCE_BADGE = { critical: "danger" as const, major: "warning" as const, minor: "muted" as const };

/** Wraps occurrences of quotes inside text with <mark>. Case-insensitive, non-overlapping. */
function highlight(text: string, quotes: { quote: string; cls: string }[]) {
  const ranges: { start: number; end: number; cls: string }[] = [];
  const lower = text.toLowerCase();
  for (const { quote, cls } of quotes) {
    const q = quote.trim().replace(/[.;,]+$/, "");
    if (q.length < 4) continue;
    const idx = lower.indexOf(q.toLowerCase());
    if (idx === -1) continue;
    const end = idx + q.length;
    if (ranges.some((r) => idx < r.end && end > r.start)) continue;
    ranges.push({ start: idx, end, cls });
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach((r, i) => {
    if (r.start > pos) out.push(text.slice(pos, r.start));
    out.push(<mark key={i} className={r.cls}>{text.slice(r.start, r.end)}</mark>);
    pos = r.end;
  });
  out.push(text.slice(pos));
  return out;
}

export function ResultView({ submission, evaluation: ev, caseData, regions, studentName, actions }: Props) {
  const quotes = [
    ...ev.extraStatements.map((e) => ({ quote: e.studentQuote, cls: "hl-wrong" })),
    ...ev.findingResults.filter((f) => f.studentQuote).map((f) => ({ quote: f.studentQuote!, cls: f.status === "correct" ? "hl-correct" : "hl-partial" })),
  ];
  const counts = {
    correct: ev.findingResults.filter((f) => f.status === "correct").length,
    partial: ev.findingResults.filter((f) => f.status === "partial").length,
    missed: ev.findingResults.filter((f) => f.status === "missed").length,
  };
  const subs = [
    { label: "Topilmalar", value: ev.subscores.findings, max: 50 },
    { label: "Xulosa (tashxis)", value: ev.subscores.impression, max: 25 },
    { label: "Aniqlik", value: ev.subscores.accuracy, max: 10 },
    { label: "Tuzilma va terminologiya", value: ev.subscores.structure, max: 15 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{MODALITY_LABEL[caseData.modality]} · {caseData.bodyRegion}{studentName ? ` · ${studentName}` : ""}</p>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]">Natija: {caseData.title}</h1>
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatDate(submission.createdAt)}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuration(submission.durationSec)}</span>
            {ev.source === "offline" && <Badge variant="muted">Oflayn baholash (AI kaliti sozlanmagan)</Badge>}
          </p>
        </div>
        {actions && (
          <div className="flex gap-2">
            <Link href={actions.retryHref} className={buttonVariants({ variant: "outline" })}><RefreshCw /> Qayta urinish</Link>
            {actions.nextHref && <Link href={actions.nextHref} className={buttonVariants()}>Keyingi mashq <ArrowRight /></Link>}
          </div>
        )}
      </div>

      {/* Score */}
      <Card>
        <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <ScoreCircle score={submission.score} />
            {ev.capped && (
              <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" /> Kritik topilma o&apos;tkazilgan — maks. 60</span>
            )}
          </div>
          <div className="space-y-4">
            <p className="text-base">{ev.summary}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {subs.map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-muted-foreground">{s.value} / {s.max}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(s.value / s.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="success">✅ To&apos;g&apos;ri: {counts.correct}</Badge>
              <Badge variant="warning">🟡 Qisman: {counts.partial}</Badge>
              <Badge variant="danger">❌ O&apos;tkazib yuborilgan: {counts.missed}</Badge>
              <Badge variant="outline">Tashxis: {IMPRESSION_STATUS_LABEL[ev.impressionResult.status]}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasvirda: topilgan (yashil) va o'tkazib yuborilgan (qizil) joylar */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Tasvirda: nimani topdingiz, nimani o&apos;tkazib yubordingiz</CardTitle>
          <CardDescription>
            Qizil doira — e&apos;tibor bermagan joyingiz, yashil doira — to&apos;g&apos;ri topganingiz. Ro&apos;yxatdagi topilmani bossangiz, tasvir o&apos;sha joyga o&apos;tadi.
          </CardDescription>
        </CardHeader>
        <ResultImage
          images={caseData.images}
          regions={regions}
          findings={ev.findingResults.map((f) => ({ key: f.key, referenceText: f.referenceText, status: f.status }))}
        />
      </Card>

      {/* Findings table */}
      <Card>
        <CardHeader>
          <CardTitle>Topilmalar tahlili</CardTitle>
          <CardDescription>Shifokor xulosasidagi har bir topilma bo&apos;yicha</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR><TH>Topilma</TH><TH>Holat</TH><TH>Ahamiyat</TH><TH>Sizning iqtibosingiz</TH><TH>Izoh</TH></TR>
            </THead>
            <TBody>
              {ev.findingResults.map((f) => (
                <TR key={f.key} className={cn(f.status === "missed" && "bg-red-50/40")}>
                  <TD className="max-w-[220px] font-medium">{f.referenceText}</TD>
                  <TD><Badge variant={STATUS_BADGE[f.status].variant}>{STATUS_BADGE[f.status].icon} {FINDING_STATUS_LABEL[f.status]}</Badge></TD>
                  <TD><Badge variant={IMPORTANCE_BADGE[f.importance]}>{IMPORTANCE_LABEL[f.importance]}</Badge></TD>
                  <TD className="max-w-[220px] text-xs italic text-muted-foreground">{f.studentQuote ? `“${f.studentQuote}”` : "—"}</TD>
                  <TD className="max-w-[280px] text-sm">{f.comment}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="border-t p-4 text-sm">
            <span className="font-medium">Tashxis: </span>
            <Badge variant={ev.impressionResult.status === "correct" ? "success" : ev.impressionResult.status === "partial" ? "warning" : "danger"}>
              {IMPRESSION_STATUS_LABEL[ev.impressionResult.status]}
            </Badge>{" "}
            <span className="text-muted-foreground">{ev.impressionResult.comment}</span>
          </div>
        </CardContent>
      </Card>

      {/* Extra statements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CircleAlert className="h-4 w-4 text-red-500" /> Ortiqcha yoki noto&apos;g&apos;ri fikrlar</CardTitle>
        </CardHeader>
        <CardContent>
          {ev.extraStatements.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ortiqcha yoki noto&apos;g&apos;ri fikr topilmadi — ajoyib!</p>
          ) : (
            <ul className="space-y-3">
              {ev.extraStatements.map((e, i) => (
                <li key={i} className="flex gap-3 rounded-md border p-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={e.type === "incorrect" ? "danger" : "warning"}>{EXTRA_TYPE_LABEL[e.type]}</Badge>
                      <span className="text-sm italic">“{e.studentQuote}”</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{e.comment}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sizning xulosangiz</CardTitle>
            <CardDescription className="flex flex-wrap gap-2 text-xs">
              <mark className="hl-correct">to&apos;g&apos;ri</mark><mark className="hl-partial">qisman</mark><mark className="hl-wrong">noto&apos;g&apos;ri / ortiqcha</mark>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{highlight(submission.reportText, quotes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shifokor xulosasi</CardTitle>
            <CardDescription className="text-xs">Haqiqiy (etalon) xulosa</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{caseData.referenceReport}</p>
          </CardContent>
        </Card>
      </div>

      {/* Improved report + tips */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>To&apos;g&apos;ri yozilgan namuna</CardTitle>
            <CopyButton text={ev.improvedReport} />
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted/60 p-4 font-sans text-sm leading-relaxed">{ev.improvedReport}</pre>
            {ev.structureComment && <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Tuzilma: </span>{ev.structureComment}</p>}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /> Maslahatlar</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {ev.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </CardContent>
          </Card>
          {ev.strengths.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ThumbsUp className="h-4 w-4 text-emerald-600" /> Kuchli tomonlar</CardTitle></CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">{ev.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}
