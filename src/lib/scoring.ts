import type { Evaluation, ReferenceFindings } from "./types";

const WEIGHT = { critical: 3, major: 2, minor: 1 } as const;
const IMPRESSION_POINTS = { correct: 25, partial: 12, wrong: 0, missing: 0 } as const;

/**
 * Normalizes the model output against the ground-truth reference findings and
 * recomputes the score from the rubric. The model's arithmetic is never trusted;
 * only its "structure" subscore (a subjective judgement) is kept, clamped to 0..15.
 */
export function finalizeEvaluation(raw: Evaluation, ref: ReferenceFindings): Evaluation {
  // 1) Align finding results with reference findings (by key, then by text).
  const byKey = new Map(raw.findingResults.map((r) => [r.key, r]));
  const byText = new Map(raw.findingResults.map((r) => [r.referenceText.trim().toLowerCase(), r]));

  const findingResults = ref.findings.map((f) => {
    const r = byKey.get(f.key) ?? byText.get(f.text.trim().toLowerCase());
    return {
      key: f.key,
      referenceText: f.text,
      importance: f.importance, // importance always comes from the reference
      status: r?.status ?? ("missed" as const),
      studentQuote: r?.status === "missed" ? null : (r?.studentQuote ?? null),
      comment: r?.comment ?? "Bu topilma xulosangizda qayd etilmagan.",
    };
  });

  // 2) Findings detection — 50 points weighted by importance.
  const total = findingResults.reduce((s, f) => s + WEIGHT[f.importance], 0);
  const earned = findingResults.reduce(
    (s, f) => s + (f.status === "correct" ? WEIGHT[f.importance] : f.status === "partial" ? WEIGHT[f.importance] / 2 : 0),
    0,
  );
  const findings = total === 0 ? 50 : Math.round((earned / total) * 50);

  // 3) Impression — 25 points.
  const impression = IMPRESSION_POINTS[raw.impressionResult.status] ?? 0;

  // 4) Accuracy — 10 points minus penalties.
  const incorrect = raw.extraStatements.filter((e) => e.type === "incorrect").length;
  const overcall = raw.extraStatements.filter((e) => e.type === "overcall").length;
  const accuracy = Math.max(0, 10 - 5 * incorrect - 3 * overcall);

  // 5) Structure — keep model's judgement, clamp.
  const structure = Math.max(0, Math.min(15, Math.round(Number(raw.subscores?.structure) || 0)));

  let score = findings + impression + accuracy + structure;
  const missedCritical = findingResults.some((f) => f.importance === "critical" && f.status === "missed");
  const capped = missedCritical && score > 60;
  if (capped) score = 60;
  score = Math.max(0, Math.min(100, score));

  return {
    ...raw,
    findingResults,
    score,
    subscores: { findings, impression, accuracy, structure },
    capped,
  };
}
