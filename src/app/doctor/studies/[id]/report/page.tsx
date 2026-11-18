import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getOwnedStudy, readPayload, renderMetaFor } from "@/lib/mammo-study";
import { finalText } from "@/lib/mammo-rules";
import { PrintPdfButton } from "@/components/mammo/print-pdf-button";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const user = await requireUser("DOCTOR");
  const study = await getOwnedStudy(params.id, user.id);
  if (!study?.report) notFound();
  const approved = study.report.status === "APPROVED";
  await logAudit(user.id, "REPORT_VIEWED", study.id, { approved });
  // Tasdiqlanmagan bo'lsa — joriy qoralama (sarlavhada "QORALAMA" yozuvi bilan)
  const text = approved ? study.report.text : finalText(readPayload(study.report.payload), renderMetaFor(study));

  return (
    <div className="mx-auto max-w-3xl p-6 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/doctor/studies/${study.id}`} className="text-[13px] font-semibold text-cyan-ink hover:underline">← Ish joyiga qaytish</Link>
        <div className="ml-auto"><PrintPdfButton studyId={study.id} code={study.code} approved={approved} size="default" /></div>
      </div>
      {!approved && (
        <p className="mb-4 rounded-[14px] border-2 border-amber-300 bg-[#FDF1DC] p-3 text-[13.5px] font-semibold text-[#7A3E06] print:border-black print:bg-transparent print:text-black">
          QORALAMA — shifokor tasdiqlamagan. Rasmiy hujjat sifatida foydalanmang.
        </p>
      )}
      <article className="rounded-xl border border-line-soft bg-card p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between border-b border-line pb-3 text-[12px] text-muted-foreground print:text-black">
          <span className="font-display text-base font-extrabold text-navy print:text-black">RadiologAI</span>
          <span>{study.code}</span>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-navy print:text-[12pt] print:text-black">{text}</pre>
        <p className="mt-8 border-t border-line pt-3 text-[11px] text-muted-foreground print:text-black">
          Qoralama AI yordamida tayyorlangan va shifokor tomonidan ko&apos;rib chiqilgan. AI tashxis qo&apos;ymaydi; yakuniy xulosa uchun imzolagan shifokor javobgar.
        </p>
      </article>
    </div>
  );
}
