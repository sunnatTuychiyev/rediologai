// Uzbek (Latin) display labels for enum-like values.
export const MODALITY_LABEL: Record<string, string> = { XRAY: "Rentgen", CT: "KT", MRI: "MRT" };
export const DIFFICULTY_LABEL: Record<string, string> = { EASY: "Oson", MEDIUM: "O'rta", HARD: "Qiyin" };
export const IMPORTANCE_LABEL: Record<string, string> = { critical: "Kritik", major: "Muhim", minor: "Kichik" };
export const CATEGORY_LABEL: Record<string, string> = { finding: "Patologiya", normal_structure: "Normal struktura" };
export const FINDING_STATUS_LABEL: Record<string, string> = {
  correct: "To'g'ri",
  partial: "Qisman",
  missed: "O'tkazib yuborilgan",
};
export const EXTRA_TYPE_LABEL: Record<string, string> = { incorrect: "Noto'g'ri", overcall: "Ortiqcha" };
export const IMPRESSION_STATUS_LABEL: Record<string, string> = {
  correct: "To'g'ri",
  partial: "Qisman to'g'ri",
  wrong: "Noto'g'ri",
  missing: "Yozilmagan",
};
export const BODY_REGIONS = ["Ko'krak qafasi", "Bosh miya", "Qorin bo'shlig'i", "Umurtqa pog'onasi", "Bo'g'imlar", "Kichik chanoq"];
export const REPORT_TEMPLATE = "Texnika:\n\nTavsif:\n\nXulosa:\n\nTavsiya:";
