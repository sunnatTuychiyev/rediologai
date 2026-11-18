import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runEvaluation } from "@/lib/evaluate";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await apiUser("STUDENT");
  if (!user) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  const sub = await prisma.submission.findFirst({ where: { id: params.id, studentId: user.id } });
  if (!sub) return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  if (sub.status === "DONE") return NextResponse.json({ id: sub.id, status: "DONE" });
  await prisma.submission.update({ where: { id: sub.id }, data: { status: "PENDING" } });
  const done = await runEvaluation(sub.id);
  return NextResponse.json({ id: sub.id, status: done?.status ?? "ERROR" });
}
