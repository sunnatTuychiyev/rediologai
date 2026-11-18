import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { evaluationSchema, referenceFindingsSchema, type Evaluation, type ReferenceFindings } from "./types";
import { finalizeEvaluation } from "./scoring";
import { offlineEvaluate, offlineExtract } from "./offline-ai";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const EXTRACTION_SYSTEM_PROMPT = `You are an experienced radiologist and medical educator.
You receive a radiology report written by a physician. Extract its content into a structured list.
Rules:
- Split the report into atomic findings: one pathological finding or one explicitly described important normal structure per item.
- Mark importance: "critical" = changes diagnosis or urgent management; "major" = clinically significant; "minor" = minor/incidental.
- Mark category: "finding" for pathology, "normal_structure" for explicitly stated normal findings.
- Extract the final impression (conclusion/diagnosis) and recommendations separately.
- Do NOT add anything that is not in the report. Do NOT infer new diagnoses.
- Write all text in Uzbek (Latin script), keeping standard medical terms (Latin/Russian terms may be given in parentheses).
- "key" must be a short unique kebab-case English identifier, e.g. "rll-consolidation".
Return only JSON matching the schema.`;

const EVALUATION_SYSTEM_PROMPT = `You are a strict but supportive radiology professor grading a student's radiology report.
You are given:
1) the physician's reference report and its structured findings — this is the ground truth;
2) the student's report.
You do NOT see the image. Judge ONLY by comparing the student's text with the reference. Never invent findings that are not in the reference.

For EACH reference finding decide:
- "correct": the student described it correctly (synonyms and different wording are acceptable if the medical meaning is the same);
- "partial": mentioned but with wrong location, side, size, severity or imprecise wording;
- "missed": not mentioned.
Then list student statements that are NOT supported by the reference:
- "incorrect": contradicts the reference (e.g. wrong side, says normal where pathology exists);
- "overcall": describes a pathology that the reference does not mention.

Scoring (total 100):
- Findings detection: 50 points, weighted by importance (critical = 3, major = 2, minor = 1; correct = full weight, partial = half, missed = 0).
- Impression / diagnosis: 25 points (correct = 25, partially correct = 10–15, wrong or missing = 0).
- No incorrect statements / overcalls: 10 points (−5 per incorrect, −3 per overcall, minimum 0).
- Report structure and terminology: 15 points (has technique/description/impression/recommendation sections, uses correct medical terms, clear and concise).
A missed "critical" finding caps the total score at 60.

Feedback rules:
- Write in Uzbek (Latin script), short and specific, addressed to the student ("Siz ...").
- For every missed / partial / incorrect item explain WHY it matters clinically in one sentence.
- Give 2–3 concrete tips for improvement.
- Write an "improvedReport": the student's report rewritten into a correct, well-structured report, based ONLY on reference facts.
- "studentQuote" must be an EXACT substring copied from the student's report (or null if missed).
- Return exactly one findingResults item per reference finding, using the same "key".
Return only JSON matching the schema.`;

// ---------------------------------------------------------------------------
// JSON Schemas for structured output (strict mode)
// ---------------------------------------------------------------------------
const str = { type: "string" } as const;
const num = { type: "number" } as const;

const REFERENCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings", "impression", "recommendations"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "text", "importance", "category"],
        properties: {
          key: str,
          text: str,
          importance: { type: "string", enum: ["critical", "major", "minor"] },
          category: { type: "string", enum: ["finding", "normal_structure"] },
        },
      },
    },
    impression: str,
    recommendations: str,
  },
};

const EVALUATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "subscores",
    "findingResults",
    "extraStatements",
    "impressionResult",
    "structureComment",
    "strengths",
    "tips",
    "improvedReport",
    "summary",
  ],
  properties: {
    score: num,
    subscores: {
      type: "object",
      additionalProperties: false,
      required: ["findings", "impression", "accuracy", "structure"],
      properties: { findings: num, impression: num, accuracy: num, structure: num },
    },
    findingResults: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "referenceText", "importance", "status", "studentQuote", "comment"],
        properties: {
          key: str,
          referenceText: str,
          importance: { type: "string", enum: ["critical", "major", "minor"] },
          status: { type: "string", enum: ["correct", "partial", "missed"] },
          studentQuote: { anyOf: [{ type: "string" }, { type: "null" }] },
          comment: str,
        },
      },
    },
    extraStatements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["studentQuote", "type", "comment"],
        properties: {
          studentQuote: str,
          type: { type: "string", enum: ["incorrect", "overcall"] },
          comment: str,
        },
      },
    },
    impressionResult: {
      type: "object",
      additionalProperties: false,
      required: ["status", "comment"],
      properties: { status: { type: "string", enum: ["correct", "partial", "wrong", "missing"] }, comment: str },
    },
    structureComment: str,
    strengths: { type: "array", items: str },
    tips: { type: "array", items: str },
    improvedReport: str,
    summary: str,
  },
};

