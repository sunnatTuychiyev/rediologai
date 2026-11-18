// Mammografiya moduli uchun umumiy turlar va zod sxemalari (server + klient).
import { z } from "zod";

export const INDICATIONS = ["SCREENING", "DIAGNOSTIC"] as const;
export const STUDY_STATUSES = ["UPLOADED", "DRAFTING", "DRAFT_READY", "NEEDS_ATTENTION", "IN_REVIEW", "APPROVED", "ERROR"] as const;
export const LATERALITIES = ["R", "L"] as const;
export const VIEWS = ["CC", "MLO", "OTHER"] as const;
export const VIEW_LABELS = ["R-CC", "L-CC", "R-MLO", "L-MLO"] as const;
export const COMPOSITIONS = ["A", "B", "C", "D"] as const;
export const BIRADS = ["0", "1", "2", "3", "4A", "4B", "4C", "5"] as const;
export const QUALITIES = ["adequate", "limited", "inadequate"] as const;
export const FINDING_TYPES = [
  "mass",
  "calcifications",
  "asymmetry",
  "focal_asymmetry",
  "architectural_distortion",
  "skin_thickening",
  "nipple_retraction",
  "intramammary_lymph_node",
  "other",
] as const;
export const QUADRANTS = ["UOQ", "UIQ", "LOQ", "LIQ", "central", "retroareolar", "axillary_tail"] as const;
export const DEPTHS = ["anterior", "middle", "posterior"] as const;
export const SHAPES = ["oval", "round", "irregular"] as const;
export const MARGINS = ["circumscribed", "obscured", "microlobulated", "indistinct", "spiculated"] as const;
export const DENSITIES = ["high", "equal", "low", "fat-containing"] as const;
export const REVIEW_STATES = ["pending", "accepted", "edited"] as const;
export const AUDIT_ACTIONS = [
  "STUDY_CREATED",
  "IMAGE_UPLOADED",
  "ANONYMIZED",
  "DRAFT_REQUESTED",
  "DRAFT_CREATED",
  "DRAFT_GATED",
  "DRAFT_REVEALED",
  "DRAFT_FAILED",
  "REPORT_EDITED",
  "REPORT_APPROVED",
  "REPORT_VIEWED",
  "EXPORTED",
] as const;

export type Indication = (typeof INDICATIONS)[number];
export type StudyStatus = (typeof STUDY_STATUSES)[number];
export type ViewLabel = (typeof VIEW_LABELS)[number];
export type Birads = (typeof BIRADS)[number];
export type Composition = (typeof COMPOSITIONS)[number];
export type FindingType = (typeof FINDING_TYPES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type Side = "right" | "left";

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable();

export const regionSchema = z.object({
  view: z.enum(VIEW_LABELS),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type FindingRegion = z.infer<typeof regionSchema>;

export const findingSchema = z.object({
  id: z.string().min(1).max(20),
  type: z.enum(FINDING_TYPES),
  description: z.string().max(1500),
  location: z.object({
    quadrant: z.enum(QUADRANTS),
    clockFace: z.string().max(10).nullable(),
    depth: nullableEnum(DEPTHS),
  }),
  sizeMm: z.number().nullable(),
  descriptors: z.object({
    shape: nullableEnum(SHAPES),
    margin: nullableEnum(MARGINS),
    density: nullableEnum(DENSITIES),
    calcMorphology: z.string().max(200).nullable(),
    calcDistribution: z.string().max(200).nullable(),
  }),
  seenOnViews: z.array(z.enum(VIEW_LABELS)).max(4),
  region: regionSchema.nullable(),
  confidence: z.number(),
  // Faqat shifokor tahririda (AI javobida yo'q):
  origin: z.enum(["ai", "doctor"]).optional(),
  review: z.enum(REVIEW_STATES).optional(),
});
export type MammoFinding = z.infer<typeof findingSchema>;

export const breastSchema = z.object({
  findings: z.array(findingSchema).max(20),
  biradsSuggestion: z.enum(BIRADS),
});

/** AI qaytaradigan (va server qoidalaridan o'tgan) qoralama. */
export const mammoDraftSchema = z.object({
  imageCheck: z.object({
    isMammogram: z.boolean(),
    viewsDetected: z.array(z.enum(VIEW_LABELS)).max(4),
    quality: z.enum(QUALITIES),
    qualityNotes: z.string().max(1000),
  }),
  breastComposition: z.enum(COMPOSITIONS),
  breasts: z.object({ right: breastSchema, left: breastSchema }),
  axillaryLymphNodes: z.string().max(1000).nullable(),
  comparisonWithPrior: z.string().max(1000).nullable(),
  overallBirads: z.enum(BIRADS),
  impression: z.string().max(2000),
  overallConfidence: z.number(),
  attentionReasons: z.array(z.string().max(500)).max(10),
  limitations: z.string().max(1000),
});
export type MammoDraft = z.infer<typeof mammoDraftSchema>;

/** Shifokor tahrir qiladigan xulosa (qoralama + ko'rib chiqish holati). */
export const reportPayloadSchema = z.object({
  quality: z.enum(QUALITIES),
  qualityNotes: z.string().max(1000),
  breastComposition: z.enum(COMPOSITIONS).nullable(),
  breasts: z.object({
    right: z.object({ findings: z.array(findingSchema).max(30), birads: z.enum(BIRADS).nullable() }),
    left: z.object({ findings: z.array(findingSchema).max(30), birads: z.enum(BIRADS).nullable() }),
  }),
  axillaryLymphNodes: z.string().max(1000),
  comparisonWithPrior: z.string().max(1000),
  impression: z.string().max(3000),
  /** Har tomon uchun izoh (masalan model natijasi matni) — topilmalar ro'yxatidan oldin chiqadi. */
  sideNotes: z.object({ right: z.string().max(1500), left: z.string().max(1500) }).default({ right: "", left: "" }),
  recommendationOverride: z.string().max(2000).nullable(),
  textOverride: z.string().max(12000).nullable(),
  deletedAiFindings: z.array(findingSchema).max(40),
});
export type ReportPayload = z.infer<typeof reportPayloadSchema>;

export type EditStats = {
  aiFindings: number;
  accepted: number;
  modified: number;
  removed: number;
  added: number;
  compositionChanged: boolean;
  biradsChanged: boolean;
  aiBirads: string;
  finalBirads: string;
  impressionChanged: boolean;
  textOverridden: boolean;
  editDistance: number;
  sections: Record<string, "changed" | "unchanged">;
  removedTypes: string[];
  addedTypes: string[];
};

export type Change = { path: string; from: unknown; to: unknown };

export const studyInputSchema = z.object({
  patientAge: z.number().int().min(18, "Yosh 18 dan kichik bo'lmasin").max(110, "Yosh noto'g'ri").nullable(),
  indication: z.enum(INDICATIONS),
  clinicalInfo: z.string().trim().max(2000, "Klinik ma'lumot juda uzun"),
  priorStudyId: z.string().min(1).nullable(),
});
export type StudyInput = z.infer<typeof studyInputSchema>;

export const imageMetaSchema = z.array(
  z.object({ id: z.string().min(1), laterality: z.enum(LATERALITIES), view: z.enum(VIEWS) }),
).min(1).max(4);
