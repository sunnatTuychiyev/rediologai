import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/utils";
import { ExerciseClient } from "./exercise-client";

export default async function ExercisePage({ params, searchParams }: { params: { id: string }; searchParams: { assignment?: string } }) {
  const user = await requireUser("STUDENT");
  // SECURITY: only safe fields are selected. referenceReport / referenceFindings / title never reach the client here.
  const c = await prisma.case.findFirst({
    where: { id: params.id, isPublished: true },
    select: {
      id: true, modality: true, bodyRegion: true, difficulty: true, clinicalInfo: true,
      images: { select: { id: true, url: true, label: true, pixelSpacing: true }, orderBy: { order: "asc" } },
    },
  });
  if (!c) notFound();

  let assignment: { id: string; title: string; mode: string; timeLimitMin: number | null; existingId: string | null } | null = null;
  if (searchParams.assignment) {
    const [a, me] = await Promise.all([
      prisma.assignment.findUnique({ where: { id: searchParams.assignment } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { groupId: true } }),
    ]);
    if (a && a.groupId === me?.groupId && parseJson<string[]>(a.caseIds, []).includes(c.id)) {
      const existing = a.mode === "EXAM" ? await prisma.submission.findFirst({ where: { assignmentId: a.id, caseId: c.id, studentId: user.id }, select: { id: true } }) : null;
      assignment = { id: a.id, title: a.title, mode: a.mode, timeLimitMin: a.timeLimitMin, existingId: existing?.id ?? null };
    }
  }

  // Next case suggestion for "Keyingi mashq" flow is handled on the result page.
  return <ExerciseClient data={c} assignment={assignment} />;
}
