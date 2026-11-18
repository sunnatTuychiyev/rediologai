/**
 * CMMD (haqiqiy, biopsiya bilan tasdiqlangan) holatlarni shifokor demo hisobiga yuklaydi va
 * ML xizmati ishlayotgan bo'lsa — darhol model qoralamasini yaratadi.
 * Shuningdek, bir nechta asl DICOM faylni public/demo/mammo/cmmd/ ga qo'yadi (yuklash ustasidagi demo uchun).
 *
 *   python ml/prepare_cmmd.py           # avval: .cache/cmmd/manifest.json + png
 *   npm run ml:serve                    # boshqa terminalda
 *   npm run import:cmmd -- --count 8
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { processUpload } from "../../src/lib/imaging";
import { runMammoDraft } from "../../src/lib/mammo-study";
import { engineHealth } from "../../src/lib/mammo-model";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "cmmd");
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const count = Number(args[args.indexOf("--count") + 1]) || 8;
const redraft = args.includes("--redraft");

type Case = { id: string; patientId: string; laterality: "R" | "L"; label: string; abnormality: string; age: number; pixelSpacing: number | null; views: { file: string; laterality: "R" | "L"; view: string }[] };

async function main() {
  const doctor = await prisma.user.findFirst({ where: { email: "doctor@demo.uz" } });
  if (!doctor) throw new Error("doctor@demo.uz topilmadi — avval npx prisma db seed");
  const all = JSON.parse(fs.readFileSync(path.join(CACHE, "manifest.json"), "utf8")) as Case[];
  const full = all.filter((c) => c.views.some((v) => v.view === "CC") && c.views.some((v) => v.view === "MLO"));
  // Teng: yarmi xavfli, yarmi yaxshi sifatli (har xil arxivlardan)
  const mal = full.filter((c) => c.label === "Malignant");
  const ben = full.filter((c) => c.label === "Benign");
  const pick = (arr: Case[], n: number) => Array.from({ length: Math.min(n, arr.length) }, (_, i) => arr[Math.floor((i * arr.length) / n)]);
  const chosen = [...pick(mal, Math.ceil(count / 2)), ...pick(ben, Math.floor(count / 2))];

  const health = await engineHealth();
  if (!health.ok) console.warn("⚠ ML xizmati ishlamayapti — tekshiruvlar qoralamasiz yuklanadi (npm run ml:serve).");

  for (const c of chosen) {
    const existing = await prisma.study.findFirst({ where: { doctorId: doctor.id, clinicalInfo: { contains: c.patientId } }, include: { report: true } });
    if (existing) {
      if (redraft && health.ok && existing.report?.status !== "APPROVED") {
        const r = await runMammoDraft(existing.id, doctor.id);
        console.log("↻", existing.code, c.id, c.label, r.ok ? "qayta yaratildi" : r.error);
      } else console.log("• bor:", existing.code, c.id);
      continue;
    }
    const year = new Date().getFullYear();
    const last = await prisma.study.findFirst({ where: { code: { startsWith: `MG-${year}-` } }, orderBy: { code: "desc" } });
    const code = `MG-${year}-${String((last ? parseInt(last.code.slice(8), 10) : 0) + 1).padStart(4, "0")}`;
    const images = [];
    for (const [i, v] of c.views.filter((v) => v.view !== "OTHER").entries()) {
      const img = await processUpload(fs.readFileSync(path.join(CACHE, "png", v.file)));
      images.push({ file: img.file, aiFile: img.aiFile, originalName: v.file, sourceFormat: "DICOM", laterality: v.laterality, view: v.view, width: img.width, height: img.height, pixelSpacing: c.pixelSpacing, order: i });
    }
    const study = await prisma.study.create({
      data: {
        code,
        doctorId: doctor.id,
        patientAge: c.age >= 18 ? c.age : null,
        indication: "DIAGNOSTIC",
        clinicalInfo: `Haqiqiy tasvir: CMMD (TCIA, CC BY 4.0), bemor ${c.patientId}. ${c.laterality === "R" ? "O'ng" : "Chap"} ko'krak bezi tekshirilgan.`,
        groundTruth: JSON.stringify({ label: c.label, abnormality: c.abnormality, source: "CMMD, biopsiya" }),
        images: { create: images },
      },
    });
    await prisma.auditLog.create({ data: { userId: doctor.id, studyId: study.id, action: "STUDY_CREATED", details: JSON.stringify({ code, import: "CMMD" }) } });
    let note = "";
    if (health.ok) {
      const r = await runMammoDraft(study.id, doctor.id);
      note = r.ok ? (r.gated ? "qoralama (bloklandi)" : "qoralama tayyor") : `xato: ${r.error}`;
    }
    console.log("✓", code, c.id, c.label, note);
  }

  // Yuklash ustasidagi "haqiqiy DICOM" demo: 1 xavfli + 1 yaxshi sifatli bemorning asl DICOM lari
  const demoDir = path.join(ROOT, "public", "demo", "mammo", "cmmd");
  fs.mkdirSync(demoDir, { recursive: true });
  const index: { title: string; files: string[]; clinicalInfo: string; age: number }[] = [];
  const dcmDir = path.join(CACHE, "demo-dcm");
  if (fs.existsSync(dcmDir)) {
    for (const f of fs.readdirSync(dcmDir).filter((x) => x.endsWith(".dcm"))) fs.copyFileSync(path.join(dcmDir, f), path.join(demoDir, f));
    const groups = new Map<string, string[]>();
    for (const f of fs.readdirSync(demoDir).filter((x) => x.endsWith(".dcm"))) {
      const key = f.split("_")[0];
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    for (const [key, files] of groups) {
      const c = all.find((x) => `cmmd-${x.patientId}`.toLowerCase() === key);
      index.push({ title: `Haqiqiy DICOM: ${c?.patientId ?? key}`, files: files.sort(), clinicalInfo: `CMMD (TCIA, CC BY 4.0) bemor ${c?.patientId ?? key}.`, age: c?.age ?? 50 });
    }
    fs.writeFileSync(path.join(demoDir, "index.json"), JSON.stringify(index, null, 1));
    console.log(`Demo DICOM: ${index.length} ta bemor -> public/demo/mammo/cmmd/`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
