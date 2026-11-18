/**
 * Haqiqiy KT holatlarini (prisma/real-cases/*.json) bazaga yozadi.
 * JSON fayllar scripts/lidc/build_cases.py (va keyinroq CT-RATE skripti) tomonidan yaratiladi.
 *
 *   npx tsx prisma/import-real-cases.ts          # yangi holatlarni qo'shadi (bor bo'lsa o'tkazib yuboradi)
 *   npx tsx prisma/import-real-cases.ts --update # bor holatlarning matni/rasmlarini yangilaydi (javoblar saqlanadi)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { referenceFindingsSchema } from "../src/lib/types";

type RealCase = {
  source: string;
  sourceId: string;
  title: string;
  modality: "XRAY" | "CT" | "MRI";
  bodyRegion: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  clinicalInfo: string;
  tags: string[];
  referenceReport: string;
  referenceFindings: unknown;
  images: { url: string; label?: string | null; pixelSpacing?: number | null }[];
  regions: { findingKey: string; slice: number; x: number; y: number; width: number; height: number }[];
};

const DIR = path.join(__dirname, "real-cases");

export async function importRealCases(prisma: PrismaClient, opts: { update?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  if (!existsSync(DIR)) return 0;
  const teacher = (await prisma.user.findFirst({ where: { email: "teacher@demo.uz" } })) ?? (await prisma.user.findFirst({ where: { role: "TEACHER" } }));
  if (!teacher) throw new Error("O'qituvchi topilmadi — avval seed qiling");

  let n = 0;
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
    const cases = JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as RealCase[];
    for (const c of cases) {
      const findings = referenceFindingsSchema.parse(c.referenceFindings);
      const existing = await prisma.case.findFirst({ where: { title: c.title, createdById: teacher.id } });
      if (existing && !opts.update) {
        log(`  bor: ${c.title}`);
        continue;
      }
      const data = {
        title: c.title,
        modality: c.modality,
        bodyRegion: c.bodyRegion,
        difficulty: c.difficulty,
        clinicalInfo: c.clinicalInfo,
        referenceReport: c.referenceReport,
        referenceFindings: JSON.stringify(findings),
        tags: JSON.stringify(c.tags.map((t) => t.toLowerCase())),
        isPublished: true,
      };
      await prisma.$transaction(async (tx) => {
        let id: string;
        if (existing) {
          id = existing.id;
          await tx.case.update({ where: { id }, data });
          await tx.findingRegion.deleteMany({ where: { caseId: id } });
          await tx.caseImage.deleteMany({ where: { caseId: id } });
        } else {
          id = (await tx.case.create({ data: { ...data, createdById: teacher.id } })).id;
        }
        await tx.caseImage.createMany({
          data: c.images.map((im, i) => ({ caseId: id, url: im.url, order: i, label: im.label ?? null, pixelSpacing: im.pixelSpacing ?? null })),
        });
        const imgs = await tx.caseImage.findMany({ where: { caseId: id }, select: { id: true, order: true } });
        const byOrder = new Map(imgs.map((i) => [i.order, i.id]));
        const keys = new Set(findings.findings.map((f) => f.key));
        await tx.findingRegion.createMany({
          data: c.regions
            .filter((r) => byOrder.has(r.slice) && keys.has(r.findingKey))
            .map((r) => ({ caseId: id, imageId: byOrder.get(r.slice)!, findingKey: r.findingKey, x: r.x, y: r.y, width: r.width, height: r.height })),
        });
      }, { timeout: 60_000 });
      n++;
      log(`  ${existing ? "yangilandi" : "qo'shildi"}: ${c.title} (${c.images.length} kesim)`);
    }
  }
  return n;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  importRealCases(prisma, { update: process.argv.includes("--update") })
    .then((n) => console.log(`Tayyor: ${n} ta holat`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
