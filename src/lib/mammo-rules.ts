// Deterministik server qoidalari: BI-RADS, tavsiyalar, ishonch chegarasi, xulosa matni, tahrir statistikasi.
// Klientda ham ishlatiladi (jonli ko'rinish), shuning uchun "server-only" emas.
import {
  BIRADS,
  VIEW_LABELS,
  type Birads,
  type Change,
  type EditStats,
  type MammoDraft,
  type MammoFinding,
  type ReportPayload,
  type Side,
  type ViewLabel,
} from "./mammo-types";

/** Ishonch chegarasi — model kartasida ham ko'rsatiladi. */
export const CONFIDENCE_THRESHOLD = 0.6;
/** Ishonchi shundan past topilma sariq ramka bilan belgilanadi. */
export const LOW_FINDING_CONFIDENCE = 0.6;

// ---------------------------------------------------------------------------
// Yorliqlar
// ---------------------------------------------------------------------------
export const FINDING_TYPE_LABEL: Record<string, string> = {
  mass: "Hosila (mass)",
  calcifications: "Kalsinatlar (calcifications)",
  asymmetry: "Asimmetriya (asymmetry)",
  focal_asymmetry: "O'choqli asimmetriya (focal asymmetry)",
  architectural_distortion: "Arxitektonika buzilishi (architectural distortion)",
  skin_thickening: "Teri qalinlashuvi (skin thickening)",
  nipple_retraction: "So'rg'ich retraksiyasi (nipple retraction)",
  intramammary_lymph_node: "Intramammar limfa tuguni",
  other: "Boshqa",
};
export const QUADRANT_LABEL: Record<string, string> = {
  UOQ: "yuqori-tashqi kvadrant",
  UIQ: "yuqori-ichki kvadrant",
  LOQ: "pastki-tashqi kvadrant",
  LIQ: "pastki-ichki kvadrant",
  central: "markaziy soha",
  retroareolar: "retroareolyar soha",
  axillary_tail: "qo'ltiq osti dumi (Spens dumi)",
};
export const DEPTH_LABEL: Record<string, string> = { anterior: "old uchdan bir qism", middle: "o'rta uchdan bir qism", posterior: "orqa uchdan bir qism" };
export const SHAPE_LABEL: Record<string, string> = { oval: "oval shakl", round: "dumaloq shakl", irregular: "noto'g'ri shakl" };
export const MARGIN_LABEL: Record<string, string> = {
  circumscribed: "aniq chegarali (circumscribed)",
  obscured: "yopilgan chekka (obscured)",
  microlobulated: "mikrobo'lakli chekka (microlobulated)",
  indistinct: "noaniq chekka (indistinct)",
  spiculated: "spikulali chekka (spiculated)",
};
export const DENSITY_LABEL: Record<string, string> = { high: "yuqori zichlik", equal: "teng zichlik", low: "past zichlik", "fat-containing": "yog' saqlovchi" };
export const COMPOSITION_LABEL: Record<string, string> = {
  A: "ACR A — deyarli butunlay yog' to'qimasi",
  B: "ACR B — tarqoq fibroglandulyar to'qima",
  C: "ACR C — notekis zich to'qima (kichik hosilalarni yashirishi mumkin)",
  D: "ACR D — juda zich to'qima (mammografiya sezgirligi pasayadi)",
};
export const QUALITY_LABEL: Record<string, string> = { adequate: "yetarli", limited: "cheklangan", inadequate: "yetarli emas" };
export const INDICATION_LABEL: Record<string, string> = { SCREENING: "Skrining", DIAGNOSTIC: "Diagnostik" };
export const STUDY_STATUS_LABEL: Record<string, string> = {
  UPLOADED: "Qoralama kutilmoqda",
  DRAFTING: "AI tahlil qilmoqda",
  DRAFT_READY: "Qoralama tayyor",
  NEEDS_ATTENTION: "E'tibor kerak",
  IN_REVIEW: "Ko'rib chiqilmoqda",
  APPROVED: "Tasdiqlangan",
  ERROR: "Xatolik",
};
export const SIDE_LABEL: Record<Side, string> = { right: "O'ng ko'krak bezi", left: "Chap ko'krak bezi" };
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  STUDY_CREATED: "Tekshiruv yaratildi",
  IMAGE_UPLOADED: "Tasvir yuklandi",
  ANONYMIZED: "Anonimlashtirildi",
  DRAFT_REQUESTED: "Qoralama so'raldi",
  DRAFT_CREATED: "AI qoralama yozdi",
  DRAFT_GATED: "Qoralama bloklandi (ishonch past)",
  DRAFT_REVEALED: "Bloklangan qoralama ko'rsatildi",
  DRAFT_FAILED: "Qoralamada xatolik",
  REPORT_EDITED: "Shifokor tahrirladi",
  REPORT_APPROVED: "Tasdiqlandi",
  REPORT_VIEWED: "Xulosa ko'rildi",
  EXPORTED: "Eksport qilindi",
};

