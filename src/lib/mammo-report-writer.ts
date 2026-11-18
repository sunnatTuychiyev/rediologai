import "server-only";
// Claude TASVIRNI KO'RMAYDI: faqat model natijasi (raqamlar) va tuzilgan qoralamadan o'zbekcha matn yozadi.
import { aiEnabled, callClaudeJson } from "./ai";
import { RISK_LABEL, agreementOf, riskOf, type EngineResult } from "./mammo-model";
import { COMPOSITION_LABEL, INDICATION_LABEL } from "./mammo-rules";
import type { MammoDraft } from "./mammo-types";

const SYSTEM = `You write the text of a mammography report draft in Uzbek (Latin script) for a radiologist.
You do NOT see the images. Your only source is the output of a specialised AI model (ianpan/mammoscreen) and the clinical info.

The model gives, per breast: cancer probability (0–1), breast density (ACR A–D), and an approximate attention region (CAM).
It does NOT identify lesion type (mass/calcification), size, margins or BI-RADS descriptors. BI-RADS values you receive
are automatic suggestions derived from probability thresholds — repeat them exactly, never change them.

Rules:
- Never invent findings, lesion types, sizes or descriptors that are not in the input.
- Use cautious language ("model ... baholadi", "shubha", "tavsiya etiladi shifokor baholashi"); never state a diagnosis.
- Mention probabilities as percentages with one decimal and the risk level given.
- Keep it concise and professional, like a radiology report. Uzbek Latin; keep BI-RADS and ACR as is.
- breastText: 1–2 sentences per breast for the findings section. impression: 1–3 sentences.
- If a breast was not imaged, leave its text empty ("").
- Write "saraton", never the English word "cancer". Do not claim "no focal lesions": the model does not detect lesions, it only scores probability.
- Only when a breast's risk is "Past" (low): add one sentence that a low model score does not exclude cancer (limited sensitivity, especially on equipment the model was not trained on). Do not add this sentence for other risk levels.
- Use only Latin-script letters (no Cyrillic characters), with o' and g' written with an apostrophe.
Return only JSON matching the schema.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["impression", "rightText", "leftText", "attention"],
  properties: {
    impression: { type: "string" },
    rightText: { type: "string" },
    leftText: { type: "string" },
    attention: { type: "array", items: { type: "string" } },
  },
};

type Ctx = { patientAge: number | null; indication: string; clinicalInfo: string; prior: { date: string; text: string } | null };

function breastSummary(res: EngineResult, side: "R" | "L", draft: MammoDraft) {
  const b = res.breasts[side];
  if (!b) return { imaged: false };
  const d = draft.breasts[side === "R" ? "right" : "left"];
  const f = d.findings[0];
  return {
    imaged: true,
    views: b.views.map((v) => v.label),
    cancerProbabilityPct: +(b.cancerProbability * 100).toFixed(1),
    risk: RISK_LABEL[riskOf(b.cancerProbability)],
    ensembleAgreementPct: Math.round(agreementOf(b) * 100),
    densityClass: b.densityClass,
    biradsSuggestion: d.biradsSuggestion,
    attentionRegion: f ? { approxQuadrant: f.location.quadrant, clock: f.location.clockFace, views: f.seenOnViews } : null,
  };
}

/** Deterministik matn (Claude kaliti bo'lmasa yoki xato bo'lsa). */
function templateText(res: EngineResult, draft: MammoDraft) {
  const sideText = (side: "R" | "L") => {
    const b = res.breasts[side];
    if (!b) return "";
    const r = riskOf(b.cancerProbability);
    return `Model saraton ehtimolini ${(b.cancerProbability * 100).toFixed(1)}% deb baholadi (${RISK_LABEL[r].toLowerCase()} xavf, ansambl kelishuvi ${Math.round(agreementOf(b) * 100)}%).${r === "low" ? " Shubhali diqqat sohasi ajratilmadi." : " Diqqat sohasi tasvirda belgilangan."}`;
  };
  const worst = (["R", "L"] as const).map((s) => res.breasts[s]).filter(Boolean).sort((a, b) => b!.cancerProbability - a!.cancerProbability)[0];
  const r = worst ? riskOf(worst.cancerProbability) : "low";
  const impression =
    r === "low"
      ? `Model ikkala ko'krak bezida saraton ehtimolini past baholadi. Zichlik: ${COMPOSITION_LABEL[draft.breastComposition]}.`
      : `Model ${worst === res.breasts.R ? "o'ng" : "chap"} ko'krak bezida ${RISK_LABEL[r].toLowerCase()} xavf (${(worst!.cancerProbability * 100).toFixed(1)}%) aniqladi — shifokor baholashi va qo'shimcha tekshiruv talab etiladi.`;
  return { impression, rightText: sideText("R"), leftText: sideText("L"), attention: [] as string[] };
}

export async function writeReportText(res: EngineResult, draft: MammoDraft, ctx: Ctx): Promise<{ text: ReturnType<typeof templateText>; writer: string; tokens: [number | null, number | null] }> {
  if (!aiEnabled()) return { text: templateText(res, draft), writer: "shablon", tokens: [null, null] };
  const input = {
    patient: { sex: "female", age: ctx.patientAge, indication: INDICATION_LABEL[ctx.indication] ?? ctx.indication, clinicalInfo: ctx.clinicalInfo || null },
    prior: ctx.prior,
    model: { name: res.model, publishedAuc: res.publishedAuc },
    density: { class: draft.breastComposition, label: COMPOSITION_LABEL[draft.breastComposition] },
    right: breastSummary(res, "R", draft),
    left: breastSummary(res, "L", draft),
    overallBiradsSuggestion: draft.overallBirads,
  };
  try {
    const out = await callClaudeJson(SYSTEM, `Model output and context (JSON):\n${JSON.stringify(input, null, 1)}`, SCHEMA);
    const j = out.json as ReturnType<typeof templateText>;
    if (typeof j?.impression !== "string" || typeof j.rightText !== "string" || typeof j.leftText !== "string") throw new Error("bad json");
    return { text: { ...j, attention: Array.isArray(j.attention) ? j.attention.slice(0, 5).map(String) : [] }, writer: out.model, tokens: [out.inputTokens, out.outputTokens] };
  } catch (e) {
    console.error("[report-writer] Claude xatosi, shablon ishlatiladi", e);
    return { text: templateText(res, draft), writer: "shablon (Claude xatosi)", tokens: [null, null] };
  }
}

/** Matnni qoralamaga joylaydi: topilma tavsifi va xulosa. Raqamlar/BI-RADS o'zgarmaydi. */
export function applyText(draft: MammoDraft, text: ReturnType<typeof templateText>): MammoDraft {
  const d = structuredClone(draft);
  d.impression = text.impression.trim();
  const put = (side: "right" | "left", t: string) => {
    const f = d.breasts[side].findings[0];
    if (f && t.trim()) f.description = t.trim();
  };
  put("right", text.rightText);
  put("left", text.leftText);
  d.attentionReasons = Array.from(new Set([...d.attentionReasons, ...text.attention])).slice(0, 10);
  // Topilmasiz tomon uchun matn "aniqlanmadi" o'rniga xulosaga qo'shimcha sifatida
  const noFinding = (["right", "left"] as const).filter((s) => !d.breasts[s].findings.length);
  if (noFinding.length === 2 && !d.impression) d.impression = text.rightText;
  return d;
}
