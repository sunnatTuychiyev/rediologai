// MODEL dvigateli: tasvirni ixtisoslashgan model (ianpan/mammoscreen, lokal ML xizmati) tahlil qiladi,
// Claude esa tasvirni ko'rmaydi — faqat model natijasidan o'zbekcha xulosa matnini chiroyli yozadi.
import type { Birads, Composition, MammoDraft, MammoFinding, ViewLabel } from "./mammo-types";

export const ENGINE_URL = process.env.MAMMO_ENGINE_URL || "http://127.0.0.1:8765";

export type EngineView = {
  file: string;
  view: string;
  label: string;
  crop: { x: number; y: number; w: number; h: number };
  region: { x: number; y: number; w: number; h: number } | null;
  peak: { x: number; y: number };
  heatmap: string | null;
};
export type EngineBreast = {
  cancerProbability: number;
  netProbabilities: number[];
  density: Record<"A" | "B" | "C" | "D", number>;
  densityClass: "A" | "B" | "C" | "D";
  views: EngineView[];
};
export type OperatingPoint = { name: string; threshold: number; sensitivity: number; specificity: number };
export type EngineResult = {
  model: string;
  modelRevision: string;
  cropModel: string;
  device: string;
  latencyMs: number;
  breasts: Partial<Record<"R" | "L", EngineBreast>>;
  notMammogram?: { file: string; label: string; reason: string }[];
  operatingPoints: OperatingPoint[];
  publishedAuc: number;
};

/** Muallif ish nuqtalari (model kartasi): 0.0072 — sezgirlik 98%, 0.0184 — sezgirlik 90.5% / o'ziga xoslik 84.8%. */
export const T_LOW = 0.0072;
export const T_STD = 0.0184;

export type Risk = "low" | "indeterminate" | "suspicious" | "high";
export const RISK_LABEL: Record<Risk, string> = { low: "Past", indeterminate: "Oraliq", suspicious: "Shubhali", high: "Yuqori" };

export function riskOf(p: number): Risk {
  if (p >= 0.1) return "high";
  if (p >= T_STD) return "suspicious";
  if (p >= T_LOW) return "indeterminate";
  return "low";
}

/** Model BI-RADS bermaydi. Bu — ehtimol chegaralaridan avtomatik TAKLIF (shifokor o'zgartiradi). */
export function biradsFromProbability(p: number): Birads {
  if (p >= 0.4) return "4C";
  if (p >= 0.1) return "4B";
  if (p >= T_STD) return "4A";
  if (p >= T_LOW) return "0";
  return "1";
}

/** Ansambl kelishuvi: 3 tarmoqdan nechtasi ansambl bilan bir xil xavf toifasida (haqiqiy o'lchanadigan barqarorlik). */
export function agreementOf(b: EngineBreast) {
  const r = riskOf(b.cancerProbability);
  const same = b.netProbabilities.filter((p) => riskOf(p) === r || (r === "high" && riskOf(p) === "suspicious") || (r === "suspicious" && riskOf(p) === "high")).length;
  return b.netProbabilities.length ? same / b.netProbabilities.length : 0;
}

