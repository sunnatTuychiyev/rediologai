import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/utils";
import type { Evaluation } from "@/lib/types";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const user = await apiUser("TEACHER");
  if (!user) return new Response("Forbidden", { status: 403 });
  const subs = await prisma.submission.findMany({
    where: { status: "DONE", case: { createdById: user.id } },
    orderBy: { createdAt: "asc" },
    include: { student: { select: { name: true, email: true, group: { select: { name: true } } } }, case: { select: { title: true, modality: true, tags: true } } },
  });
  const header = ["sana", "talaba", "email", "guruh", "mashq", "modallik", "teglar", "ball", "topilmalar", "tashxis", "aniqlik", "tuzilma", "otkazilgan_topilmalar", "vaqt_sek"];
  const lines = subs.map((s) => {
    const ev = parseJson<Evaluation | null>(s.evaluation, null);
    return [
      s.createdAt.toISOString(), s.student.name, s.student.email, s.student.group?.name, s.case.title, s.case.modality,
      parseJson<string[]>(s.case.tags, []).join("|"), s.score, ev?.subscores.findings, ev?.subscores.impression, ev?.subscores.accuracy, ev?.subscores.structure,
      ev?.findingResults.filter((f) => f.status === "missed").map((f) => f.referenceText).join(" | "), s.durationSec,
    ].map(esc).join(",");
  });
  const csv = "﻿" + [header.join(","), ...lines].join("\n"); // BOM so Excel opens UTF-8 correctly
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="radiologai-natijalar-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
