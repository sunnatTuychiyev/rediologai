import "server-only";
import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { MAMMO_DIR } from "./imaging";
import { RISK_LABEL, agreementOf, riskOf, type EngineResult } from "./mammo-model";
import type { ModelEval } from "@/components/mammo/model-panel";
import type { ReportPayload } from "./mammo-types";

const NAVY = rgb(15 / 255, 30 / 255, 58 / 255);
const CYAN = rgb(94 / 255, 211 / 255, 238 / 255);
const MUTED = rgb(91 / 255, 107 / 255, 130 / 255);
const LINE = rgb(221 / 255, 227 / 255, 236 / 255);
const RED = rgb(239 / 255, 68 / 255, 68 / 255);
const W = 595.28;
const H = 841.89;
const M = 42;

const FONT_DIR = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");

export type PdfInput = {
  code: string;
  date: Date;
  approved: { doctorName: string; at: Date } | null;
  text: string;
  payload: ReportPayload;
  images: { file: string; label: string; width: number; height: number }[];
  engine: EngineResult | null;
  modelEval: ModelEval;
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    const indent = raw.match(/^\s*/)?.[0] ?? "";
    let line = "";
    for (const word of raw.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : `${indent}${word}`;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = `${indent}   ${word}`;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export async function buildReportPdf(inp: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Mammografiya xulosasi ${inp.code}`);
  doc.setAuthor("RadiologAI");
  doc.setSubject(inp.approved ? "Tasdiqlangan xulosa" : "Qoralama — shifokor tasdiqlamagan");
  const font = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "DejaVuSans.ttf")), { subset: true });
  const bold = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")), { subset: true });

  let page: PDFPage = doc.addPage([W, H]);
  let y = H;
  const pages: PDFPage[] = [page];
  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
  };
  const ensure = (need: number) => {
    if (y - need < M + 30) newPage();
  };

  // ---- Sarlavha
  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: NAVY });
  page.drawText("RadiologAI", { x: M, y: H - 40, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Mammografiya xulosasi", { x: M, y: H - 60, size: 11, font, color: CYAN });
  const right = `${inp.code}  ·  ${fmt(inp.date)}`;
  page.drawText(right, { x: W - M - font.widthOfTextAtSize(right, 10), y: H - 40, size: 10, font, color: rgb(1, 1, 1) });
  const status = inp.approved ? "TASDIQLANGAN" : "QORALAMA — RASMIY EMAS";
  const sw = bold.widthOfTextAtSize(status, 9) + 16;
  page.drawRectangle({ x: W - M - sw, y: H - 66, width: sw, height: 16, color: inp.approved ? rgb(0.09, 0.5, 0.24) : rgb(0.88, 0.54, 0.07) });
  page.drawText(status, { x: W - M - sw + 8, y: H - 61.5, size: 9, font: bold, color: rgb(1, 1, 1) });
  y = H - 96;

  // ---- Tasvirlar (osish tartibida) + sohalar
  const order = ["R-MLO", "L-MLO", "R-CC", "L-CC"];
  const imgs = [...inp.images].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)).slice(0, 4);
  if (imgs.length) {
    const gap = 8;
    const cellW = (W - 2 * M - gap * 3) / 4;
    const cellH = 150;
    for (const [i, im] of imgs.entries()) {
      try {
        const jpg = await sharp(path.join(MAMMO_DIR, im.file)).resize({ width: 360, height: 450, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
        const e = await doc.embedJpg(jpg);
        const s = Math.min(cellW / e.width, cellH / e.height);
        const w = e.width * s;
        const h = e.height * s;
        const x = M + i * (cellW + gap) + (cellW - w) / 2;
        const top = y;
        page.drawRectangle({ x: M + i * (cellW + gap), y: top - cellH, width: cellW, height: cellH, color: rgb(0, 0, 0) });
        page.drawImage(e, { x, y: top - cellH + (cellH - h) / 2, width: w, height: h });
        const iy = top - cellH + (cellH - h) / 2;
        for (const side of ["right", "left"] as const) {
          for (const f of inp.payload.breasts[side].findings) {
            if (!f.region || f.region.view !== im.label) continue;
            page.drawRectangle({ x: x + f.region.x * w, y: iy + (1 - f.region.y - f.region.h) * h, width: f.region.w * w, height: f.region.h * h, borderColor: RED, borderWidth: 1.2 });
          }
        }
        page.drawText(im.label, { x: M + i * (cellW + gap) + 4, y: top - cellH + 4, size: 8, font: bold, color: rgb(1, 1, 1) });
      } catch {
        /* rasm topilmasa — o'tkazib yuboramiz */
      }
    }
    y -= cellH + 14;
  }

  // ---- Model natijasi
  if (inp.engine) {
    const rows = (["R", "L"] as const)
      .map((k) => [k, inp.engine!.breasts[k]] as const)
      .filter(([, b]) => b)
      .map(([k, b]) => `${k === "R" ? "O'ng" : "Chap"}: saraton ehtimoli ${(b!.cancerProbability * 100).toFixed(2)}% (${RISK_LABEL[riskOf(b!.cancerProbability)].toLowerCase()} xavf) · zichlik ACR ${b!.densityClass} · ansambl kelishuvi ${Math.round(agreementOf(b!) * 100)}%`);
    const acc = [
      `Model aniqligi — muallif (RSNA skrining test): AUC ${inp.engine.publishedAuc.toFixed(3)}; chegara 1.84% da sezgirlik 90.5%, o'ziga xoslik 84.8%.`,
      ...inp.modelEval.map(
        (e) => `Mahalliy tekshiruv — ${e.dataset.split(" —")[0]} (n=${e.n}, ${e.malignant} xavfli / ${e.negatives} ${e.negativeLabel}): AUC ${e.auc.toFixed(3)}${e.standard ? `; sezgirlik ${e.standard.sensitivity}%, o'ziga xoslik ${e.standard.specificity}%` : ""}.`,
      ),
    ].filter(Boolean);
    const lines = [...rows.flatMap((r) => wrap(r, font, 9, W - 2 * M - 20)), ...acc.flatMap((r) => wrap(r, font, 8, W - 2 * M - 20))];
    const boxH = 24 + lines.length * 12;
    ensure(boxH + 10);
    page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, color: rgb(243 / 255, 246 / 255, 250 / 255), borderColor: LINE, borderWidth: 0.8 });
    page.drawText(`AI model: ${inp.engine.model}`, { x: M + 10, y: y - 16, size: 9.5, font: bold, color: NAVY });
    let ly = y - 30;
    for (const [i, l] of lines.entries()) {
      page.drawText(l, { x: M + 10, y: ly, size: i < rows.length ? 9 : 8, font, color: i < rows.length ? NAVY : MUTED });
      ly -= 12;
    }
    y -= boxH + 24;
  }

  // ---- Xulosa matni (sarlavha qatori bandda — tashlab ketamiz)
  const body = inp.text.split("\n").slice(1).join("\n");
  for (const line of wrap(body, font, 10.5, W - 2 * M)) {
    ensure(15);
    if (/^(XULOSA|TAVSIYA):/.test(line) || /^(O'ng|Chap) ko'krak bezi:$/.test(line.trim())) {
      const [h, ...rest] = line.split(":");
      page.drawText(`${h}:`, { x: M, y, size: 10.5, font: bold, color: NAVY });
      if (rest.join(":").trim()) page.drawText(rest.join(":"), { x: M + bold.widthOfTextAtSize(`${h}:`, 10.5), y, size: 10.5, font, color: NAVY });
    } else {
      page.drawText(line, { x: M, y, size: 10.5, font, color: NAVY });
    }
    y -= 15;
  }

  // ---- Pastki qism (har sahifada)
  const disclaimer = "AI qoralamasi model va shifokor tomonidan tayyorlangan. AI tashxis qo'ymaydi; yakuniy xulosa uchun imzolagan shifokor javobgar.";
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.6, color: LINE });
    p.drawText(disclaimer, { x: M, y: 32, size: 7.5, font, color: MUTED });
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, { x: W - M - font.widthOfTextAtSize(n, 8), y: 20, size: 8, font, color: MUTED });
    if (!inp.approved) {
      p.drawText("QORALAMA", { x: 150, y: 330, size: 80, font: bold, color: rgb(0.88, 0.54, 0.07), opacity: 0.08, rotate: degrees(35) });
    }
  });
  return doc.save();
}
