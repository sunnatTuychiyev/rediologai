import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { avg, parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { CasesTable } from "./cases-table";

export default async function TeacherCases() {
  const user = await requireUser("TEACHER");
  const cases = await prisma.case.findMany({
    where: { createdById: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, modality: true, bodyRegion: true, difficulty: true, tags: true, isPublished: true, createdAt: true,
      images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
      submissions: { where: { status: "DONE" }, select: { score: true } },
    },
  });
  const rows = cases.map((c) => ({
    id: c.id, title: c.title, modality: c.modality, bodyRegion: c.bodyRegion, difficulty: c.difficulty,
    tags: parseJson<string[]>(c.tags, []), isPublished: c.isPublished, thumb: c.images[0]?.url ?? null,
    attempts: c.submissions.length, avgScore: c.submissions.length ? avg(c.submissions.map((s) => s.score ?? 0)) : null,
  }));
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Mashqlar"
        description="Rentgen, KT va MRT mashqlarini boshqarish"
        actions={<Link href="/teacher/cases/new" className={buttonVariants()}><Plus /> Yangi mashq qo&apos;shish</Link>}
      />
      <CasesTable rows={rows} />
    </div>
  );
}
