import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { apiUser } from "@/lib/auth";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(req: Request) {
  const user = await apiUser("TEACHER");
  if (!user) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Fayl tanlanmagan" }, { status: 400 });
  if (files.length > 100) return NextResponse.json({ error: "Bir martada ko'pi bilan 100 ta fayl" }, { status: 400 });

  for (const f of files) {
    if (!TYPES[f.type]) return NextResponse.json({ error: `${f.name}: faqat PNG, JPG yoki WEBP` }, { status: 400 });
    if (f.size > MAX_BYTES) return NextResponse.json({ error: `${f.name}: 10 MB dan katta` }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const saved = [];
  for (const f of files) {
    const name = `${randomUUID()}.${TYPES[f.type]}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await f.arrayBuffer()));
    // Served through /api/files so runtime uploads also work under `next start`.
    saved.push({ url: `/api/files/${name}`, name: f.name });
  }
  return NextResponse.json({ files: saved });
}
