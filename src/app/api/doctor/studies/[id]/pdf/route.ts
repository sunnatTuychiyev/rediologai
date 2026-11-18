import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getOwnedStudy, readPayload, renderMetaFor } from "@/lib/mammo-study";
import { finalText } from "@/lib/mammo-rules";
import { buildReportPdf } from "@/lib/report-pdf";
import { readModelEval } from "@/lib/model-eval";
import type { EngineResult } from "@/lib/mammo-model";
import { parseJson } from "@/lib/utils";

export const runtime = "nodejs";

/** Xulosa PDF (tasdiqlangan yoki "QORALAMA" belgili). ?download=1 — fayl sifatida. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await apiUser("DOCTOR");
  if (!user) return new Response("Forbidden", { status: 403 });
  const study = await getOwnedStudy(params.id, user.id);
  if (!study?.report) return new Response("Not found", { status: 404 });

  const approved = study.report.status === "APPROVED" && study.report.approvedAt;
  const approver = approved && study.report.approvedById ? await prisma.user.findUnique({ where: { id: study.report.approvedById }, select: { name: true } }) : null;
  const payload = readPayload(study.report.payload);
  const text = approved ? study.report.text : finalText(payload, renderMetaFor(study));
  const draft = study.drafts[0];

  const pdf = await buildReportPdf({
    code: study.code,
    date: study.createdAt,
    approved: approved ? { doctorName: approver?.name ?? "—", at: study.report.approvedAt! } : null,
    text,
    payload,
    images: study.images.map((im) => ({ file: im.file, label: `${im.laterality}-${im.view}`, width: im.width, height: im.height })),
    engine: parseJson<EngineResult | null>(draft?.engineResult, null),
    modelEval: readModelEval(),
  });
  await logAudit(user.id, "EXPORTED", study.id, { kind: "pdf", approved: Boolean(approved) });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${study.code}${approved ? "" : "-qoralama"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
