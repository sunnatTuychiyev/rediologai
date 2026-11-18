import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAMMO_DIR } from "@/lib/imaging";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: { id: string; imageId: string } }) {
  const user = await apiUser("DOCTOR");
  if (!user) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  const img = await prisma.studyImage.findUnique({ where: { id: params.imageId }, include: { study: { include: { report: { select: { status: true } }, drafts: { select: { id: true }, take: 1 } } } } });
  if (!img || img.studyId !== params.id || img.study.doctorId !== user.id) return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  // Qoralama yaratilgandan keyin tasvirlar o'zgarmaydi — audit izchil bo'lsin.
  if (img.study.drafts.length || img.study.report) return NextResponse.json({ error: "Qoralama yaratilgan — tasvirni o'chirib bo'lmaydi" }, { status: 409 });
  await prisma.studyImage.delete({ where: { id: img.id } });
  // Boshqa tekshiruvda ishlatilmayotgan bo'lsa, fayllarni ham o'chiramiz
  const shared = await prisma.studyImage.count({ where: { file: img.file } });
  if (!shared) await Promise.all([img.file, img.aiFile].map((f) => fs.rm(path.join(MAMMO_DIR, f), { force: true })));
  return NextResponse.json({ ok: true });
}
