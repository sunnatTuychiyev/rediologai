import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerInputSchema } from "@/lib/types";

export async function POST(req: Request) {
  const parsed = registerInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" }, { status: 400 });
  const { name, email, password, groupCode } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "Bu email allaqachon ro'yxatdan o'tgan" }, { status: 409 });
  }
  let groupId: string | null = null;
  if (groupCode) {
    const group = await prisma.group.findFirst({ where: { code: groupCode.toUpperCase() } });
    if (!group) return NextResponse.json({ error: "Guruh kodi topilmadi" }, { status: 404 });
    groupId = group.id;
  }
  await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10), role: "STUDENT", groupId },
  });
  return NextResponse.json({ ok: true });
}