// ---------------------------------------------------------------------------
// BI-RADS
// ---------------------------------------------------------------------------
const SEVERITY: Record<Birads, number> = { "1": 0, "2": 1, "3": 2, "0": 3, "4A": 4, "4B": 5, "4C": 6, "5": 7 };

export function isBirads(v: unknown): v is Birads {
  return typeof v === "string" && (BIRADS as readonly string[]).includes(v);
}

/** Eng og'ir kategoriya: 1 < 2 < 3 < 0 < 4A < 4B < 4C < 5. */
export function worstBirads(...values: (Birads | null | undefined)[]): Birads | null {
  const vs = values.filter(isBirads);
  if (!vs.length) return null;
  return vs.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
}

export function biradsSeverity(b: string | null | undefined) {
  return isBirads(b) ? SEVERITY[b] : -1;
}

export function recommendationFor(b: Birads | null): string {
  switch (b) {
    case "0":
      return "Qo'shimcha tekshiruv: qo'shimcha proyeksiyalar va/yoki ko'krak bezi UTT.";
    case "1":
    case "2":
      return "Yoshga mos muntazam skrining.";
    case "3":
      return "6 oydan keyin nazorat mammografiyasi.";
    case "4A":
    case "4B":
    case "4C":
    case "5":
      return "To'qima biopsiyasi (UTT yoki stereotaksik nazorat ostida).";
    default:
      return "—";
  }
}

export function biradsTone(b: string | null | undefined): "success" | "warning" | "danger" | "muted" | "secondary" {
  if (!isBirads(b)) return "muted";
  if (b === "1" || b === "2") return "success";
  if (b === "3" || b === "0") return "warning";
  return "danger";
}

// ---------------------------------------------------------------------------
// AI javobini tozalash (modelga ishonmaymiz)
// ---------------------------------------------------------------------------
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function sanitizeDraft(raw: MammoDraft, availableViews: ViewLabel[]): MammoDraft {
  const draft: MammoDraft = structuredClone(raw);
  const views = new Set(availableViews);
  const used = new Set<string>();

  for (const side of ["right", "left"] as const) {
    const prefix = side === "right" ? "R" : "L";
    const breast = draft.breasts[side];
    // BI-RADS 6 hech qachon (sxemada yo'q, lekin baribir tekshiramiz)
    if (!isBirads(breast.biradsSuggestion)) breast.biradsSuggestion = "0";
    breast.findings = (draft.imageCheck.isMammogram ? breast.findings : []).map((f, i) => {
      let id = `${prefix.toLowerCase()}${i + 1}`;
      while (used.has(id)) id += "x";
      used.add(id);
      const region = f.region && views.has(f.region.view) && f.region.view.startsWith(prefix)
        ? (() => {
            const x = clamp01(f.region.x);
            const y = clamp01(f.region.y);
            const w = Math.min(clamp01(f.region.w), 1 - x);
            const h = Math.min(clamp01(f.region.h), 1 - y);
            return w > 0.005 && h > 0.005 ? { view: f.region.view, x, y, w, h } : null;
          })()
        : null;
      return {
        ...f,
        id,
        confidence: clamp01(f.confidence),
        sizeMm: f.sizeMm != null && Number.isFinite(f.sizeMm) && f.sizeMm > 0 && f.sizeMm < 200 ? Math.round(f.sizeMm) : null,
        seenOnViews: Array.from(new Set(f.seenOnViews.filter((v) => views.has(v) && v.startsWith(prefix)))),
        region,
      };
    });
    if (!draft.imageCheck.isMammogram) breast.biradsSuggestion = "0";
  }
  draft.imageCheck.viewsDetected = draft.imageCheck.viewsDetected.filter((v) => (VIEW_LABELS as readonly string[]).includes(v));
  draft.overallBirads = worstBirads(draft.breasts.right.biradsSuggestion, draft.breasts.left.biradsSuggestion) ?? "0";
  draft.overallConfidence = clamp01(draft.overallConfidence);
  return draft;
}

