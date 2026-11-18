/**
 * Qoralama quvurini yorliqli holatlarda baholaydi va model kartasi uchun natija yozadi.
 *
 *   npm run eval:mammo              # prisma/real-cases/mammo/*.json (masalan CBIS-DDSM)
 *   npm run eval:mammo -- --demo    # sintetik demo to'plami (quvurni tekshirish uchun, klinik ma'lumot emas)
 *   npm run eval:mammo -- --limit 20
 *
 * Ko'rsatkichlar: BI-RADS kategoriya mosligi (har tomon), "shubhali" (BI-RADS ≥ 4A) uchun sezgirlik/o'ziga xoslik,
 * zichlik (ACR) mosligi, bloklangan ulush, median kechikish.
 * Natija: storage/eval/mammo-latest.json — model kartasi shu fayldan o'qiydi.
 * ANTHROPIC_API_KEY bo'lmasa — oflayn shablon baholanadi (natija "OFFLINE" deb belgilanadi).
 */
import fs from "node:fs";
import path from "node:path";
import { processUpload, MAMMO_DIR } from "../../src/lib/imaging";
import { generateMammoDraft } from "../../src/lib/mammo-ai";
import { biradsSeverity, gateReasons, viewLabel } from "../../src/lib/mammo-rules";
import type { ViewLabel } from "../../src/lib/mammo-types";
import { ROOT, demoManifest, loadManifests } from "./manifest";

const args = process.argv.slice(2);
const demo = args.includes("--demo");
const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity;
const suspicious = (b: string) => biradsSeverity(b) >= biradsSeverity("4A");

type Row = { id: string; truth: { right: string; left: string }; pred: { right: string; left: string }; density: string[]; gated: boolean; isMammogram: boolean; predMammogram: boolean; latencyMs: number; source: string; model: string };
type ErrRow = { id: string; error: string };

async function main() {
  const cases = (demo ? demoManifest() : loadManifests()).slice(0, limit);
  if (!cases.length) throw new Error("Holat yo'q. Avval scripts/mammo/build_cases.py ni ishga tushiring yoki --demo bering.");

  const rows: (Row | ErrRow)[] = [];
  for (const c of cases) {
    const created: string[] = [];
    try {
      const images = [];
      for (const v of c.views) {
        const img = await processUpload(fs.readFileSync(path.join(ROOT, c.imageDir, v.file)));
        created.push(img.file, img.aiFile);
        const label = viewLabel(v.laterality, v.view) as ViewLabel;
        images.push({ label, aiFile: img.aiFile, originalName: v.file });
      }
      const res = await generateMammoDraft({ patientAge: null, indication: "SCREENING", clinicalInfo: "", prior: null, images });
      const gated = gateReasons(res.draft).length > 0;
      const pred = { right: res.draft.breasts.right.biradsSuggestion, left: res.draft.breasts.left.biradsSuggestion };
      rows.push({ id: c.id, truth: c.birads, pred, density: [c.density, res.draft.breastComposition], gated, isMammogram: c.isMammogram ?? true, predMammogram: res.draft.imageCheck.isMammogram, latencyMs: res.latencyMs, source: res.source, model: res.model });
      console.log(`${c.id.padEnd(28)} truth R${c.birads.right}/L${c.birads.left}  pred R${pred.right}/L${pred.left}  ACR ${c.density}/${res.draft.breastComposition}  ${gated ? "BLOKLANDI" : ""}  ${(res.latencyMs / 1000).toFixed(1)}s`);
    } catch (e) {
      console.error(`${c.id}: xatolik —`, e instanceof Error ? e.message : e);
      rows.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
    } finally {
      for (const f of created) fs.rmSync(path.join(MAMMO_DIR, f), { force: true });
    }
  }

  const ok = rows.filter((r): r is Row => !("error" in r));
  const mammo = ok.filter((r) => r.isMammogram && !r.gated);
  const sides = mammo.flatMap((r) => (["right", "left"] as const).map((s) => ({ t: r.truth[s], p: r.pred[s] })));
  const tp = sides.filter((x) => suspicious(x.t) && suspicious(x.p)).length;
  const fn = sides.filter((x) => suspicious(x.t) && !suspicious(x.p)).length;
  const tn = sides.filter((x) => !suspicious(x.t) && !suspicious(x.p)).length;
  const fp = sides.filter((x) => !suspicious(x.t) && suspicious(x.p)).length;
  const lat = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const summary = {
    createdAt: new Date().toISOString(),
    dataset: demo ? "Sintetik demo (quvur sinovi, klinik emas)" : Array.from(new Set(cases.map((c) => c.source))).join(", "),
    source: ok[0]?.source ?? "-",
    model: ok[0]?.model ?? "-",
    cases: cases.length,
    errors: rows.length - ok.length,
    evaluatedSides: sides.length,
    biradsExactAgreementPct: pct(sides.filter((x) => x.t === x.p).length, sides.length),
    suspiciousSensitivityPct: pct(tp, tp + fn),
    suspiciousSpecificityPct: pct(tn, tn + fp),
    confusion: { tp, fn, tn, fp },
    densityAgreementPct: pct(mammo.filter((r) => r.density[0] === r.density[1]).length, mammo.length),
    gatedPct: pct(ok.filter((r) => r.gated).length, ok.length),
    nonMammogramRejectedPct: pct(ok.filter((r) => !r.isMammogram && (r.gated || !r.predMammogram)).length, ok.filter((r) => !r.isMammogram).length),
    medianLatencyMs: lat.length ? lat[Math.floor(lat.length / 2)] : null,
    rows,
  };
  const outDir = path.join(ROOT, "storage", "eval");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "mammo-latest.json"), JSON.stringify(summary, null, 1));
  const { rows: _rows, ...print } = summary;
  console.log("\n" + JSON.stringify(print, null, 1));
  console.log(`\nSaqlandi: storage/eval/mammo-latest.json (model kartasida ko'rinadi)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
