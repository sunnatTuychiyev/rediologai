// ANTHROPIC_API_KEY bo'lmaganda: demo fayllar uchun oldindan yozilgan qoralama,
// boshqa yuklamalar uchun — bloklangan (shablon bo'yicha qo'lda to'ldiriladi) natija.
import { demoForFileNames } from "./mammo-demo";
import type { MammoDraft, ViewLabel } from "./mammo-types";

export function offlineMammoDraft(fileNames: string[], views: ViewLabel[]): MammoDraft {
  const demo = demoForFileNames(fileNames);
  if (demo) return structuredClone(demo.draft);
  return {
    imageCheck: { isMammogram: true, viewsDetected: views, quality: "limited", qualityNotes: "Oflayn rejim: tasvir AI tomonidan tahlil qilinmadi." },
    breastComposition: "B",
    breasts: { right: { findings: [], biradsSuggestion: "0" }, left: { findings: [], biradsSuggestion: "0" } },
    axillaryLymphNodes: null,
    comparisonWithPrior: null,
    overallBirads: "0",
    impression: "",
    overallConfidence: 0,
    attentionReasons: ["Oflayn rejim: AI mavjud emas, shablon bo'yicha to'ldiring."],
    limitations: "AI kaliti sozlanmagan — qoralama yozilmadi.",
  };
}