/** Ishonch chegarasi (xavfsizlik qoidasi №3). Bo'sh massiv = qoralama ko'rsatiladi. */
export function gateReasons(d: MammoDraft): string[] {
  const reasons: string[] = [];
  if (!d.imageCheck.isMammogram) reasons.push("Yuklangan tasvir mammografiya emas.");
  if (d.imageCheck.quality === "inadequate") reasons.push(`Tasvir sifati yetarli emas${d.imageCheck.qualityNotes ? `: ${d.imageCheck.qualityNotes}` : "."}`);
  if (d.overallConfidence < CONFIDENCE_THRESHOLD) reasons.push(`AI ishonchi past (${Math.round(d.overallConfidence * 100)}% < ${Math.round(CONFIDENCE_THRESHOLD * 100)}%).`);
  const highRiskLowConf = [...d.breasts.right.findings, ...d.breasts.left.findings].some(
    (f) => (f.descriptors.margin === "spiculated" || f.type === "architectural_distortion" || /pleomorf|pleomorphic|fine linear|chiziqli/i.test(f.descriptors.calcMorphology ?? "")) && f.confidence < CONFIDENCE_THRESHOLD,
  );
  const highRiskBirads = ["4C", "5"].includes(d.overallBirads) && d.overallConfidence < 0.75;
  if (highRiskLowConf || highRiskBirads) reasons.push("Yuqori xavf belgilari past ishonch bilan aniqlangan — qarama-qarshi signal.");
  return reasons;
}

// ---------------------------------------------------------------------------
// Qoralama -> tahrir qilinadigan xulosa
// ---------------------------------------------------------------------------
export function emptyPayload(): ReportPayload {
  return {
    quality: "adequate",
    qualityNotes: "",
    breastComposition: null,
    breasts: { right: { findings: [], birads: null }, left: { findings: [], birads: null } },
    axillaryLymphNodes: "",
    comparisonWithPrior: "",
    impression: "",
    sideNotes: { right: "", left: "" },
    recommendationOverride: null,
    textOverride: null,
    deletedAiFindings: [],
  };
}

export function payloadFromDraft(d: MammoDraft): ReportPayload {
  const mark = (fs: MammoFinding[]) => fs.map((f) => ({ ...f, origin: "ai" as const, review: "pending" as const }));
  return {
    quality: d.imageCheck.quality,
    qualityNotes: d.imageCheck.qualityNotes,
    breastComposition: d.breastComposition,
    breasts: {
      right: { findings: mark(d.breasts.right.findings), birads: d.breasts.right.biradsSuggestion },
      left: { findings: mark(d.breasts.left.findings), birads: d.breasts.left.biradsSuggestion },
    },
    axillaryLymphNodes: d.axillaryLymphNodes ?? "",
    comparisonWithPrior: d.comparisonWithPrior ?? "",
    impression: d.impression,
    sideNotes: { right: "", left: "" },
    recommendationOverride: null,
    textOverride: null,
    deletedAiFindings: [],
  };
}

export function overallOf(p: ReportPayload): Birads | null {
  return worstBirads(p.breasts.right.birads, p.breasts.left.birads);
}

