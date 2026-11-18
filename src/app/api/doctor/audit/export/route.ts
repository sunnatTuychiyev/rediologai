import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { AUDIT_ACTION_LABEL } from "@/lib/mammo-rules";

export const runtime = "nodejs";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const user = await apiUser("DOCTOR");
  if (!user) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || undefined;
  const logs = await prisma.auditLog.findMany({
    where: { action, OR: [{ userId: user.id }, { study: { doctorId: user.id } }] },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } }, study: { select: { code: true } } },
    take: 20_000,
  });
  const header = ["vaqt", "foydalanuvchi", "tekshiruv", "amal", "amal_nomi", "tafsilotlar"];
  const lines = logs.map((l) => {
    // Katta snapshotlarni CSV dan chiqarib tashlaymiz — ular JSON tafsilotda ilovada ko'rinadi
    const rest = JSON.parse(l.details || "{}") as Record<string, unknown>;
    delete rest.snapshot;
    return [l.createdAt.toISOString(), l.user.name, l.study?.code, l.action, AUDIT_ACTION_LABEL[l.action] ?? l.action, JSON.stringify(rest)].map(esc).join(",");
  });
  await logAudit(user.id, "EXPORTED", null, { kind: "audit-csv", rows: logs.length });
  const csv = "﻿" + [header.join(","), ...lines].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="radiologai-audit-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
