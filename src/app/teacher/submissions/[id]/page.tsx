import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadSubmission } from "@/lib/result";
import { ResultView } from "@/components/result-view";
import { PendingResult } from "@/components/pending-result";

export default async function TeacherResultPage({ params }: { params: { id: string } }) {
  const user = await requireUser("TEACHER");
  const data = await loadSubmission(params.id);
  if (!data || data.sub.case.createdById !== user.id) notFound();
  const { sub, evaluation, regions } = data;
  return (
    <div>
      <div className="px-6 pt-4">
        <Link href={`/teacher/students/${sub.studentId}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {sub.student.name}
        </Link>
      </div>
      {sub.status !== "DONE" || !evaluation ? (
        <PendingResult id={sub.id} status={sub.status} canRetry={false} />
      ) : (
        <ResultView submission={{ ...sub, score: sub.score ?? 0 }} evaluation={evaluation} caseData={sub.case} regions={regions} studentName={sub.student.name} />
      )}
    </div>
  );
}