export const NOT_IMAGED_NOTE = "Ushbu tekshiruvda tasvirlanmagan.";

/** Tasvirlanmagan tomon: BI-RADS yo'q, topilmalar yo'q, izoh "tasvirlanmagan". */
export function markNotImaged(p: ReportPayload, imagedSides: Side[]): ReportPayload {
  for (const side of ["right", "left"] as const) {
    if (imagedSides.includes(side)) continue;
    p.breasts[side] = { findings: [], birads: null };
    p.sideNotes = { ...(p.sideNotes ?? { right: "", left: "" }), [side]: NOT_IMAGED_NOTE };
  }
  return p;
}

export function pendingAiFindings(p: ReportPayload) {
  return [...p.breasts.right.findings, ...p.breasts.left.findings].filter((f) => f.origin === "ai" && f.review === "pending");
}

// ---------------------------------------------------------------------------
// Xulosa matni (o'zbekcha shablon)
// ---------------------------------------------------------------------------
export function describeFinding(f: MammoFinding): string {
  const loc = [QUADRANT_LABEL[f.location.quadrant], f.location.clockFace ? `soat ${f.location.clockFace}` : null, f.location.depth ? DEPTH_LABEL[f.location.depth] : null]
    .filter(Boolean)
    .join(", ");
  const desc = [
    f.descriptors.shape ? SHAPE_LABEL[f.descriptors.shape] : null,
    f.descriptors.margin ? MARGIN_LABEL[f.descriptors.margin] : null,
    f.descriptors.density ? DENSITY_LABEL[f.descriptors.density] : null,
    f.descriptors.calcMorphology ? `morfologiyasi: ${f.descriptors.calcMorphology}` : null,
    f.descriptors.calcDistribution ? `tarqalishi: ${f.descriptors.calcDistribution}` : null,
  ].filter(Boolean);
  const parts = [`${FINDING_TYPE_LABEL[f.type] ?? f.type} — ${loc}${f.sizeMm ? `; o'lchami ~${f.sizeMm} mm` : ""}.`];
  if (desc.length) parts.push(desc.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".");
  if (f.description.trim()) parts.push(f.description.trim().replace(/([^.!?])$/, "$1."));
  if (f.seenOnViews.length) parts.push(`${f.seenOnViews.join(" va ")} proyeksiya${f.seenOnViews.length > 1 ? "larda" : "da"} ko'rinadi.`);
  return parts.join(" ");
}

export type RenderMeta = {
  code: string;
  date: Date | string;
  indication: string;
  clinicalInfo: string;
  patientAge: number | null;
  views: string[];
  approved?: { doctorName: string; at: Date | string } | null;
};

const fmt = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`;
};
const fmtTime = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fmt(x)} ${p(x.getHours())}:${p(x.getMinutes())}`;
};

