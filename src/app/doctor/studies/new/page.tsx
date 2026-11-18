import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { overallOf } from "@/lib/mammo-rules";
import { readPayload } from "@/lib/mammo-study";
import { StudyWizard } from "../study-wizard";

export const dynamic = "force-dynamic";

export default async function NewStudyPage() {
  const user = await requireUser("DOCTOR");
  const priors = await prisma.study.findMany({
    where: { doctorId: user.id, report: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { report: { select: { payload: true } } },
  });
  return (
    <StudyWizard
      priorStudies={priors.map((p) => ({ id: p.id, code: p.code, date: p.createdAt.toISOString().slice(0, 10), birads: overallOf(readPayload(p.report?.payload)) }))}
    />
  );
}
