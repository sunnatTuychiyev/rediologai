/**
 * prisma/real-cases/mammo/*.json manifestlaridagi haqiqiy mammogrammalarni doctor@demo.uz hisobiga
 * "Qoralama kutilmoqda" holatidagi tekshiruv sifatida yuklaydi (AI qoralamasini shifokor o'zi so'raydi).
 *
 *   npm run import:mammo
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { processUpload } from "../../src/lib/imaging";
import { ROOT, loadManifests } from "./manifest";

const prisma = new PrismaClient();

async function main() {
  const doctor = await prisma.user.findFirst({ where: { email: "doctor@demo.uz" } });
  if (!doctor) throw new Error("doctor@demo.uz topilmadi — avval npx prisma db seed");
  const cases = loadManifests();
  if (!cases.length) return console.log("Manifest yo'q: prisma/real-cases/mammo/*.json (scripts/mammo/build_cases.py)");
  let n = 0;
  for (const c of cases) {
    const tag = `Manba: ${c.source} (${c.id})`;
    if (await prisma.study.findFirst({ where: { doctorId: doctor.id, clinicalInfo: { contains: c.id } } })) continue;
    const year = new Date().getFullYear();
    const last = await prisma.study.findFirst({ where: { code: { startsWith: `MG-${year}-` } }, orderBy: { code: "desc" } });
    const code = `MG-${year}-${String((last ? parseInt(last.code.slice(8), 10) : 0) + 1).padStart(4, "0")}`;
    const images = [];
    for (const [i, v] of c.views.entries()) {
      const img = await processUpload(fs.readFileSync(path.join(ROOT, c.imageDir, v.file)));
      images.push({ file: img.file, aiFile: img.aiFile, originalName: v.file, sourceFormat: img.sourceFormat, laterality: v.laterality, view: v.view, width: img.width, height: img.height, pixelSpacing: img.pixelSpacing, order: i });
    }
    const study = await prisma.study.create({ data: { code, doctorId: doctor.id, indication: "SCREENING", clinicalInfo: tag, images: { create: images } } });
    await prisma.auditLog.create({ data: { userId: doctor.id, studyId: study.id, action: "STUDY_CREATED", details: JSON.stringify({ code, import: c.source }) } });
    n++;
    console.log("✓", code, c.id);
  }
  console.log(`Tayyor: ${n} ta yangi tekshiruv`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
