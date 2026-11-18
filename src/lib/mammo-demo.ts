// Demo mammografiya tekshiruvlari: sintetik tasvirlar (seed chizadi) va ularga mos oflayn qoralamalar.
// Fayl nomlari: public/demo/mammo/mg-<slug>-<rcc|lcc|rmlo|lmlo>.png — shifokor shularni yuklasa,
// oflayn rejimda ham realistik qoralama qaytadi.
import type { Indication, MammoDraft, MammoFinding, ViewLabel } from "./mammo-types";

/** Sintetik tasvirdagi o'choq (rasmga nisbatan 0–1 koordinatalar, R proyeksiya uchun; L da x akslanadi). */
export type DemoLesion = {
  kind: "spiculated" | "oval" | "calc-coarse" | "asym";
  side: "R" | "L";
  cc: { x: number; y: number };
  mlo: { x: number; y: number };
  r: number; // radius (rasm kengligiga nisbatan)
};

export type DemoStudy = {
  slug: string;
  title: string;
  patientAge: number;
  indication: Indication;
  clinicalInfo: string;
  views: ViewLabel[];
  /** "chest" — mammografiya emas (ishonch chegarasini ko'rsatish uchun). */
  kind: "mammo" | "chest";
  density: number; // 0..1 fibroglandulyar to'qima ulushi
  lesions: DemoLesion[];
  draft: MammoDraft;
};

const box = (view: ViewLabel, c: { x: number; y: number }, r: number) => {
  const mirror = view.startsWith("L");
  const x = mirror ? 1 - c.x : c.x;
  // Rasm nisbati 1000×1300 — balandlik bo'yicha radiusni moslaymiz
  const ry = (r * 1000) / 1300;
  return { view, x: +(x - r * 1.5).toFixed(3), y: +(c.y - ry * 1.5).toFixed(3), w: +(r * 3).toFixed(3), h: +(ry * 3).toFixed(3) };
};

const noDesc = { shape: null, margin: null, density: null, calcMorphology: null, calcDistribution: null } as const;

function finding(f: Omit<MammoFinding, "descriptors"> & { descriptors?: Partial<MammoFinding["descriptors"]> }): MammoFinding {
  return { ...f, descriptors: { ...noDesc, ...f.descriptors } };
}

const ALL: ViewLabel[] = ["R-CC", "L-CC", "R-MLO", "L-MLO"];
const check = (views: ViewLabel[], quality: MammoDraft["imageCheck"]["quality"] = "adequate", qualityNotes = "") => ({
  isMammogram: true,
  viewsDetected: views,
  quality,
  qualityNotes,
});

const L_SPIC: DemoLesion = { kind: "spiculated", side: "R", cc: { x: 0.47, y: 0.36 }, mlo: { x: 0.5, y: 0.37 }, r: 0.035 };
const L_ASYM: DemoLesion = { kind: "asym", side: "L", cc: { x: 0.55, y: 0.64 }, mlo: { x: 0.58, y: 0.68 }, r: 0.03 };
const L_OVAL: DemoLesion = { kind: "oval", side: "R", cc: { x: 0.42, y: 0.4 }, mlo: { x: 0.45, y: 0.42 }, r: 0.025 };
const L_CALC: DemoLesion = { kind: "calc-coarse", side: "L", cc: { x: 0.5, y: 0.37 }, mlo: { x: 0.52, y: 0.4 }, r: 0.02 };

