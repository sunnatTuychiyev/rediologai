import fs from "node:fs/promises";
import path from "node:path";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  // Only allow our generated file names (uuid.ext) — prevents path traversal.
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(params.name)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(process.cwd(), "public", "uploads", params.name));
    return new Response(data, {
      headers: { "Content-Type": MIME[params.name.split(".").pop()!], "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