export function renderMammoReport(p: ReportPayload, m: RenderMeta): string {
  const overall = overallOf(p);
  const header = m.approved ? "MAMMOGRAFIYA XULOSASI" : "MAMMOGRAFIYA XULOSASI (AI QORALAMASI — SHIFOKOR TASDIG'IGA QADAR RASMIY EMAS)";
  const sideText = (side: Side) => {
    const fs = p.breasts[side].findings;
    const note = p.sideNotes?.[side]?.trim();
    if (fs.length) {
      const list = fs.map((f, i) => `  ${i + 1}) ${describeFinding(f)}`).join("\n");
      return note ? `${note}\n${list}` : list;
    }
    return note || "O'choqli o'zgarishlar aniqlanmadi.";
  };
  const viewsText = m.views.length ? m.views.join(", ") : "—";
  const bilateral = m.views.some((v) => v.startsWith("R")) && m.views.some((v) => v.startsWith("L"));
  const lines = [
    header,
    `Tekshiruv kodi: ${m.code}        Sana: ${fmt(m.date)}`,
    `Ko'rsatma: ${INDICATION_LABEL[m.indication] ?? m.indication}.${m.patientAge ? ` Yoshi: ${m.patientAge}.` : ""}   Klinik ma'lumot: ${m.clinicalInfo.trim() || "—"}`,
    `Texnika: ${bilateral ? "Ikki tomonlama" : "Bir tomonlama"} mammografiya, proyeksiyalar: ${viewsText}. Sifati: ${QUALITY_LABEL[p.quality]}${p.qualityNotes.trim() ? ` (${p.qualityNotes.trim()})` : ""}.`,
    `Ko'krak bezi tuzilishi: ${p.breastComposition ? COMPOSITION_LABEL[p.breastComposition] : "—"}.`,
    "",
    `O'ng ko'krak bezi:\n${sideText("right")}`,
    "",
    `Chap ko'krak bezi:\n${sideText("left")}`,
    "",
    `Qo'ltiq osti limfa tugunlari: ${p.axillaryLymphNodes.trim() || "Baholanmagan."}`,
    `Oldingi tekshiruv bilan solishtirish: ${p.comparisonWithPrior.trim() || "Oldingi tekshiruv taqdim etilmagan."}`,
    "",
    `XULOSA: ${p.impression.trim() || "—"} ${[p.breasts.right.birads ? `BI-RADS ${p.breasts.right.birads} (o'ng)` : null, p.breasts.left.birads ? `BI-RADS ${p.breasts.left.birads} (chap)` : null].filter(Boolean).join(", ")}${p.breasts.right.birads && p.breasts.left.birads ? `. Umumiy: BI-RADS ${overall}` : ""}.`,
    `TAVSIYA: ${p.recommendationOverride?.trim() || recommendationFor(overall)}`,
    "",
    m.approved
      ? `Shifokor: ${m.approved.doctorName}   Tasdiqlangan: ${fmtTime(m.approved.at)}`
      : "Shifokor: ____________   Tasdiqlangan: ____________",
  ];
  return lines.join("\n");
}

/** Matn rejimida shifokor qo'lda o'zgartirgan bo'lsa — o'sha, aks holda shablon. */
export function finalText(p: ReportPayload, m: RenderMeta) {
  if (p.textOverride?.trim()) {
    const body = p.textOverride.trim();
    if (!m.approved) return body;
    // Tasdiqlanganda sarlavha va imzo qatorini yangilaymiz
    return body
      .replace(/^MAMMOGRAFIYA XULOSASI \(AI QORALAMASI[^\n]*\)/, "MAMMOGRAFIYA XULOSASI")
      .replace(/Shifokor: _+\s+Tasdiqlangan: _+/, `Shifokor: ${m.approved.doctorName}   Tasdiqlangan: ${fmtTime(m.approved.at)}`);
  }
  return renderMammoReport(p, m);
}

// ---------------------------------------------------------------------------
// Diff va tahrir statistikasi (audit-log uchun)
// ---------------------------------------------------------------------------
const findingCore = (f: MammoFinding) =>
  JSON.stringify({ t: f.type, d: f.description.trim(), l: f.location, s: f.sizeMm, ds: f.descriptors, v: [...f.seenOnViews].sort(), r: f.region });

export function diffPayload(a: ReportPayload, b: ReportPayload): Change[] {
  const out: Change[] = [];
  const cmp = (path: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path, from: x, to: y });
  };
  cmp("breastComposition", a.breastComposition, b.breastComposition);
  cmp("quality", a.quality, b.quality);
  cmp("qualityNotes", a.qualityNotes, b.qualityNotes);
  for (const side of ["right", "left"] as const) {
    cmp(`${side}.birads`, a.breasts[side].birads, b.breasts[side].birads);
    const am = new Map(a.breasts[side].findings.map((f) => [f.id, f]));
    const bm = new Map(b.breasts[side].findings.map((f) => [f.id, f]));
    for (const [id, f] of am) {
      const g = bm.get(id);
      if (!g) out.push({ path: `${side}.finding.${id}`, from: summarize(f), to: null });
      else {
        if (findingCore(f) !== findingCore(g)) out.push({ path: `${side}.finding.${id}`, from: summarize(f), to: summarize(g) });
        else if (f.review !== g.review) out.push({ path: `${side}.finding.${id}.review`, from: f.review, to: g.review });
      }
    }
    for (const [id, g] of bm) if (!am.has(id)) out.push({ path: `${side}.finding.${id}`, from: null, to: summarize(g) });
  }
  cmp("sideNotes.right", a.sideNotes?.right ?? "", b.sideNotes?.right ?? "");
  cmp("sideNotes.left", a.sideNotes?.left ?? "", b.sideNotes?.left ?? "");
  cmp("axillaryLymphNodes", a.axillaryLymphNodes, b.axillaryLymphNodes);
  cmp("comparisonWithPrior", a.comparisonWithPrior, b.comparisonWithPrior);
  cmp("impression", a.impression, b.impression);
  cmp("recommendationOverride", a.recommendationOverride, b.recommendationOverride);
  if ((a.textOverride ?? "") !== (b.textOverride ?? "")) out.push({ path: "textOverride", from: a.textOverride ? "…" : null, to: b.textOverride ? "(matn qo'lda tahrirlandi)" : null });
  return out;
}

