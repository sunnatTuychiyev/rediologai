import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ImagingError, MAX_DICOM_BYTES, processUpload } from "@/lib/imaging";

export const runtime = "nodejs";
const MAX_IMAGES = 4;

/** Fayl nomidan proyeksiyani taxmin qiladi: "R_CC.png", "left-mlo.dcm", "mg-normal-lmlo.png". */
function guessFromName(name: string): { laterality: "R" | "L" | null; view: "CC" | "MLO" | null } {
  const n = name.toLowerCase();
  const m = /(?:^|[^a-z])(r|l|right|left|rt|lt)[\s_-]?(cc|mlo)(?:[^a-z]|$)/.exec(n);
  if (m) return { laterality: m[1].startsWith("r") ? "R" : "L", view: m[2] === "cc" ? "CC" : "MLO" };
  return { laterality: /right|o'ng|\bong\b/.test(n) ? "R" : /left|chap/.test(n) ? "L" : null, view: /mlo/.test(n) ? "MLO" : /\bcc\b/.test(n) ? "CC" : null };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await apiUser("DOCTOR");
  if (!user) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  const study = await prisma.study.findUnique({ where: { id: params.id }, include: { images: true, report: { select: { status: true } } } });
  if (!study || study.doctorId !== user.id) return NextResponse.json({ error: "Tekshiruv topilmadi" }, { status: 404 });
  if (study.report?.status === "APPROVED") return NextResponse.json({ error: "Tasdiqlangan tekshiruvga tasvir qo'shib bo'lmaydi" }, { status: 409 });
  if (study.images.length >= MAX_IMAGES) return NextResponse.json({ error: "Ko'pi bilan 4 ta proyeksiya" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fayl tanlanmagan" }, { status: 400 });
  if (file.size > MAX_DICOM_BYTES) return NextResponse.json({ error: `${file.name}: 50 MB dan katta` }, { status: 400 });

  try {
    const img = await processUpload(Buffer.from(await file.arrayBuffer()));
    const guess = guessFromName(file.name);
    const used = new Set(study.images.map((i) => `${i.laterality}-${i.view}`));
    const fallback = ["R-MLO", "L-MLO", "R-CC", "L-CC"].find((v) => !used.has(v)) ?? "R-CC";
    const laterality = img.laterality ?? guess.laterality ?? (fallback[0] as "R" | "L");
    const view = img.view ?? guess.view ?? (fallback.slice(2) as "CC" | "MLO");
    // Asl nom faqat kengaytmasiz va qisqartirilgan holda saqlanadi (anonim demo fayllarni tanish uchun).
    const originalName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const created = await prisma.studyImage.create({
      data: {
        studyId: study.id,
        file: img.file,
        aiFile: img.aiFile,
        originalName,
        sourceFormat: img.sourceFormat,
        laterality,
        view,
        width: img.width,
        height: img.height,
        pixelSpacing: img.pixelSpacing,
        order: study.images.length,
      },
    });
    await logAudit(user.id, "IMAGE_UPLOADED", study.id, { imageId: created.id, format: img.sourceFormat, width: img.width, height: img.height, laterality, view });
    await logAudit(user.id, "ANONYMIZED", study.id, {
      imageId: created.id,
      removed: img.removedTags,
      kept: Object.keys(img.keptTags),
      originalStored: false,
      warnings: img.warnings,
    });
    if (study.status === "ERROR") await prisma.study.update({ where: { id: study.id }, data: { status: "UPLOADED", error: null } });
    return NextResponse.json({
      image: {
        id: created.id,
        url: `/api/doctor/files/${created.file}`,
        laterality,
        view,
        sourceFormat: img.sourceFormat,
        width: img.width,
        height: img.height,
        pixelSpacing: img.pixelSpacing,
        fromDicom: Boolean(img.laterality || img.view),
      },
      removedTags: img.removedTags,
      warnings: img.warnings,
    });
  } catch (err) {
    if (err instanceof ImagingError) return NextResponse.json({ error: `${file.name}: ${err.message}` }, { status: 400 });
    console.error("[mammo-upload]", err);
    return NextResponse.json({ error: `${file.name}: tasvirni qayta ishlab bo'lmadi` }, { status: 400 });
  }
}
