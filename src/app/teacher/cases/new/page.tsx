import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { CaseWizard } from "../case-wizard";

export default async function NewCasePage() {
  await requireUser("TEACHER");
  return (
    <div className="mx-auto max-w-6xl p-6 pb-0">
      <PageHeader title="Yangi mashq qo'shish" description="4 qadam: ma'lumot → rasmlar → shifokor xulosasi → belgilash" />
      <CaseWizard caseId={null} />
    </div>
  );
}
