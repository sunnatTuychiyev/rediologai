import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runMammoDraft } from "@/lib/mammo-study";

export const runtime = "nodejs";
export const maxDuration = 150;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await apiUser("DOCTOR");
  if (!user) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  const study = await prisma.study.findUnique({ where: { id: params.id }, include: { report: { select: { status: true } }, _count: { select: { images: true } } } });
  if (!study || study.doctorId !== user.id) return NextResponse.json({ error: "Tekshiruv topilmadi" }, { status: 404 });
  if (study.report?.status === "APPROVED") return NextResponse.json({ error: "Xulosa allaqachon tasdiqlangan" }, { status: 409 });
  if (study.status === "DRAFTING" && Date.now() - study.updatedAt.getTime() < 120_000) return NextResponse.json({ error: "Qoralama hozir yaratilmoqda" }, { status: 409 });
  if (!study._count.images) return NextResponse.json({ error: "Avval tasvir yuklang" }, { status: 400 });
  const res = await runMammoDraft(study.id, user.id);
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