export async function engineHealth(): Promise<{ ok: boolean; device?: string; error?: string }> {
  try {
    const r = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    return r.ok ? await r.json() : { ok: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function analyzeWithEngine(images: { file: string; laterality: string; view: string }[]): Promise<EngineResult> {
  let r: Response;
  try {
    r = await fetch(`${ENGINE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("Model xizmati ishlamayapti. Uni ishga tushiring: npm run ml:serve");
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Model xizmati xatosi: ${body.error ?? r.status}`);
  return body as EngineResult;
}

// ---------------------------------------------------------------------------
// Model natijasi -> tuzilgan qoralama (deterministik)
// ---------------------------------------------------------------------------
const CLOCK: Record<"R" | "L", Record<string, string>> = {
  R: { UOQ: "10", UIQ: "2", LOQ: "8", LIQ: "4" },
  L: { UOQ: "2", UIQ: "10", LOQ: "4", LIQ: "8" },
};

/** CAM cho'qqisidan taxminiy kvadrant: MLO — yuqori/pastki, CC — tashqi/ichki (standart joylashuvda lateral tomon tepada). */
function quadrantOf(b: EngineBreast): { quadrant: MammoFinding["location"]["quadrant"]; approx: boolean } {
  const rel = (v: EngineView | undefined) => (v ? (v.peak.y - v.crop.y) / Math.max(v.crop.h, 1e-6) : null);
  const mlo = rel(b.views.find((v) => v.view === "MLO"));
  const cc = rel(b.views.find((v) => v.view === "CC"));
  const upper = mlo == null ? true : mlo < 0.5;
  const outer = cc == null ? true : cc < 0.5;
  return { quadrant: upper ? (outer ? "UOQ" : "UIQ") : outer ? "LOQ" : "LIQ", approx: true };
}

export function draftFromEngine(res: EngineResult, availableViews: ViewLabel[]): MammoDraft {
  const sides = { right: res.breasts.R, left: res.breasts.L };
  // Zichlik: mavjud ko'krak bezlari bo'yicha o'rtacha ehtimollar
  const dens = { A: 0, B: 0, C: 0, D: 0 };
  const present = [res.breasts.R, res.breasts.L].filter((b): b is EngineBreast => Boolean(b));
  for (const b of present) for (const k of Object.keys(dens) as Composition[]) dens[k] += b.density[k] / present.length;
  const composition = (Object.entries(dens).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "B") as Composition;

  const breast = (side: "right" | "left") => {
    const b = sides[side];
    const L = side === "right" ? "R" : "L";
    if (!b) return { findings: [] as MammoFinding[], biradsSuggestion: "1" as Birads, missing: true };
    const p = b.cancerProbability;
    const risk = riskOf(p);
    const findings: MammoFinding[] = [];
    if (risk !== "low") {
      // Eng kuchli faollik bo'lgan proyeksiyadagi soha
      const withRegion = b.views.filter((v) => v.region);
      const best = withRegion.find((v) => v.view === "MLO") ?? withRegion[0];
      const { quadrant } = quadrantOf(b);
      findings.push({
        id: `${L.toLowerCase()}1`,
        type: "other",
        description: `Model diqqat sohasi (CAM): saraton ehtimoli ${(p * 100).toFixed(1)}% — ${RISK_LABEL[risk].toLowerCase()} xavf. Lezyon turi model tomonidan aniqlanmaydi; joylashuv taxminiy.`,
        location: { quadrant, clockFace: CLOCK[L][quadrant] ?? null, depth: null },
        sizeMm: null,
        descriptors: { shape: null, margin: null, density: null, calcMorphology: null, calcDistribution: null },
        seenOnViews: withRegion.map((v) => v.label as ViewLabel).filter((v) => availableViews.includes(v)),
        region: best?.region ? { view: best.label as ViewLabel, ...best.region } : null,
        confidence: agreementOf(b),
      });
    }
    return { findings, biradsSuggestion: biradsFromProbability(p), missing: false };
  };

  const right = breast("right");
  const left = breast("left");
  const agreements = present.map(agreementOf);
  const attention: string[] = [];
  for (const [name, side] of [["O'ng", res.breasts.R], ["Chap", res.breasts.L]] as const) {
    if (!side) continue;
    const r = riskOf(side.cancerProbability);
    if (r === "suspicious" || r === "high") attention.push(`${name} ko'krak bezi: model shubhali natija berdi (ehtimol ${(side.cancerProbability * 100).toFixed(1)}%) — tasvirni shaxsan ko'ring.`);
    if (side.views.length < 2) attention.push(`${name} ko'krak bezi: faqat bitta proyeksiya — model aniqligi pasayadi.`);
    if (agreementOf(side) < 0.67) attention.push(`${name} ko'krak bezi: ansambl tarmoqlari xavf toifasida kelishmadi.`);
  }
  attention.push("Model lezyon turi, o'lchami va limfa tugunlarini baholamaydi — ularni shifokor to'ldiradi.");

  return {
    imageCheck: {
      isMammogram: true,
      viewsDetected: availableViews,
      quality: present.every((b) => b.views.length >= 2) ? "adequate" : "limited",
      qualityNotes: present.every((b) => b.views.length >= 2) ? "" : "Ba'zi ko'krak bezlari uchun faqat bitta proyeksiya.",
    },
    breastComposition: composition,
    breasts: { right: { findings: right.findings, biradsSuggestion: right.biradsSuggestion }, left: { findings: left.findings, biradsSuggestion: left.biradsSuggestion } },
    axillaryLymphNodes: null,
    comparisonWithPrior: null,
    overallBirads: right.biradsSuggestion,
    impression: "",
    overallConfidence: agreements.length ? Math.min(...agreements) : 0,
    attentionReasons: attention,
    limitations:
      "Model (ianpan/mammoscreen) faqat saraton ehtimoli va zichlikni beradi; lezyon turi, o'lchami va BI-RADS deskriptorlarini aniqlamaydi. BI-RADS — ehtimol chegaralaridan avtomatik taklif.",
  };
}
