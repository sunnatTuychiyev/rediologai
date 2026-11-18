import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/utils";
import type { ReferenceFindings } from "@/lib/types";
import { PageHeader } from "@/components/app-shell";
import { CaseWizard, type WizardInitial } from "../../case-wizard";

export default async function EditCasePage({ params }: { params: { id: string } }) {
  const user = await requireUser("TEACHER");
  const c = await prisma.case.findFirst({
    where: { id: params.id, createdById: user.id },
    include: { images: { orderBy: { order: "asc" } }, regions: true },
  });
  if (!c) notFound();
  const urlById = new Map(c.images.map((i) => [i.id, i.url]));
  const initial: WizardInitial = {
    title: c.title,
    modality: c.modality as WizardInitial["modality"],
    bodyRegion: c.bodyRegion,
    difficulty: c.difficulty as WizardInitial["difficulty"],
    clinicalInfo: c.clinicalInfo,
    tags: parseJson<string[]>(c.tags, []),
    referenceReport: c.referenceReport,
    referenceFindings: parseJson<ReferenceFindings>(c.referenceFindings, { findings: [], impression: "", recommendations: "" }),
    images: c.images.map((i) => ({ url: i.url, label: i.label })),
    isPublished: c.isPublished,
    regions: c.regions.map((r) => ({ imageUrl: urlById.get(r.imageId)!, findingKey: r.findingKey, x: r.x, y: r.y, width: r.width, height: r.height })),
  };
  return (
    <div className="mx-auto max-w-6xl p-6 pb-0">
      <PageHeader title="Mashqni tahrirlash" description={c.title} />
      <CaseWizard caseId={c.id} initial={initial} />
    </div>
  );
}
