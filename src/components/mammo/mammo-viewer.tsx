"use client";
import { useState } from "react";
import { Contrast, Grid2x2, SunMoon, Sun } from "lucide-react";
import { ImageViewer, type ViewerRegion } from "@/components/image-viewer";
import { cn } from "@/lib/utils";
import type { MammoFinding } from "@/lib/mammo-types";

export type MammoImage = { id: string; url: string; label: string; pixelSpacing: number | null; width: number; height: number; heatmapUrl?: string | null };

const STROKE: Record<NonNullable<ViewerRegion["color"]>, string> = { red: "#EF4444", amber: "#F59E0B", green: "#34D399", cyan: "#5ED3EE" };

/** Standart osish tartibi: yuqorida MLO, pastda CC; o'ng ko'krak bezi ko'ruvchining chap tomonida. */
const HANG = ["R-MLO", "L-MLO", "R-CC", "L-CC"];

const colorFor = (f: MammoFinding, selected: boolean): ViewerRegion["color"] =>
  selected ? "cyan" : f.confidence < 0.6 ? "amber" : f.origin === "doctor" ? "green" : "red";

export function MammoViewer({
  images,
  findings,
  selectedId,
  onSelect,
  className,
}: {
  images: MammoImage[];
  findings: MammoFinding[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const [single, setSingle] = useState<string | null>(null);
  const [showMarks, setShowMarks] = useState(true);
  const [invert, setInvert] = useState(false);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [showHeat, setShowHeat] = useState(false);
  const hasHeat = images.some((im) => im.heatmapUrl);

  const byLabel = new Map(images.map((im) => [im.label, im]));
  const slots = HANG.map((l) => byLabel.get(l) ?? null);
  const extra = images.filter((im) => !HANG.includes(im.label));
  const cells = [...slots, ...extra];
  const marked = findings.filter((f) => f.region);
  const regionsFor = (label: string) =>
    marked
      .filter((f) => f.region!.view === label)
      .map((f) => ({ f, r: f.region!, label: `${f.id.toUpperCase()} · ${Math.round(f.confidence * 100)}%` }));

  // Topilma tanlansa — o'sha proyeksiya kattalashtirilgan holatda ham ko'rinadi
  const singleImage = single ? images.find((im) => im.id === single) : null;

  if (singleImage) {
    const regions: ViewerRegion[] = showMarks
      ? regionsFor(singleImage.label).map(({ f, r, label }) => ({ imageId: singleImage.id, x: r.x, y: r.y, width: r.w, height: r.h, label, color: colorFor(f, f.id === selectedId) }))
      : [];
    return (
      <div className={cn("flex min-h-0 flex-col bg-navy-900", className)}>
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs text-[#C9D3E3]">
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2 hover:bg-white/[.08]" onClick={() => setSingle(null)}>
            <Grid2x2 className="h-4 w-4" /> 2×2 ko&apos;rinish
          </button>
          <span className="font-semibold text-white">{singleImage.label}</span>
          <label className="ml-auto flex items-center gap-1.5">
            <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} className="accent-[#5ED3EE]" /> AI belgilari
          </label>
        </div>
        <ImageViewer key={singleImage.id} images={[{ id: singleImage.id, url: singleImage.url, label: singleImage.label, pixelSpacing: singleImage.pixelSpacing }]} regions={regions} className="min-h-0 flex-1" />
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col bg-navy-900 text-[#C9D3E3]", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-3 py-2 text-xs">
        <label className="flex items-center gap-1.5" title="Yorqinlik">
          <Sun className="h-3.5 w-3.5" />
          <input type="range" min={40} max={220} value={brightness} onChange={(e) => setBrightness(+e.target.value)} className="h-1 w-20 accent-[#5ED3EE]" />
        </label>
        <label className="flex items-center gap-1.5" title="Kontrast (oyna)">
          <Contrast className="h-3.5 w-3.5" />
          <input type="range" min={40} max={300} value={contrast} onChange={(e) => setContrast(+e.target.value)} className="h-1 w-20 accent-[#5ED3EE]" />
        </label>
        <button
          type="button"
          title="Inversiya"
          aria-pressed={invert}
          onClick={() => setInvert((v) => !v)}
          className={cn("flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-white/[.08]", invert && "bg-cyan/20 text-cyan ring-1 ring-cyan")}
        >
          <SunMoon className="h-4 w-4" />
        </button>
        {marked.length > 0 && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} className="accent-[#5ED3EE]" /> AI belgilari
          </label>
        )}
        {hasHeat && (
          <label className="flex items-center gap-1.5" title="Model qayerga qaragani (CAM) — tashxis emas">
            <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} className="accent-[#5ED3EE]" /> Issiqlik xaritasi
          </label>
        )}
        <span className="ml-auto text-[11px] text-muted-dark">Kattalashtirish, zoom va chizg&apos;ich uchun proyeksiyani bosing</span>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-px bg-white/10">
        {cells.map((im, i) =>
          im ? (
            <button
              type="button"
              key={im.id}
              onClick={() => setSingle(im.id)}
              className="group relative flex min-h-[180px] items-center justify-center overflow-hidden bg-black"
              aria-label={`${im.label} proyeksiyani kattalashtirish`}
            >
              {/* Rasm va belgilar bir xil viewBox/letterbox da — katakcha o'lchami qanday bo'lmasin, ramkalar mos tushadi */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={im.url}
                alt={im.label}
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain"
                style={{ filter: `brightness(${brightness}%) contrast(${contrast}%) ${invert ? "invert(1)" : ""}` }}
              />
              {showHeat && im.heatmapUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={im.heatmapUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-screen" />
              )}
              {showMarks && im.width > 0 && im.height > 0 && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${im.width} ${im.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden
                >
                  {regionsFor(im.label).map(({ f, r, label }) => {
                    const color = colorFor(f, f.id === selectedId);
                    const stroke = STROKE[color ?? "red"];
                    const fs = Math.max(im.width, im.height) * 0.028;
                    const x = r.x * im.width;
                    const y = r.y * im.height;
                    return (
                      <g
                        key={f.id}
                        className="pointer-events-auto cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect?.(f.id);
                        }}
                      >
                        <title>{label}</title>
                        <rect x={x} y={y} width={r.w * im.width} height={r.h * im.height} fill="transparent" stroke={stroke} strokeWidth={color === "cyan" ? 3.5 : 2.5} strokeDasharray={color === "amber" ? "6 4" : undefined} vectorEffect="non-scaling-stroke" />
                        <rect x={x} y={Math.max(0, y - fs * 1.35)} width={fs * 0.62 * label.length + fs * 0.6} height={fs * 1.3} rx={fs * 0.2} fill={stroke} />
                        <text x={x + fs * 0.3} y={Math.max(0, y - fs * 1.35) + fs * 0.98} fontSize={fs} fontWeight={700} fill={color === "cyan" || color === "amber" ? "#0F1E3A" : "#fff"} style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              <span className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{im.label}</span>
            </button>
          ) : (
            <div key={`empty-${i}`} className="flex min-h-[180px] items-center justify-center bg-black text-xs text-muted-dark">
              {HANG[i]} — yuklanmagan
            </div>
          ),
        )}
      </div>
    </div>
  );
}