export const DEMO_STUDIES: DemoStudy[] = [
  {
    slug: "normal",
    title: "Normal, ACR B",
    patientAge: 46,
    indication: "SCREENING",
    clinicalInfo: "Shikoyat yo'q. Muntazam skrining. Oilaviy anamnez salbiy.",
    views: ALL,
    kind: "mammo",
    density: 0.45,
    lesions: [],
    draft: {
      imageCheck: check(ALL),
      breastComposition: "B",
      breasts: { right: { findings: [], biradsSuggestion: "1" }, left: { findings: [], biradsSuggestion: "1" } },
      axillaryLymphNodes: "Qo'ltiq osti sohasida normal o'lchamli, yog' darvozali limfa tugunlari.",
      comparisonWithPrior: null,
      overallBirads: "1",
      impression: "Ikkala ko'krak bezida o'choqli va shubhali o'zgarishlar aniqlanmadi.",
      overallConfidence: 0.86,
      attentionReasons: [],
      limitations: "Sintetik demo tasvir; ACR B zichlikda kichik hosilalar ko'rinmay qolishi mumkin.",
    },
  },
  {
    slug: "benign-calc",
    title: "Yaxshi sifatli kalsinatlar",
    patientAge: 58,
    indication: "SCREENING",
    clinicalInfo: "Shikoyat yo'q. 2 yil oldingi mammografiya normal bo'lgan. Menopauza 6 yil.",
    views: ALL,
    kind: "mammo",
    density: 0.35,
    lesions: [L_CALC],
    draft: {
      imageCheck: check(ALL),
      breastComposition: "B",
      breasts: {
        right: { findings: [], biradsSuggestion: "1" },
        left: {
          findings: [
            finding({
              id: "l1",
              type: "calcifications",
              description: "Yirik, \"popkorn\" ko'rinishidagi kalsinatlar — involyutsiyaga uchragan fibroadenomaga xos.",
              location: { quadrant: "UOQ", clockFace: "2", depth: "middle" },
              sizeMm: 9,
              descriptors: { calcMorphology: "yirik popkornsimon (coarse/popcorn-like)", calcDistribution: "guruhli (grouped)" },
              seenOnViews: ["L-CC", "L-MLO"],
              region: box("L-MLO", L_CALC.mlo, L_CALC.r),
              confidence: 0.84,
            }),
          ],
          biradsSuggestion: "2",
        },
      },
      axillaryLymphNodes: "O'zgarishsiz.",
      comparisonWithPrior: null,
      overallBirads: "2",
      impression: "Chap ko'krak bezida yaxshi sifatli (popkornsimon) kalsinatlar.",
      overallConfidence: 0.81,
      attentionReasons: [],
      limitations: "Kalsinatlar morfologiyasini aniqlash uchun kattalashtirilgan proyeksiya AI tomonidan ko'rilmagan.",
    },
  },
  {
    slug: "oval-mass",
    title: "Aniq chegarali oval hosila",
    patientAge: 39,
    indication: "DIAGNOSTIC",
    clinicalInfo: "O'ng ko'krak bezida davriy og'riq, paypaslanadigan hosila yo'q. UTT da o'ng UOQ da 11 mm gipoexogen hosila.",
    views: ALL,
    kind: "mammo",
    density: 0.62,
    lesions: [L_OVAL],
    draft: {
      imageCheck: check(ALL),
      breastComposition: "C",
      breasts: {
        right: {
          findings: [
            finding({
              id: "r1",
              type: "mass",
              description: "Bir xil zichlikdagi, atrof to'qimadan aniq ajralgan hosila; ichida kalsinat yo'q.",
              location: { quadrant: "UOQ", clockFace: "10", depth: "middle" },
              sizeMm: 11,
              descriptors: { shape: "oval", margin: "circumscribed", density: "equal" },
              seenOnViews: ["R-CC", "R-MLO"],
              region: box("R-CC", L_OVAL.cc, L_OVAL.r),
              confidence: 0.72,
            }),
          ],
          biradsSuggestion: "3",
        },
        left: { findings: [], biradsSuggestion: "1" },
      },
      axillaryLymphNodes: "O'zgarishsiz.",
      comparisonWithPrior: null,
      overallBirads: "3",
      impression: "O'ng ko'krak bezi yuqori-tashqi kvadrantida aniq chegarali oval hosila — ehtimoliy yaxshi sifatli (fibroadenoma?).",
      overallConfidence: 0.7,
      attentionReasons: ["ACR C zichlik — qo'shni sohada yashiringan o'zgarishlarni istisno qilib bo'lmaydi."],
      limitations: "Zich to'qimada AI sezgirligi pasayadi; UTT bilan solishtiring.",
    },
  },
  {
    slug: "spiculated",
    title: "Noto'g'ri shakldagi hosila",
    patientAge: 52,
    indication: "DIAGNOSTIC",
    clinicalInfo: "O'ng ko'krak bezida 1 oydan beri paypaslanadigan hosila. Onasida ko'krak bezi saratoni (55 yoshda).",
    views: ALL,
    kind: "mammo",
    density: 0.42,
    lesions: [L_SPIC, L_ASYM],
    draft: {
      imageCheck: check(ALL),
      breastComposition: "B",
      breasts: {
        right: {
          findings: [
            finding({
              id: "r1",
              type: "mass",
              description: "Atrof to'qimaga tortilishlar beruvchi zich hosila; paypaslanadigan soha bilan mos.",
              location: { quadrant: "UOQ", clockFace: "10", depth: "middle" },
              sizeMm: 16,
              descriptors: { shape: "irregular", margin: "indistinct", density: "high" },
              seenOnViews: ["R-CC", "R-MLO"],
              region: box("R-MLO", L_SPIC.mlo, L_SPIC.r),
              confidence: 0.8,
            }),
          ],
          biradsSuggestion: "4B",
        },
        left: {
          findings: [
            finding({
              id: "l1",
              type: "focal_asymmetry",
              description: "Faqat MLO proyeksiyada ko'rinadigan kichik o'choqli asimmetriya; CC da tasdiqlanmadi — superpozitsiya bo'lishi mumkin.",
              location: { quadrant: "LIQ", clockFace: "8", depth: "posterior" },
              sizeMm: null,
              seenOnViews: ["L-MLO"],
              region: box("L-MLO", L_ASYM.mlo, L_ASYM.r),
              confidence: 0.42,
            }),
          ],
          biradsSuggestion: "0",
        },
      },
      axillaryLymphNodes: "O'ng qo'ltiq ostida patologik kattalashgan limfa tugunlari aniqlanmadi.",
      comparisonWithPrior: null,
      overallBirads: "4B",
      impression: "O'ng ko'krak bezi yuqori-tashqi kvadrantida noto'g'ri shakldagi, noaniq chekkali zich hosila — xavfli o'smani istisno qilish kerak. Chapda faqat bitta proyeksiyada ko'ringan o'choqli asimmetriya.",
      overallConfidence: 0.78,
      attentionReasons: ["Chap ko'krak bezidagi asimmetriya faqat bitta proyeksiyada — past ishonch (42%)."],
      limitations: "Hosila chekkasi (spikulalar) AI tomonidan to'liq baholanmagan bo'lishi mumkin.",
    },
  },
  {
    slug: "not-mammo",
    title: "Mammografiya emas (ko'krak qafasi rentgeni)",
    patientAge: 60,
    indication: "SCREENING",
    clinicalInfo: "Xato yuklangan fayl — ishonch chegarasini ko'rsatish uchun.",
    views: ["R-CC"],
    kind: "chest",
    density: 0,
    lesions: [],
    draft: {
      imageCheck: { isMammogram: false, viewsDetected: [], quality: "inadequate", qualityNotes: "Tasvir ko'krak qafasi to'g'ri proyeksiyadagi rentgenogrammasi, mammografiya emas." },
      breastComposition: "A",
      breasts: { right: { findings: [], biradsSuggestion: "0" }, left: { findings: [], biradsSuggestion: "0" } },
      axillaryLymphNodes: null,
      comparisonWithPrior: null,
      overallBirads: "0",
      impression: "Tasvir mammografiya emas — qoralama yozilmadi.",
      overallConfidence: 0.05,
      attentionReasons: ["Yuklangan tasvir mammografiya emas."],
      limitations: "AI faqat mammografiya tasvirlari uchun mo'ljallangan.",
    },
  },
];

export const demoFileBase = (slug: string, view: ViewLabel) => `mg-${slug}-${view.toLowerCase().replace("-", "")}`;

/** Yuklangan fayl nomidan demo tekshiruvni topadi (oflayn rejim uchun). */
export function demoForFileNames(names: string[]): DemoStudy | null {
  for (const n of names) {
    const m = /^mg-([a-z-]+?)-(rcc|lcc|rmlo|lmlo|chest)\b/i.exec(n.trim());
    if (m) {
      const d = DEMO_STUDIES.find((s) => s.slug === m[1].toLowerCase());
      if (d) return d;
    }
  }
  return null;
}
