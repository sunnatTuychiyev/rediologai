import "server-only";
import { prisma } from "./prisma";
import type { AuditAction } from "./mammo-types";

/** Audit jurnaliga yozuv qo'shadi. Jurnal faqat qo'shiladi: bu modulda update/delete yo'q. */
export async function logAudit(userId: string, action: AuditAction, studyId: string | null, details: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({ data: { userId, action, studyId, details: JSON.stringify(details) } });
  } catch (err) {
    // Audit yozuvi asosiy amalni to'xtatmasin, lekin konsolda ko'rinsin
    console.error("[audit] yozib bo'lmadi", action, studyId, err);
  }
}
