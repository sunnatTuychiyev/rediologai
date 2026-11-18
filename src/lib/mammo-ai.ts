import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiConfig, aiEnabled, callClaudeJson } from "./ai";
import { readMammoFile } from "./imaging";
import { sanitizeDraft } from "./mammo-rules";
import { offlineMammoDraft } from "./mammo-offline";
import {
  BIRADS,
  COMPOSITIONS,
  DENSITIES,
  DEPTHS,
  FINDING_TYPES,
  MARGINS,
  QUADRANTS,
  QUALITIES,
  SHAPES,
  VIEW_LABELS,
  mammoDraftSchema,
  type MammoDraft,
  type ViewLabel,
} from "./mammo-types";

export const MAMMO_SYSTEM_PROMPT = `You are an assistant that drafts mammography reports for a board-certified breast radiologist.
You do NOT make diagnoses. Your output is a draft that a radiologist will review, edit and approve.

Input: up to 4 mammography views labelled R-CC, L-CC, R-MLO, L-MLO, patient age, indication and clinical info.
Images are displayed in standard orientation; each image is preceded by its label.

Steps:
1. imageCheck: decide if the images are mammograms, list the views you actually see, rate technical quality.
   If they are not mammograms or quality is inadequate, say so, set overallConfidence low and stop describing findings.
2. Assess breast composition using ACR BI-RADS 5th edition categories A–D.
3. For each breast, list findings using ONLY BI-RADS lexicon terms (mass: shape/margin/density; calcifications:
   morphology/distribution; asymmetry; architectural distortion; associated features).
   Give location as quadrant + clock face + depth. Correlate CC and MLO views; a finding seen on one view only must say so.
   Give sizeMm only if you can reasonably estimate it, otherwise 0.
   Each finding has side "right" or "left". Localise it with a bounding box on ONE view (regionView) where it is best
   seen, as fractions (0–1) of that image's width/height (x, y = top-left corner), with localized=true.
   If you cannot localise it, set localized=false (x, y, w, h = 0).
   Unknown values: use "" for text fields, "unknown" for depth, "none" for a descriptor that does not apply.
4. Suggest a BI-RADS category per breast (biradsRight, biradsLeft: 0, 1, 2, 3, 4A, 4B, 4C, 5). Never use 6.
5. Give honest per-finding confidence and overallConfidence (0–1). If you are unsure, say so: a low-confidence
   honest draft is better than a confident wrong one. Never invent findings to fill the report.
   If you see nothing abnormal, return empty findings and BI-RADS 1 — do not hedge with vague "possible" findings.
6. List attentionReasons for anything the radiologist must look at personally.
If there is no prior study, set comparisonWithPrior to "".
Write all descriptive text in Uzbek (Latin script); keep BI-RADS terms in English in parentheses.
Do not write recommendations — the system adds them. Return only JSON matching the schema.`;

// ---------------------------------------------------------------------------
// JSON schema. Strict structured output union (nullable) maydonlarni ko'pi bilan 16 ta qabul qiladi,
// shuning uchun AI sxemasida null yo'q: noma'lum qiymatlar "" / 0 / "none" bilan beriladi va
// serverda null ga aylantiriladi (fromAiRaw).
// ---------------------------------------------------------------------------
const str = { type: "string" } as const;
const num = { type: "number" } as const;
const en = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

// Tekis sxema: topilmalar bitta massivda (side maydoni bilan) — grammatika kichik bo'lsin.
const FINDING_SCHEMA = obj({
  side: en(["right", "left"]),
  type: en(FINDING_TYPES),
  description: str,
  quadrant: en(QUADRANTS),
  clockFace: str,
  depth: en([...DEPTHS, "unknown"]),
  sizeMm: num,
  shape: en([...SHAPES, "none"]),
  margin: en([...MARGINS, "none"]),
  density: en([...DENSITIES, "none"]),
  calcMorphology: str,
  calcDistribution: str,
  seenOnViews: { type: "array", items: en(VIEW_LABELS) },
  localized: { type: "boolean" },
  regionView: en(VIEW_LABELS),
  x: num,
  y: num,
  w: num,
  h: num,
  confidence: num,
});

export const MAMMO_JSON_SCHEMA = obj({
  isMammogram: { type: "boolean" },
  viewsDetected: { type: "array", items: en(VIEW_LABELS) },
  quality: en(QUALITIES),
  qualityNotes: str,
  breastComposition: en(COMPOSITIONS),
  findings: { type: "array", items: FINDING_SCHEMA },
  biradsRight: en(BIRADS),
  biradsLeft: en(BIRADS),
  axillaryLymphNodes: str,
  comparisonWithPrior: str,
  impression: str,
  overallConfidence: num,
  attentionReasons: { type: "array", items: str },
  limitations: str,
});

