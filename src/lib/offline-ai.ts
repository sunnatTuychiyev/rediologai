/**
 * Deterministic, dependency-free fallback used when ANTHROPIC_API_KEY is not set
 * (and by the seed script). It is a simple lexical matcher — far less capable than
 * the LLM, but it keeps the demo working offline and produces the same JSON shape.
 */
import type { Evaluation, ReferenceFindings, ReferenceFinding } from "./types";

const STOP = new Set([
  "va", "bilan", "uchun", "yoki", "ham", "bu", "bor", "yo'q", "aniqlanadi", "aniqlandi", "ko'rinadi",
  "qayd", "etiladi", "holda", "tomonda", "sohada", "soha", "hamda", "esa", "the", "and", "with", "of",
]);

const LEFT = ["chap"];
const RIGHT = ["o'ng"];

export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[ʻʼ’‘`´]/g, "'")
    .replace(/[^a-z0-9а-яёўқғҳ'\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stems(text: string) {
  return normalize(text)
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim().replace(/^(texnika|tavsif|xulosa|tavsiya)\s*:\s*/i, ""))
    .filter((s) => s.length > 3);
}

function side(text: string): "L" | "R" | null {
  const n = normalize(text);
  const l = LEFT.some((w) => n.includes(w));
  const r = RIGHT.some((w) => n.includes(w));
  if (l && !r) return "L";
  if (r && !l) return "R";
  return null;
}

function overlap(a: string, b: string) {
  const sa = stems(a);
  if (!sa.length) return 0;
  const sb = new Set(stems(b));
  return sa.filter((s) => sb.has(s)).length / sa.length;
}

function bestSentence(target: string, pool: string[]) {
  let best = { s: "", score: 0 };
  for (const s of pool) {
    const sc = overlap(target, s);
    if (sc > best.score) best = { s, score: sc };
  }
  return best;
}

// ---------------------------------------------------------------------------
export function offlineExtract(report: string): ReferenceFindings {
  const sectionRe = /(xulosa|tavsiya|заключение|рекомендац\S*|impression|conclusion|recommendations?)\s*:/i;
  const parts = report.split(/\n/);
  let mode: "body" | "impression" | "rec" = "body";
  const body: string[] = [];
  const impression: string[] = [];
  const rec: string[] = [];
  for (const line of parts) {
    const m = line.match(sectionRe);
    let rest = line;
    if (m) {
      const label = m[1].toLowerCase();
      mode = /tavsiya|рекоменд|recommend/.test(label) ? "rec" : "impression";
      rest = line.slice((m.index ?? 0) + m[0].length);
    } else if (/^\s*(texnika|tavsif|техника|описание|technique|findings)\s*:/i.test(line)) {
      if (/texnika|техника|technique/i.test(line)) continue; // technique is not a finding
      mode = "body";
      rest = line.replace(/^\s*[^:]+:/, "");
    }
    if (!rest.trim()) continue;
    (mode === "body" ? body : mode === "impression" ? impression : rec).push(rest.trim());
  }

  const findings: ReferenceFinding[] = sentences(body.join(" ")).map((s, i) => {
    const n = normalize(s);
    const strong = /(pnevmotoraks|havo zonasi|kollab|gematoma|giperdens|kaverna|churra|konsolid|tugun)/.test(n);
    const negated = !strong && /(yo'q|aniqlanmaydi|aniqlanmadi|kuzatilmaydi)$/.test(n);
    const pathology = !negated && !/norma/.test(n) && PATHOLOGY_RE.test(n.replace(/\S+(magan|maydi|madi)\b/g, ""));
    const normal = !pathology && (negated || /(norma|o'zgarishsiz|toza|butun|erkin|saqlangan|silliq|kengaymagan|siljimagan)/.test(n));
    const critical = !normal && /(pnevmotoraks|havo zonasi|kollab|qon ?quyil|gematoma|giperdens|o'sma|tugun|kaverna|siljigan|churra|konsolid)/.test(n);
    return {
      key: `finding-${i + 1}`,
      text: s.replace(/[.;]\s*$/, ""),
      importance: normal ? "minor" : critical ? "critical" : "major",
      category: normal ? "normal_structure" : "finding",
    };
  });

  return {
    findings,
    impression: impression.join(" ").trim(),
    recommendations: rec.join(" ").trim(),
  };
}

// ---------------------------------------------------------------------------
type OfflineInput = { referenceFindings: ReferenceFindings; studentReport: string; referenceReport: string };

const PATHOLOGY_RE = /(infiltrat|konsolid|suyuqlik|pnevmotoraks|tugun|o'sma|kaverna|kengay|qon ?quyil|sinish|plevrit|pnevmoniya|kardiomegaliya|gidrotoraks|soya|o'choq|churra|gematoma)/;

export function offlineEvaluate({ referenceFindings, studentReport }: OfflineInput): Evaluation {
  const pool = sentences(studentReport);
  const usedSentences = new Set<string>();

  const findingResults = referenceFindings.findings.map((f) => {
    const best = bestSentence(f.text, pool);
    let status: "correct" | "partial" | "missed" = best.score >= 0.55 ? "correct" : best.score >= 0.3 ? "partial" : "missed";
    let comment = "";
    const refSide = side(f.text);
    const stSide = best.s ? side(best.s) : null;
    if (status !== "missed" && refSide && stSide && refSide !== stSide) {
      status = "partial";
      comment = "Siz tomonni noto'g'ri ko'rsatdingiz — lateralizatsiya xatosi davolash rejasiga bevosita ta'sir qiladi.";
    }
    // A "normal structure" matched by a sentence describing pathology is a contradiction, not a match.
    if (status !== "missed" && f.category === "normal_structure" && PATHOLOGY_RE.test(normalize(best.s)) && !PATHOLOGY_RE.test(normalize(f.text))) {
      status = "missed";
    }
    if (status !== "missed") usedSentences.add(best.s);
    if (!comment) {
      comment =
        status === "correct"
          ? "Siz bu topilmani to'g'ri tavsifladingiz."
          : status === "partial"
            ? "Siz bu topilmani qayd etdingiz, lekin tavsif to'liq emas (joylashuvi, hajmi yoki darajasi aniqlashtirilmagan)."
            : f.importance === "critical"
              ? "Siz kritik topilmani o'tkazib yubordingiz — bu tashxis va shoshilinch davolashni o'zgartiradi."
              : f.category === "normal_structure"
                ? "Normal strukturalarni ham qayd etish xulosani to'liq va ishonchli qiladi."
                : "Siz bu topilmani o'tkazib yubordingiz — u klinik ahamiyatga ega.";
    }
    return {
      key: f.key,
      referenceText: f.text,
      importance: f.importance,
      status,
      studentQuote: status === "missed" ? null : best.s || null,
      comment,
    };
  });

  // Student sentences that look like pathology but match nothing in the reference.
  const extraStatements: Evaluation["extraStatements"] = [];
  for (const s of pool) {
    if (usedSentences.has(s)) continue;
    if (/^(texnika|tavsiya|xulosa)\s*:/i.test(s)) continue;
    const n = normalize(s);
    if (!PATHOLOGY_RE.test(n)) continue;
    const supported = [...referenceFindings.findings.filter((f) => f.category === "finding").map((f) => f.text), referenceFindings.impression].some(
      (t) => overlap(s, t) >= 0.6 && (!side(t) || !side(s) || side(t) === side(s)),
    );
    if (supported) continue;
    const contradicts = referenceFindings.findings.some((f) => {
      if (f.category === "normal_structure" && overlap(f.text, s) >= 0.4) return true;
      const rs = side(f.text);
      const ss = side(s);
      return rs && ss && rs !== ss && overlap(f.text, s) >= 0.3;
    });
    extraStatements.push({
      studentQuote: s,
      type: contradicts ? "incorrect" : "overcall",
      comment: contradicts
        ? "Bu fikr shifokor xulosasiga zid keladi — noto'g'ri tomon yoki holat ko'rsatilgan."
        : "Shifokor xulosasida bunday patologiya qayd etilmagan — ortiqcha tashxis keraksiz tekshiruv va davolashga olib kelishi mumkin.",
    });
    if (extraStatements.length >= 4) break;
  }

  // Impression
  const impText = (studentReport.match(/xulosa\s*:([\s\S]*?)(tavsiya\s*:|$)/i)?.[1] ?? "").trim();
  const impOverlap = referenceFindings.impression ? overlap(referenceFindings.impression, impText || studentReport) : 1;
  const impStatus: Evaluation["impressionResult"]["status"] = !impText && impOverlap < 0.3
    ? "missing"
    : impOverlap >= 0.55
      ? "correct"
      : impOverlap >= 0.25
        ? "partial"
        : "wrong";
  const impComment = {
    correct: "Siz yakuniy tashxisni to'g'ri shakllantirdingiz.",
    partial: "Siz tashxisga yaqin keldingiz, lekin xulosa to'liq yoki aniq emas.",
    wrong: "Sizning xulosangiz shifokor tashxisiga mos kelmaydi — bu bemorni noto'g'ri davolashga olib kelishi mumkin.",
    missing: "Siz yakuniy xulosa (tashxis) yozmadingiz — xulosa hisobotning eng muhim qismi.",
  }[impStatus];

  // Structure
  const n = normalize(studentReport);
  const sections = ["texnika", "tavsif", "xulosa", "tavsiya"].filter((s) => n.includes(s)).length;
  const structure = Math.min(15, sections * 3 + (studentReport.length > 150 ? 3 : 0));

  const missed = findingResults.filter((f) => f.status === "missed");
  const correct = findingResults.filter((f) => f.status === "correct");

  const strengths: string[] = [];
  if (correct.length) strengths.push(`Siz ${correct.length} ta topilmani to'g'ri aniqladingiz.`);
  if (impStatus === "correct") strengths.push("Yakuniy tashxis to'g'ri.");
  if (sections >= 3) strengths.push("Hisobot tuzilmasi yaxshi (bo'limlarga ajratilgan).");
  if (!strengths.length) strengths.push("Siz mustaqil xulosa yozishga harakat qildingiz — bu yaxshi boshlanish.");

  const tips: string[] = [];
  if (missed.some((m) => m.importance === "critical")) tips.push("Avval kritik patologiyalarni (pnevmotoraks, o'sma, qon quyilish) tizimli ravishda izlang.");
  if (sections < 4) tips.push("Hisobotni 'Texnika — Tavsif — Xulosa — Tavsiya' tuzilmasida yozing.");
  if (missed.some((m) => m.importance !== "critical")) tips.push("Tasvirni tizimli o'qing: yumshoq to'qimalar, suyaklar, o'pka maydonlari, ildizlar, yurak, diafragma, sinuslar.");
  if (extraStatements.length) tips.push("Faqat tasvirda aniq ko'rinadigan o'zgarishlarni yozing — taxminiy tashxislardan saqlaning.");
  if (tips.length < 2) tips.push("Lateralizatsiya (o'ng/chap) va lokalizatsiyani (bo'lak, segment) har doim aniq ko'rsating.");

  const improvedReport = [
    "Texnika: Standart protokol bo'yicha tekshiruv o'tkazildi.",
    "",
    "Tavsif:",
    ...referenceFindings.findings.map((f) => `- ${f.text}.`),
    "",
    `Xulosa: ${referenceFindings.impression || "—"}`,
    "",
    `Tavsiya: ${referenceFindings.recommendations || "Klinik ko'rsatmalar bo'yicha."}`,
  ].join("\n");

  const summary =
    missed.length === 0 && impStatus === "correct"
      ? "Ajoyib! Siz barcha asosiy topilmalarni va tashxisni to'g'ri aniqladingiz."
      : `Siz ${correct.length}/${findingResults.length} topilmani to'g'ri aniqladingiz${missed.length ? `, ${missed.length} tasini o'tkazib yubordingiz` : ""}. ${impComment}`;

  return {
    score: 0,
    subscores: { findings: 0, impression: 0, accuracy: 0, structure },
    findingResults,
    extraStatements,
    impressionResult: { status: impStatus, comment: impComment },
    structureComment:
      sections >= 4
        ? "Hisobot to'liq tuzilmaga ega."
        : `Hisobotda ${4 - sections} ta bo'lim yetishmaydi (Texnika, Tavsif, Xulosa, Tavsiya).`,
    strengths,
    tips: tips.slice(0, 3),
    improvedReport,
    summary,
  };
}
