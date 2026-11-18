import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionInputSchema } from "@/lib/types";
import { runEvaluation } from "@/lib/evaluate";
import { parseJson } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await apiUser("STUDENT");
  if (!user) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });

  const parsed = submissionInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" }, { status: 400 });
  const { caseId, assignmentId, reportText, durationSec } = parsed.data;

  const c = await prisma.case.findFirst({ where: { id: caseId, isPublished: true }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "Mashq topilmadi" }, { status: 404 });

  if (assignmentId) {
    const [a, me] = await Promise.all([
      prisma.assignment.findUnique({ where: { id: assignmentId } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { groupId: true } }),
    ]);
    const now = new Date();
    if (!a || a.groupId !== me?.groupId || !parseJson<string[]>(a.caseIds, []).includes(caseId)) {
      return NextResponse.json({ error: "Topshiriq topilmadi" }, { status: 404 });
    }
    if (now < a.startsAt || now > a.endsAt) return NextResponse.json({ error: "Topshiriq muddati tugagan" }, { status: 400 });
    if (a.mode === "EXAM") {
      const existing = await prisma.submission.findFirst({ where: { assignmentId, caseId, studentId: user.id } });
      if (existing) return NextResponse.json({ error: "Imtihonda faqat bitta urinish mumkin", id: existing.id }, { status: 409 });
    }
  }

  const sub = await prisma.submission.create({
    data: { studentId: user.id, caseId, assignmentId: assignmentId ?? null, reportText, durationSec, status: "PENDING" },
  });
  const done = await runEvaluation(sub.id);
  return NextResponse.json({ id: sub.id, status: done?.status ?? "ERROR" });
}
