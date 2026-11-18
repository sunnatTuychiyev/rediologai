import { z } from "zod";

export const ROLES = ["STUDENT", "TEACHER", "DOCTOR"] as const;
export const MODALITIES = ["XRAY", "CT", "MRI"] as const;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const IMPORTANCES = ["critical", "major", "minor"] as const;
export const CATEGORIES = ["finding", "normal_structure"] as const;

export type Role = (typeof ROLES)[number];
export type Modality = (typeof MODALITIES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Importance = (typeof IMPORTANCES)[number];

// ---------- Reference findings ----------
export const referenceFindingSchema = z.object({
  key: z.string().min(1).max(80),
  text: z.string().min(1).max(500),
  importance: z.enum(IMPORTANCES),
  category: z.enum(CATEGORIES),
});
export type ReferenceFinding = z.infer<typeof referenceFindingSchema>;

export const referenceFindingsSchema = z.object({
  findings: z.array(referenceFindingSchema).max(60),
  impression: z.string().max(2000),
  recommendations: z.string().max(2000),
});
export type ReferenceFindings = z.infer<typeof referenceFindingsSchema>;

// ---------- Evaluation ----------
export const FINDING_STATUSES = ["correct", "partial", "missed"] as const;
export const EXTRA_TYPES = ["incorrect", "overcall"] as const;
export const IMPRESSION_STATUSES = ["correct", "partial", "wrong", "missing"] as const;

export const evaluationSchema = z.object({
  score: z.number(),
  subscores: z.object({
    findings: z.number(),
    impression: z.number(),
    accuracy: z.number(),
    structure: z.number(),
  }),
  findingResults: z.array(
    z.object({
      key: z.string(),
      referenceText: z.string(),
      importance: z.enum(IMPORTANCES),
      status: z.enum(FINDING_STATUSES),
      studentQuote: z.string().nullable(),
      comment: z.string(),
    }),
  ),
  extraStatements: z.array(
    z.object({
      studentQuote: z.string(),
      type: z.enum(EXTRA_TYPES),
      comment: z.string(),
    }),
  ),
  impressionResult: z.object({ status: z.enum(IMPRESSION_STATUSES), comment: z.string() }),
  structureComment: z.string(),
  strengths: z.array(z.string()),
  tips: z.array(z.string()),
  improvedReport: z.string(),
  summary: z.string(),
});
export type Evaluation = z.infer<typeof evaluationSchema> & {
  source?: "ai" | "offline";
  capped?: boolean;
};

// ---------- Inputs ----------
export const caseInputSchema = z.object({
  title: z.string().trim().min(3, "Sarlavha juda qisqa").max(200),
  modality: z.enum(MODALITIES),
  bodyRegion: z.string().trim().min(2).max(100),
  difficulty: z.enum(DIFFICULTIES),
  clinicalInfo: z.string().trim().min(5, "Klinik ma'lumot kiriting").max(2000),
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  referenceReport: z.string().trim().min(20, "Shifokor xulosasi juda qisqa").max(10000),
  referenceFindings: referenceFindingsSchema,
  images: z
    .array(z.object({ url: z.string().startsWith("/"), label: z.string().max(100).nullable().optional() }))
    .min(1, "Kamida bitta rasm yuklang")
    .max(200),
  isPublished: z.boolean(),
});
export type CaseInput = z.infer<typeof caseInputSchema>;

export const submissionInputSchema = z.object({
  caseId: z.string().min(1),
  assignmentId: z.string().min(1).nullable().optional(),
  reportText: z
    .string()
    .trim()
    .min(30, "Xulosa kamida 30 ta belgidan iborat bo'lishi kerak")
    .max(8000, "Xulosa juda uzun"),
  durationSec: z.number().int().min(0).max(60 * 60 * 10),
});

export const registerInputSchema = z.object({
  name: z.string().trim().min(2, "Ismingizni kiriting").max(100),
  email: z.string().trim().toLowerCase().email("Email noto'g'ri"),
  password: z.string().min(6, "Parol kamida 6 ta belgi").max(100),
  groupCode: z.string().trim().max(50).optional().or(z.literal("")),
});