const orNull = <T extends string>(v: unknown, sentinel: string): T | null => (typeof v === "string" && v.trim() && v !== sentinel ? (v.trim() as T) : null);

/** AI ning tekis, sentinel qiymatli javobini MammoDraft shakliga keltiradi (keyin zod tekshiradi; id va umumiy BI-RADS ni server beradi). */
export function fromAiRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const toFinding = (f: Record<string, any>, i: number) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: `f${i + 1}`,
    type: f.type,
    description: typeof f.description === "string" ? f.description : "",
    location: { quadrant: f.quadrant, clockFace: orNull(f.clockFace, ""), depth: orNull(f.depth, "unknown") },
    sizeMm: typeof f.sizeMm === "number" && f.sizeMm > 0 ? f.sizeMm : null,
    descriptors: {
      shape: orNull(f.shape, "none"),
      margin: orNull(f.margin, "none"),
      density: orNull(f.density, "none"),
      calcMorphology: orNull(f.calcMorphology, ""),
      calcDistribution: orNull(f.calcDistribution, ""),
    },
    seenOnViews: Array.isArray(f.seenOnViews) ? f.seenOnViews : [],
    region: f.localized ? { view: f.regionView, x: f.x, y: f.y, w: f.w, h: f.h } : null,
    confidence: typeof f.confidence === "number" ? f.confidence : 0,
  });
  const side = (name: string) => findings.filter((f: Record<string, unknown>) => f?.side === name).map(toFinding);
  return {
    imageCheck: { isMammogram: r.isMammogram, viewsDetected: r.viewsDetected ?? [], quality: r.quality, qualityNotes: r.qualityNotes ?? "" },
    breastComposition: r.breastComposition,
    breasts: { right: { findings: side("right"), biradsSuggestion: r.biradsRight }, left: { findings: side("left"), biradsSuggestion: r.biradsLeft } },
    axillaryLymphNodes: orNull(r.axillaryLymphNodes, ""),
    comparisonWithPrior: orNull(r.comparisonWithPrior, ""),
    overallBirads: r.biradsRight, // sanitizeDraft qayta hisoblaydi
    impression: r.impression ?? "",
    overallConfidence: r.overallConfidence,
    attentionReasons: Array.isArray(r.attentionReasons) ? r.attentionReasons.slice(0, 10) : [],
    limitations: r.limitations ?? "",
  };
}

export type DraftInput = {
  patientAge: number | null;
  indication: string;
  clinicalInfo: string;
  prior: { date: string; text: string } | null;
  images: { label: ViewLabel; aiFile: string; originalName: string }[];
};

export type DraftResult = {
  draft: MammoDraft;
  source: "AI" | "OFFLINE";
  model: string;
  effort: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function generateMammoDraft(input: DraftInput): Promise<DraftResult> {
  const started = Date.now();
  const views = input.images.map((i) => i.label);
  if (!aiEnabled()) {
    const draft = sanitizeDraft(offlineMammoDraft(input.images.map((i) => i.originalName), views), views);
    return { draft, source: "OFFLINE", model: "oflayn-shablon", effort: "-", latencyMs: Date.now() - started, inputTokens: null, outputTokens: null };
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: [
        `Patient: female${input.patientAge ? `, ${input.patientAge} years` : ""}.`,
        `Indication: ${input.indication === "DIAGNOSTIC" ? "diagnostic" : "screening"}.`,
        `Clinical info: ${input.clinicalInfo.trim() || "none"}`,
        input.prior ? `Prior study (${input.prior.date}), approved report:\n"""\n${input.prior.text}\n"""` : "No prior study provided.",
        `Views provided: ${views.join(", ")}.`,
      ].join("\n"),
    },
  ];
  for (const im of input.images) {
    const data = (await readMammoFile(im.aiFile)).toString("base64");
    content.push({ type: "text", text: `View ${im.label}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }

  const res = await callClaudeJson(MAMMO_SYSTEM_PROMPT, content, MAMMO_JSON_SCHEMA);
  const parsed = mammoDraftSchema.parse(fromAiRaw(res.json));
  return {
    draft: sanitizeDraft(parsed, views),
    source: "AI",
    model: res.model,
    effort: res.effort,
    latencyMs: Date.now() - started,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  };
}

export function currentModelInfo() {
  return aiEnabled() ? aiConfig() : { model: "oflayn-shablon", effort: "-" };
}
