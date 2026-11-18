import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SAFE_MAMMO_NAME, readMammoFile } from "@/lib/imaging";

export const runtime = "nodejs";

/** Mammografiya fayllari faqat tekshiruv egasi bo'lgan shifokorga beriladi. */
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (!SAFE_MAMMO_NAME.test(params.name)) return new Response("Not found", { status: 404 });
  const user = await apiUser("DOCTOR");
  if (!user) return new Response("Forbidden", { status: 403 });
  // Issiqlik xaritasi (<uuid>-heat.png) asl tasvir (<uuid>.png) egasiga tegishli
  const base = params.name.replace(/-heat\.png$/, ".png");
  const owned = await prisma.studyImage.findFirst({
    where: { OR: [{ file: base }, { aiFile: params.name }], study: { doctorId: user.id } },
    select: { id: true },
  });
  if (!owned) return new Response("Not found", { status: 404 });
  try {
    const data = await readMammoFile(params.name);
    return new Response(data, {
      headers: { "Content-Type": params.name.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
