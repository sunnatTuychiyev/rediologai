"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Result = { ok: true } | { ok: false; error: string };

function makeCode(name: string) {
  const base = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "GRP";
  return `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createGroup(name: string): Promise<Result> {
  const user = await requireUser("TEACHER");
  const p = z.string().trim().min(2, "Guruh nomini kiriting").max(100).safeParse(name);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await prisma.group.create({ data: { name: p.data, code: makeCode(p.data), teacherId: user.id } });
  revalidatePath("/teacher/groups");
  return { ok: true };
}

export async function addStudentToGroup(groupId: string, email: string): Promise<Result> {
  const user = await requireUser("TEACHER");
  const p = z.string().trim().toLowerCase().email("Email noto'g'ri").safeParse(email);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const group = await prisma.group.findFirst({ where: { id: groupId, teacherId: user.id } });
  if (!group) return { ok: false, error: "Guruh topilmadi" };
  const student = await prisma.user.findUnique({ where: { email: p.data } });
  if (!student || student.role !== "STUDENT") return { ok: false, error: "Bu email bilan talaba topilmadi (avval ro'yxatdan o'tishi kerak)" };
  await prisma.user.update({ where: { id: student.id }, data: { groupId } });
  revalidatePath("/teacher/groups");
  return { ok: true };
}

export async function removeStudentFromGroup(studentId: string): Promise<Result> {
  const user = await requireUser("TEACHER");
  const s = await prisma.user.findFirst({ where: { id: studentId, group: { teacherId: user.id } } });
  if (!s) return { ok: false, error: "Topilmadi" };
  await prisma.user.update({ where: { id: studentId }, data: { groupId: null } });
  revalidatePath("/teacher/groups");
  return { ok: true };
}

const assignmentSchema = z
  .object({
    title: z.string().trim().min(2, "Nomini kiriting").max(200),
    groupId: z.string().min(1, "Guruhni tanlang"),
    caseIds: z.array(z.string()).min(1, "Kamida bitta mashq tanlang").max(50),
    mode: z.enum(["PRACTICE", "EXAM"]),
    timeLimitMin: z.number().int().min(1).max(600).nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    showFeedback: z.boolean(),
  })
  .refine((d) => d.endsAt > d.startsAt, { message: "Tugash vaqti boshlanishdan keyin bo'lishi kerak" });

export async function createAssignment(input: z.input<typeof assignmentSchema>): Promise<Result> {
  const user = await requireUser("TEACHER");
  const p = assignmentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const group = await prisma.group.findFirst({ where: { id: p.data.groupId, teacherId: user.id } });
  if (!group) return { ok: false, error: "Guruh topilmadi" };
  const owned = await prisma.case.count({ where: { id: { in: p.data.caseIds }, createdById: user.id, isPublished: true } });
  if (owned !== p.data.caseIds.length) return { ok: false, error: "Faqat nashr qilingan mashqlarni tanlang" };
  await prisma.assignment.create({
    data: { ...p.data, caseIds: JSON.stringify(p.data.caseIds), showFeedback: p.data.mode === "PRACTICE" ? true : p.data.showFeedback },
  });
  revalidatePath("/teacher/assignments");
  return { ok: true };
}

export async function deleteAssignment(id: string): Promise<Result> {
  const user = await requireUser("TEACHER");
  const a = await prisma.assignment.findFirst({ where: { id, group: { teacherId: user.id } } });
  if (!a) return { ok: false, error: "Topilmadi" };
  await prisma.assignment.delete({ where: { id } });
  revalidatePath("/teacher/assignments");
  return { ok: true };
}
