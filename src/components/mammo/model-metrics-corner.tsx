"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { RISK_LABEL, agreementOf, riskOf, type EngineResult } from "@/lib/mammo-model";
import type { ModelEval } from "./model-panel";

const KEY = "radiologai.metricsCorner.open";

/** Ish joyining pastki o'ng burchagi: qaysi model javob berdi va uning o'lchangan aniqligi (F1, AUC va h.k.). */
export function ModelMetricsCorner({ draftModel, latencyMs, engine, evals }: { draftModel: string; latencyMs: number; engine: EngineResult | null; evals: ModelEval }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState(0);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v !== null) setOpen(v === "1");
    } catch {
      /* brauzer xotirasi yopiq — standart holat */
    }
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? "0" : "1");
      } catch {
        /* noop */
      }
      return !o;
    });
  };

  const [imageModel, textPart] = draftModel.split(" + matn: ");
  const e = evals[tab] ?? evals[0];
  const m = e?.metrics;
  const breasts = engine ? (["R", "L"] as const).filter((k) => engine.breasts[k]) : [];

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-card text-navy shadow-md print:hidden">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 bg-navy px-3.5 py-2.5 text-left text-white" aria-expanded={open}>
        <BarChart3 className="h-4 w-4 text-cyan" />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13px]">{imageModel}</b>
          <span className="block text-[11.5px] text-[#C9D3E3]">
            {m ? `F1 ${m.f1}% · AUC ${e.auc.toFixed(3)} · aniqlik ${m.accuracy}%` : engine ? `muallif AUC ${engine.publishedAuc.toFixed(3)}` : "baholash yo'q"}
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {open && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-3.5 text-[12.5px]">
          {/* Shu tekshiruv bo'yicha javob */}
          <div>
            <p className="mb-1 flex items-center gap-1.5 font-semibold"><Cpu className="h-3.5 w-3.5" /> Shu tekshiruv</p>
            <div className="space-y-0.5 text-muted-foreground">
              <p>Tasvir modeli: <b className="text-navy">{imageModel}</b>{engine ? ` · ${engine.device}` : ""}</p>
              {textPart && <p>Matn: <b className="text-navy">{textPart}</b> (tasvirni ko&apos;rmaydi)</p>}
              <p>Javob vaqti: <b className="text-navy">{(latencyMs / 1000).toFixed(1)} s</b>{engine ? ` (model ${(engine.latencyMs / 1000).toFixed(1)} s)` : ""}</p>
              {breasts.map((k) => {
                const b = engine!.breasts[k]!;
                return (
                  <p key={k}>
                    {k === "R" ? "O'ng" : "Chap"}: saraton ehtimoli <b className="text-navy">{(b.cancerProbability * 100).toFixed(2)}%</b> ({RISK_LABEL[riskOf(b.cancerProbability)].toLowerCase()}), ansambl kelishuvi <b className="text-navy">{Math.round(agreementOf(b) * 100)}%</b>, ACR {b.densityClass}
                  </p>
                );
              })}
            </div>
          </div>

          {/* O'lchangan aniqlik */}
          {evals.length > 0 && e && m ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="font-semibold">O&apos;lchangan aniqlik</p>
                {evals.length > 1 && (
                  <div className="flex gap-1">
                    {evals.map((x, i) => (
                      <button key={x.key} type="button" onClick={() => setTab(i)} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", i === tab ? "bg-navy text-white" : "bg-sand text-navy hover:bg-line-soft")}>
                        {x.dataset.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mb-2 text-[11.5px] text-muted-foreground">
                {e.dataset.split(" —")[0]} · n={e.n} ({e.malignant} xavfli / {e.negatives} {e.negativeLabel}) · chegara {(m.threshold * 100).toFixed(2)}%
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ["F1", `${m.f1}%`],
                  ["AUC", e.auc.toFixed(3)],
                  ["Aniqlik", `${m.accuracy}%`],
                  ["Sezgirlik", `${m.sensitivity}%`],
                  ["O'ziga xoslik", `${m.specificity}%`],
                  ["Precision", `${m.precision}%`],
                  ["NPV", `${m.npv}%`],
                  ["Bal. aniqlik", `${m.balancedAccuracy}%`],
                  ["MCC", m.mcc.toFixed(2)],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-[10px] bg-surface2 px-2 py-1.5 text-center">
                    <div className="font-display text-[15px] font-extrabold tabular-nums">{v}</div>
                    <div className="text-[10.5px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[11px] tabular-nums">
                <span className="rounded bg-[#E7F6EC] py-1 text-[#14532D]">TP {m.tp}</span>
                <span className="rounded bg-[#FDE8E8] py-1 text-[#7F1D1D]">FN {m.fn}</span>
                <span className="rounded bg-[#FDF1DC] py-1 text-[#7A3E06]">FP {m.fp}</span>
                <span className="rounded bg-[#E7F6EC] py-1 text-[#14532D]">TN {m.tn}</span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">AUC 95% CI: {e.auc95[0]}–{e.auc95[1]}. {e.datasetNote}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">Bu model uchun mahalliy baholash yo&apos;q (npm run ml:eval).</p>
          )}

          {engine && (
            <p className="border-t border-line-soft pt-2 text-[11.5px] text-muted-foreground">
              Muallif e&apos;lon qilgan (RSNA test): AUC {engine.publishedAuc.toFixed(3)}, sezgirlik 90.5%, o&apos;ziga xoslik 84.8%.{" "}
              <Link href="/doctor/model-card" className="font-semibold text-cyan-ink hover:underline">Model kartasi →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
