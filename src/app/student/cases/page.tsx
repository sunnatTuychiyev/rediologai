import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, CircleDashed } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DIFFICULTY_LABEL, MODALITY_LABEL } from "@/lib/labels";
import { scoreBg } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { CaseFilters } from "./filters";

/** Har bir mashq uchun seriyaning o'rtasidagi kesim (birinchi kesim ko'pincha bo'sh/qorong'i bo'ladi). */
async function middleImages(cases: { id: string; _count: { images: number } }[]) {
  if (!cases.length) return new Map<string, string>();
  const rows = await prisma.caseImage.findMany({
    where: { OR: cases.map((c) => ({ caseId: c.id, order: Math.floor(Math.max(0, c._count.images - 1) / 2) })) },
    select: { caseId: true, url: true },
  });
  return new Map(rows.map((r) => [r.caseId, r.url]));
}

type SP = { modality?: string; region?: string; difficulty?: string; status?: string };

/** Bo'limlar (kartochkalar) tartibi va izohi. */
const SECTIONS = [
  { key: "MRI", text: "ko'p kesimli seriyalar, o'lchash" },
  { key: "CT", text: "kesimlar bo'ylab aylantirish, o'lchash" },
  { key: "XRAY", text: "to'g'ri va yon proyeksiyalar" },
] as const;

export default async function StudentCases({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("STUDENT");
  const modality = SECTIONS.some((s) => s.key === searchParams.modality) ? searchParams.modality : undefined;

  const best = await prisma.submission.groupBy({
    by: ["caseId"],
    where: { studentId: user.id, status: "DONE" },
    _max: { score: true },
  });
  const bestMap = new Map(best.map((b) => [b.caseId, b._max.score]));

  // ---------------- Bo'lim tanlash: 3 ta kartochka ----------------
  if (!modality) {
    const all = await prisma.case.findMany({
      where: { isPublished: true },
      select: { id: true, modality: true, bodyRegion: true, _count: { select: { images: true } } },
      orderBy: { createdAt: "asc" },
    });
    const thumbs = await middleImages(all);
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageHeader title="Mashqlar" description="Bo'limni tanlang: tasvirni o'qing, xulosa yozing va AI'dan fikr-mulohaza oling." />
        <div className="grid gap-5 md:grid-cols-3">
          {SECTIONS.map((s) => {
            const items = all.filter((c) => c.modality === s.key);
            const done = items.filter((c) => bestMap.has(c.id)).length;
            const todo = items.length - done;
            const pct = items.length ? Math.round((done / items.length) * 100) : 0;
            // Muqova: bo'limdagi haqiqiy tasvirlardan biri (bo'lmasa birinchisi)
            const coverCase = items.find((c) => thumbs.get(c.id)?.startsWith("/cases/")) ?? items[0];
            const cover = coverCase && thumbs.get(coverCase.id);
            return (
              <Link
                key={s.key}
                href={`/student/cases?modality=${s.key}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-line-soft bg-card shadow-sm transition hover:border-line hover:shadow-md"
              >
                <div className="relative h-44 bg-navy-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover && <img src={cover} alt="" className="h-full w-full object-cover opacity-70 transition group-hover:opacity-90" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/30 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between text-white">
                    <h2 className="font-display text-[34px] font-extrabold leading-none tracking-[-0.03em]">{MODALITY_LABEL[s.key]}</h2>
                    <span className="text-sm font-medium text-nav-text">{items.length} ta mashq</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <p className="text-sm text-muted-foreground">
                    {[...new Set(items.map((c) => c.bodyRegion))].join(", ") || "Hozircha mashq yo'q"}
                    {items.length > 0 && ` — ${s.text}`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success"><CheckCircle2 className="h-3.5 w-3.5" /> {done} yechilgan</Badge>
                    <Badge variant={todo ? "warning" : "muted"}><CircleDashed className="h-3.5 w-3.5" /> {todo} yechilmagan</Badge>
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Bajarildi</span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-sand">
                      <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-ink group-hover:text-navy">
                    Mashqlarni ochish <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------- Tanlangan bo'lim ichidagi mashqlar ----------------
  const cases = await prisma.case.findMany({
    where: {
      isPublished: true,
      modality,
      ...(searchParams.region ? { bodyRegion: searchParams.region } : {}),
      ...(searchParams.difficulty ? { difficulty: searchParams.difficulty } : {}),
    },
    // NOTE: title & reference report intentionally NOT selected — title reveals the diagnosis.
    select: {
      id: true, modality: true, bodyRegion: true, difficulty: true, clinicalInfo: true, createdAt: true,
      _count: { select: { images: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const thumbs = await middleImages(cases);
  const filtered = cases.filter((c) =>
    searchParams.status === "done" ? bestMap.has(c.id) : searchParams.status === "todo" ? !bestMap.has(c.id) : true,
  );
  const regions = Array.from(new Set(cases.map((c) => c.bodyRegion)));
  const done = cases.filter((c) => bestMap.has(c.id)).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link href="/student/cases" className="mb-3 inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> Barcha bo&apos;limlar
      </Link>
      <PageHeader
        title={`${MODALITY_LABEL[modality]} mashqlari`}
        description={`${cases.length} ta mashq · ${done} ta yechilgan · ${cases.length - done} ta yechilmagan`}
      />
      <CaseFilters regions={regions} hideModality />
      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="Mashq topilmadi" text="Filtrlarni o'zgartirib ko'ring." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const score = bestMap.get(c.id);
            const n = cases.indexOf(c) + 1;
            return (
              <Link key={c.id} href={`/student/cases/${c.id}`} className="group overflow-hidden rounded-xl border border-line-soft bg-card shadow-sm transition hover:border-line hover:shadow-md">
                <div className="relative h-36 bg-navy-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumbs.get(c.id) && <img src={thumbs.get(c.id)} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />}
                  <div className="absolute left-2 top-2 flex gap-1">
                    {c._count.images > 1 && <Badge className="bg-black/60 text-white">{c._count.images} {c.modality === "XRAY" ? "proyeksiya" : "kesim"}</Badge>}
                  </div>
                  {score != null ? (
                    <span className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBg(score)}`}>
                      <CheckCircle2 className="h-3 w-3" /> {score}
                    </span>
                  ) : (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-semibold text-[#7A3E06]">
                      <CircleDashed className="h-3 w-3" /> Yechilmagan
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Mashq #{n} · {c.bodyRegion}</span>
                    <Badge variant={c.difficulty === "HARD" ? "danger" : c.difficulty === "MEDIUM" ? "warning" : "success"}>{DIFFICULTY_LABEL[c.difficulty]}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.clinicalInfo}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
