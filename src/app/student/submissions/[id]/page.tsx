import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { feedbackHidden, loadSubmission } from "@/lib/result";
import { formatDate } from "@/lib/utils";
import { ResultView } from "@/components/result-view";
import { PendingResult } from "@/components/pending-result";
import { buttonVariants } from "@/components/ui/button";

export default async function StudentResultPage({ params }: { params: { id: string } }) {
  const user = await requireUser("STUDENT");
  const data = await loadSubmission(params.id);
  if (!data || data.sub.studentId !== user.id) notFound(); // students see only their own submissions
  const { sub, evaluation, regions } = data;

  if (feedbackHidden(sub.assignment)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <p className="text-lg font-semibold">Javobingiz qabul qilindi</p>
          <p className="mt-2 text-sm text-muted-foreground">Natijalar imtihon tugaganidan so&apos;ng ({formatDate(sub.assignment!.endsAt)}) ko&apos;rsatiladi.</p>
          <Link href="/student" className={buttonVariants({ className: "mt-6" })}>Bosh sahifa</Link>
        </div>
      </div>
    );
  }

  if (sub.status !== "DONE" || !evaluation) return <PendingResult id={sub.id} status={sub.status} canRetry />;

  // Next case: first published case not yet attempted, else the next one in order.
  const [all, done] = await Promise.all([
    prisma.case.findMany({ where: { isPublished: true }, select: { id: true }, orderBy: { createdAt: "asc" } }),
    prisma.submission.findMany({ where: { studentId: user.id }, select: { caseId: true }, distinct: ["caseId"] }),
  ]);
  const doneSet = new Set(done.map((d) => d.caseId));
  const idx = all.findIndex((c) => c.id === sub.caseId);
  const next = all.find((c) => !doneSet.has(c.id)) ?? all[(idx + 1) % all.length];

  return (
    <ResultView
      submission={{ ...sub, score: sub.score ?? 0 }}
      evaluation={evaluation}
      caseData={sub.case}
      regions={regions}
      actions={{
        retryHref: `/student/cases/${sub.caseId}`,
        nextHref: next && next.id !== sub.caseId ? `/student/cases/${next.id}` : null,
      }}
    />
  );
}
