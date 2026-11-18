import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ModelEval, ModelEvalItem } from "@/components/mammo/model-panel";

export type RawEval = {
  datasetKey?: string;
  n: number;
  malignant: number;
  benign: number;
  negativeLabel?: string;
  auc: number;
  auc95: [number, number];
  dataset: string;
  datasetNote?: string;
  intensity?: string;
  createdAt: string;
  atOperatingPoints: { name: string; threshold: number; sensitivity: number; specificity: number; measured: { sensitivity: number; specificity: number; accuracy: number; tp: number; fn: number; tn: number; fp: number } }[];
  bestYouden?: { threshold: number; sensitivity: number; specificity: number; accuracy: number };
  medianLatencySec?: number;
  published: { auc: number; dataset: string };
};

const DIR = path.join(process.cwd(), "storage", "eval");

/** python ml/evaluate.py natijalari (storage/eval/model-<dataset>[-stretch].json). */
export function readModelEvalsRaw(): (RawEval & { file: string })[] {
  try {
    return fs
      .readdirSync(DIR)
      .filter((f) => /^model-[a-z]+(-[a-z]+)?\.json$/.test(f))
      .sort()
      .map((f) => ({ ...(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as RawEval), file: f }));
  } catch {
    return [];
  }
}

export type Metrics = {
  threshold: number;
  tp: number;
  fn: number;
  tn: number;
  fp: number;
  accuracy: number;
  sensitivity: number;
  specificity: number;
  precision: number;
  npv: number;
  f1: number;
  balancedAccuracy: number;
  mcc: number;
};

const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/** Xatolar matritsasidan barcha ko'rsatkichlar (foizda; MCC -1..1). */
export function metricsFrom(m: { threshold: number; tp: number; fn: number; tn: number; fp: number }): Metrics {
  const { tp, fn, tn, fp } = m;
  const sens = tp + fn ? tp / (tp + fn) : 0;
  const spec = tn + fp ? tn / (tn + fp) : 0;
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const den = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  return {
    ...m,
    accuracy: pct(tp + tn, tp + tn + fp + fn),
    sensitivity: pct(tp, tp + fn),
    specificity: pct(tn, tn + fp),
    precision: pct(tp, tp + fp),
    npv: pct(tn, tn + fn),
    f1: prec + sens ? Math.round((2 * prec * sens * 1000) / (prec + sens)) / 10 : 0,
    balancedAccuracy: Math.round(((sens + spec) / 2) * 1000) / 10,
    mcc: den ? Math.round(((tp * tn - fp * fn) / den) * 1000) / 1000 : 0,
  };
}

/** Ish joyi va PDF uchun: har dataset bo'yicha faol yorqinlik rejimidagi natija. */
export function readModelEval(): ModelEval {
  const mode = process.env.MAMMO_INTENSITY || "raw";
  // Skrining vazifasiga yaqin (normal vs xavfli) dataset birinchi
  const all = readModelEvalsRaw()
    .filter((r) => (r.intensity ?? "raw") === mode)
    .sort((a, b) => Number(b.negativeLabel === "Normal") - Number(a.negativeLabel === "Normal"));
  return all.map<ModelEvalItem>((r) => ({
    key: r.datasetKey ?? r.file,
    n: r.n,
    malignant: r.malignant,
    negatives: r.benign,
    negativeLabel: r.negativeLabel === "Normal" ? "normal" : "yaxshi sifatli",
    auc: r.auc,
    auc95: r.auc95,
    dataset: r.dataset,
    datasetNote: r.datasetNote,
    standard: r.atOperatingPoints.find((o) => o.name === "standart")?.measured ?? null,
    metrics: (() => {
      const m = r.atOperatingPoints.find((o) => o.name === "standart")?.measured;
      return m ? metricsFrom({ threshold: 0.0184, tp: m.tp, fn: m.fn, tn: m.tn, fp: m.fp }) : null;
    })(),
    createdAt: r.createdAt,
  }));
}