function summarize(f: MammoFinding) {
  return `${FINDING_TYPE_LABEL[f.type] ?? f.type}, ${QUADRANT_LABEL[f.location.quadrant]}${f.sizeMm ? `, ${f.sizeMm} mm` : ""}${f.descriptors.margin ? `, ${f.descriptors.margin}` : ""}`;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  // Juda uzun matnlarda tezlik uchun cheklaymiz
  const s = a.slice(0, 6000);
  const t = b.slice(0, 6000);
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

export function computeEditStats(ai: ReportPayload, final: ReportPayload, aiText: string, finalTextValue: string): EditStats {
  const aiFindings = [...ai.breasts.right.findings, ...ai.breasts.left.findings];
  const finalFindings = [...final.breasts.right.findings, ...final.breasts.left.findings];
  const finalById = new Map(finalFindings.map((f) => [f.id, f]));
  let accepted = 0;
  let modified = 0;
  const removedTypes: string[] = [];
  for (const f of aiFindings) {
    const g = finalById.get(f.id);
    if (!g) removedTypes.push(f.type);
    else if (findingCore(f) === findingCore(g)) accepted++;
    else modified++;
  }
  const added = finalFindings.filter((f) => f.origin === "doctor");
  const aiB = overallOf(ai);
  const finB = overallOf(final);
  const sec = (x: unknown, y: unknown) => (JSON.stringify(x) === JSON.stringify(y) ? "unchanged" : "changed") as "changed" | "unchanged";
  const sideCore = (p: ReportPayload, s: Side) => ({ b: p.breasts[s].birads, f: p.breasts[s].findings.map(findingCore) });
  return {
    aiFindings: aiFindings.length,
    accepted,
    modified,
    removed: removedTypes.length,
    added: added.length,
    compositionChanged: ai.breastComposition !== final.breastComposition,
    biradsChanged: aiB !== finB,
    aiBirads: aiB ?? "—",
    finalBirads: finB ?? "—",
    impressionChanged: ai.impression.trim() !== final.impression.trim(),
    textOverridden: Boolean(final.textOverride?.trim()),
    editDistance: levenshtein(aiText, finalTextValue),
    sections: {
      texnika: sec([ai.quality, ai.qualityNotes], [final.quality, final.qualityNotes]),
      tuzilish: sec(ai.breastComposition, final.breastComposition),
      ong: sec(sideCore(ai, "right"), sideCore(final, "right")),
      chap: sec(sideCore(ai, "left"), sideCore(final, "left")),
      limfa: sec(ai.axillaryLymphNodes, final.axillaryLymphNodes),
      xulosa: sec(ai.impression, final.impression),
      tavsiya: sec(ai.recommendationOverride, final.recommendationOverride),
    },
    removedTypes,
    addedTypes: added.map((f) => f.type),
  };
}

export function viewLabel(laterality: string, view: string): ViewLabel | null {
  const v = `${laterality}-${view}`;
  return (VIEW_LABELS as readonly string[]).includes(v) ? (v as ViewLabel) : null;
}
