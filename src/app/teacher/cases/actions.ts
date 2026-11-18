"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractFindings } from "@/lib/ai";
import { caseInputSchema, type CaseInput } from "@/lib/types";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function extractReferenceFindings(referenceReport: string): Promise<Result<Awaited<ReturnType<typeof extractFindings>>>> {
  await requireUser("TEACHER");
  const parsed = z.string().trim().min(20, "Shifokor xulosasi juda qisqa").max(10000).safeParse(referenceReport);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    return { ok: true, data: await extractFindings(parsed.data) };
  } catch (err) {
    console.error("[extract] failed", err);
    return { ok: false, error: "AI javob bermadi. Qayta urinib ko'ring yoki topilmalarni qo'lda kiriting." };
  }
}

const regionSchema = z.object({
  imageUrl: z.string(),
  findingKey: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type RegionInput = z.infer<typeof regionSchema>;

export async function saveCase(id: string | null, input: CaseInput, regions: RegionInput[]): Promise<Result<{ id: string }>> {
  const user = await requireUser("TEACHER");
  const parsed = caseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" };
  const regs = z.array(regionSchema).max(200).safeParse(regions);
  if (!regs.success) return { ok: false, error: "Belgilangan sohalar noto'g'ri" };
  const d = parsed.data;
  if (d.isPublished && d.referenceFindings.findings.length === 0) return { ok: false, error: "Nashr qilish uchun kamida bitta topilma kerak" };

  const data = {
    title: d.title,
    modality: d.modality,
    bodyRegion: d.bodyRegion,
    difficulty: d.difficulty,
    clinicalInfo: d.clinicalInfo,
    referenceReport: d.referenceReport,
    referenceFindings: JSON.stringify(d.referenceFindings),
    tags: JSON.stringify(Array.from(new Set(d.tags.map((t) => t.toLowerCase())))),
    isPublished: d.isPublished,
  };

  const caseId = await prisma.$transaction(async (tx) => {
    let cid: string;
    // Haqiqiy KT (DICOM) dan kelgan piksel o'lchami tahrirlashda yo'qolmasin
    const spacingByUrl = new Map<string, number | null>();
    if (id) {
      for (const im of await tx.caseImage.findMany({ where: { caseId: id }, select: { url: true, pixelSpacing: true } })) spacingByUrl.set(im.url, im.pixelSpacing);
    }
    if (id) {
      const existing = await tx.case.findFirst({ where: { id, createdById: user.id } });
      if (!existing) throw new Error("not found");
      await tx.case.update({ where: { id }, data });
      await tx.findingRegion.deleteMany({ where: { caseId: id } });
      await tx.caseImage.deleteMany({ where: { caseId: id } });
      cid = id;
    } else {
      cid = (await tx.case.create({ data: { ...data, createdById: user.id } })).id;
    }
    const urlToId = new Map<string, string>();
    for (const [i, img] of d.images.entries()) {
      const created = await tx.caseImage.create({ data: { caseId: cid, url: img.url, order: i, label: img.label || null, pixelSpacing: spacingByUrl.get(img.url) ?? null } });
      urlToId.set(img.url, created.id);
    }
    const keys = new Set(d.referenceFindings.findings.map((f) => f.key));
    for (const r of regs.data) {
      const imageId = urlToId.get(r.imageUrl);
      if (!imageId || !keys.has(r.findingKey)) continue;
      await tx.findingRegion.create({ data: { caseId: cid, imageId, findingKey: r.findingKey, x: r.x, y: r.y, width: r.width, height: r.height } });
    }
    return cid;
  }).catch(() => null);

  if (!caseId) return { ok: false, error: "Saqlashda xatolik" };
  revalidatePath("/teacher/cases");
  revalidatePath("/student/cases");
  return { ok: true, data: { id: caseId } };
}

async function ownCase(id: string) {
  const user = await requireUser("TEACHER");
  const c = await prisma.case.findFirst({ where: { id, createdById: user.id }, include: { images: true, regions: true } });
  return { user, c };
}

export async function togglePublish(id: string): Promise<Result> {
  const { c } = await ownCase(id);
  if (!c) return { ok: false, error: "Topilmadi" };
  await prisma.case.update({ where: { id }, data: { isPublished: !c.isPublished } });
  revalidatePath("/teacher/cases");
  return { ok: true };
}

export async function deleteCase(id: string): Promise<Result> {
  const { c } = await ownCase(id);
  if (!c) return { ok: false, error: "Topilmadi" };
  await prisma.case.delete({ where: { id } });
  revalidatePath("/teacher/cases");
  return { ok: true };
}

export async function duplicateCase(id: string): Promise<Result<{ id: string }>> {
  const { user, c } = await ownCase(id);
  if (!c) return { ok: false, error: "Topilmadi" };
  const copy = await prisma.case.create({
    data: {
      title: `${c.title} (nusxa)`,
      modality: c.modality,
      bodyRegion: c.bodyRegion,
      difficulty: c.difficulty,
      clinicalInfo: c.clinicalInfo,
      referenceReport: c.referenceReport,
      referenceFindings: c.referenceFindings,
      tags: c.tags,
      isPublished: false,
      createdById: user.id,
      images: { create: c.images.map((i) => ({ url: i.url, order: i.order, label: i.label, pixelSpacing: i.pixelSpacing })) },
    },
    include: { images: true },
  });
  const map = new Map(c.images.map((i) => [i.id, copy.images.find((n) => n.order === i.order)?.id]));
  for (const r of c.regions) {
    const imageId = map.get(r.imageId);
    if (imageId) await prisma.findingRegion.create({ data: { caseId: copy.id, imageId, findingKey: r.findingKey, x: r.x, y: r.y, width: r.width, height: r.height } });
  }
  revalidatePath("/teacher/cases");
  return { ok: true, data: { id: copy.id } };
}
