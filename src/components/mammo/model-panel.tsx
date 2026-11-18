"use client";
import { useState } from "react";
import Link from "next/link";
import { Activity, Eye, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RISK_LABEL, T_LOW, T_STD, agreementOf, riskOf, type EngineResult, type Risk } from "@/lib/mammo-model";

export type ModelEvalItem = {
  key: string;
  n: number;
  malignant: number;
  negatives: number;
  negativeLabel: string;
  auc: number;
  auc95: [number, number];
  dataset: string;
  datasetNote?: string;
  standard?: { sensitivity: number; specificity: number; accuracy: number } | null;
  metrics?: {
    threshold: number; tp: number; fn: number; tn: number; fp: number;
    accuracy: number; sensitivity: number; specificity: number; precision: number; npv: number; f1: number; balancedAccuracy: number; mcc: number;
  } | null;
  createdAt: string;
};
export type ModelEval = ModelEvalItem[];

const RISK_TONE: Record<Risk, string> = {
  low: "bg-emerald-500",
  indeterminate: "bg-amber-400",
  suspicious: "bg-orange-500",
  high: "bg-red-600",
};

/** Log shkala: 0.1% ... 100% — kichik ehtimollar ham ko'rinsin. */
const pos = (p: number) => Math.min(100, Math.max(0, ((Math.log10(Math.max(p, 0.001)) + 3) / 3) * 100));

export function ModelPanel({ result, evalSummary, groundTruth }: { result: EngineResult; evalSummary: ModelEval; groundTruth: { label: string; abnormality?: string; source?: string } | null }) {
  const [showTruth, setShowTruth] = useState(false);
  const sides = [
    ["R", "O'ng"],
    ["L", "Chap"],
  ] as const;
  return (
    <section className="rounded-xl border border-line-soft bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-bold"><Activity className="h-4 w-4" /> Model natijasi</h2>
        <span className="text-[11.5px] text-muted-foreground">{result.model} · {result.device} · {(result.latencyMs / 1000).toFixed(1)} s</span>
      </div>

      <div className="space-y-3">
        {sides.map(([k, name]) => {
          const b = result.breasts[k];
          if (!b) return <p key={k} className="text-[13px] text-muted-foreground">{name} ko&apos;krak bezi: tasvirlanmagan</p>;
          const r = riskOf(b.cancerProbability);
          return (
            <div key={k}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
                <b className="text-navy">{name} ko&apos;krak bezi</b>
                <span>
                  saraton ehtimoli <b className="tabular-nums">{(b.cancerProbability * 100).toFixed(2)}%</b>{" "}
                  <Badge variant={r === "low" ? "success" : r === "indeterminate" ? "warning" : "danger"}>{RISK_LABEL[r]}</Badge>
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-gradient-to-r from-emerald-200 via-amber-200 to-red-300">
                <span className="absolute top-[-3px] h-4 w-px bg-navy/60" style={{ left: `${pos(T_LOW)}%` }} title="0.72% — yuqori sezgirlik chegarasi" />
                <span className="absolute top-[-3px] h-4 w-px bg-navy" style={{ left: `${pos(T_STD)}%` }} title="1.84% — standart chegara" />
                <span className={cn("absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow", RISK_TONE[r])} style={{ left: `${pos(b.cancerProbability)}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground"><span>0.1%</span><span>chegara 1.84%</span><span>100%</span></div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                <span>Zichlik: <b className="text-navy">ACR {b.densityClass}</b> ({Object.entries(b.density).map(([c, v]) => `${c} ${Math.round(v * 100)}%`).join(", ")})</span>
                <span>Ansambl kelishuvi: <b className="text-navy">{Math.round(agreementOf(b) * 100)}%</b> ({b.netProbabilities.map((p) => `${(p * 100).toFixed(1)}%`).join(" / ")})</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[12px] border border-line-soft bg-surface2 p-3 text-[12.5px]">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-navy"><FlaskConical className="h-3.5 w-3.5" /> Model aniqligi</p>
        <p>
          <b>Muallif (RSNA skrining, test):</b> AUC {result.publishedAuc.toFixed(3)}; chegara 1.84% da sezgirlik 90.5%, o&apos;ziga xoslik 84.8%.
        </p>
        {evalSummary.length ? (
          evalSummary.map((e) => (
            <p key={e.key} className="mt-1">
              <b>Bizning tekshiruv — {e.dataset.split(" —")[0]} (n={e.n}: {e.malignant} xavfli / {e.negatives} {e.negativeLabel}):</b> AUC {e.auc.toFixed(3)} (95% CI {e.auc95[0]}–{e.auc95[1]})
              {e.standard && <>; chegara 1.84% da sezgirlik {e.standard.sensitivity}%, o&apos;ziga xoslik {e.standard.specificity}%, aniqlik {e.standard.accuracy}%</>}.
            </p>
          ))
        ) : (
          <p className="mt-1 text-muted-foreground">Mahalliy baholash hali o&apos;tkazilmagan (python ml/evaluate.py).</p>
        )}
        <Link href="/doctor/model-card" className="mt-1 inline-block font-semibold text-cyan-ink hover:underline">Model kartasi →</Link>
      </div>

      {groundTruth && (
        <div className="mt-3 text-[12.5px]">
          {showTruth ? (
            <p className={cn("rounded-[10px] px-3 py-2 font-semibold", groundTruth.label === "Malignant" ? "bg-[#FDE8E8] text-[#7F1D1D]" : "bg-[#E7F6EC] text-[#14532D]")}>
              Biopsiya natijasi (dataset): {groundTruth.label === "Malignant" ? "Xavfli" : "Yaxshi sifatli"}
              {groundTruth.abnormality ? ` · ${groundTruth.abnormality === "mass" ? "hosila" : groundTruth.abnormality === "calcification" ? "kalsinat" : "hosila + kalsinat"}` : ""}
              {groundTruth.source ? ` · ${groundTruth.source}` : ""}
            </p>
          ) : (
            <button type="button" onClick={() => setShowTruth(true)} className="inline-flex items-center gap-1.5 font-semibold text-cyan-ink hover:underline">
              <Eye className="h-3.5 w-3.5" /> Demo: biopsiya natijasini ko&apos;rsatish
            </button>
          )}
        </div>
      )}
    </section>
  );
}