// ---------------------------------------------------------------------------
// Client (Claude API — server-side only)
// ---------------------------------------------------------------------------
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient() {
  // 60 s per attempt, 1 retry. Opus 5.5 always thinks before answering, so 30 s can be too tight.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

export type ClaudeJsonResult = { json: unknown; model: string; effort: Effort; inputTokens: number | null; outputTokens: number | null };

export function aiConfig() {
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const envEffort = process.env.ANTHROPIC_EFFORT as Effort | undefined;
  const effort: Effort = envEffort && EFFORTS.includes(envEffort) ? envEffort : "low";
  return { model, effort };
}

/** Structured-output (json_schema) chaqiruvi. `content` — matn yoki matn+rasm bloklari. */
export async function callClaudeJson(
  system: string,
  content: string | Anthropic.Beta.BetaContentBlockParam[],
  schema: Record<string, unknown>,
): Promise<ClaudeJsonResult> {
  const { model, effort } = aiConfig();

  // Structured output (json_schema) guarantees parseable JSON. Sampling params (temperature)
  // are not accepted by current Claude models; determinism comes from the schema + rubric.
  // Server-side fallback: if a safety classifier declines (medical content can trip one),
  // the API re-runs the request on a fallback model within the same call.
  const response = await getClient().beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content }],
    output_config: { effort, format: { type: "json_schema", schema } },
  });

  if (response.stop_reason === "refusal") throw new Error("AI so'rovni rad etdi");
  if (response.stop_reason === "max_tokens") throw new Error("AI javobi juda uzun bo'ldi (max_tokens)");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text) throw new Error("AI bo'sh javob qaytardi");
  return {
    json: JSON.parse(text.text),
    model: response.model,
    effort,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

async function callJson(system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
  return (await callClaudeJson(system, user, schema)).json;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function extractFindings(referenceReport: string): Promise<ReferenceFindings & { source: "ai" | "offline" }> {
  if (!aiEnabled()) return { ...offlineExtract(referenceReport), source: "offline" };
  const json = await callJson(EXTRACTION_SYSTEM_PROMPT, `Reference report:\n"""\n${referenceReport}\n"""`, REFERENCE_JSON_SCHEMA);
  const parsed = referenceFindingsSchema.parse(json);
  // Ensure keys are unique.
  const seen = new Set<string>();
  parsed.findings = parsed.findings.map((f, i) => {
    let key = f.key.trim() || `finding-${i + 1}`;
    while (seen.has(key)) key = `${key}-${i + 1}`;
    seen.add(key);
    return { ...f, key };
  });
  return { ...parsed, source: "ai" };
}

export type EvaluationInput = {
  clinicalInfo: string;
  modality: string;
  bodyRegion: string;
  referenceReport: string;
  referenceFindings: ReferenceFindings;
  studentReport: string;
};

export async function evaluateReport(input: EvaluationInput): Promise<Evaluation> {
  if (!aiEnabled()) {
    return { ...finalizeEvaluation(offlineEvaluate(input), input.referenceFindings), source: "offline" };
  }
  const user = [
    `Modality: ${input.modality}`,
    `Body region: ${input.bodyRegion}`,
    `Clinical info: ${input.clinicalInfo}`,
    ``,
    `REFERENCE REPORT (ground truth):\n"""\n${input.referenceReport}\n"""`,
    ``,
    `REFERENCE FINDINGS (JSON):\n${JSON.stringify(input.referenceFindings, null, 2)}`,
    ``,
    `STUDENT REPORT:\n"""\n${input.studentReport}\n"""`,
  ].join("\n");
  const json = await callJson(EVALUATION_SYSTEM_PROMPT, user, EVALUATION_JSON_SCHEMA);
  const parsed = evaluationSchema.parse(json);
  return { ...finalizeEvaluation(parsed, input.referenceFindings), source: "ai" };
}
