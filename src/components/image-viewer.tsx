"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Contrast, Maximize, Minimize, RotateCcw, Ruler, Sun, SunMoon, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

/** pixelSpacing — mm/piksel (asl rasm pikseli). Bo'lsa, chizg'ich mm da o'lchaydi. */
export type ViewerImage = { id: string; url: string; label?: string | null; pixelSpacing?: number | null };
type Line = { x0: number; y0: number; x1: number; y1: number };
export type ViewerRegion = { imageId: string; x: number; y: number; width: number; height: number; label: string; color?: "red" | "green" | "amber" | "cyan"; key?: string };

/** Doira chizish uchun ranglar (natija sahifasi: yashil — topilgan, qizil — o'tkazib yuborilgan). */
const CIRCLE_COLOR = { red: "#F87171", green: "#4ADE80", amber: "#FBBF24", cyan: "#5ED3EE" };

const REGION_COLOR = { red: "border-red-500 text-red-50 bg-red-600", green: "border-emerald-400 text-emerald-50 bg-emerald-600", amber: "border-amber-400 text-amber-50 bg-amber-500", cyan: "border-cyan text-navy bg-cyan" };

export function ImageViewer({
  images,
  regions = [],
  className,
  regionShape = "box",
  focus,
}: {
  images: ViewerImage[];
  regions?: ViewerRegion[];
  className?: string;
  /** "circle" — soha atrofida doira (natija sahifasi) */
  regionShape?: "box" | "circle";
  /** Tashqaridan kesimga o'tish: n har safar o'zgarsa, index ga o'tadi */
  focus?: { index: number; n: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(focus?.index ?? 0);
  useEffect(() => {
    if (focus) {
      setIndex(Math.min(images.length - 1, Math.max(0, focus.index)));
      setShowRegions(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showRegions, setShowRegions] = useState(true);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0, cw: 0 });
  const [ruler, setRuler] = useState(false);
  const [lines, setLines] = useState<Record<number, Line[]>>({});
  const [draft, setDraft] = useState<Line | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = images.length;
  const current = images[index];

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBrightness(100);
    setContrast(100);
    setInvert(false);
  }, []);

  const step = useCallback((d: number) => setIndex((i) => Math.min(count - 1, Math.max(0, i + d))), [count]);

  // Keyboard: arrows scroll slices (ignored while typing in inputs/textareas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { step(1); e.preventDefault(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { step(-1); e.preventDefault(); }
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Wheel: zoom (non-passive listener so we can preventDefault). Shift+wheel scrolls slices.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Ko'p kesimli tasvir (KT/MRT): g'ildirak — kesim, Ctrl/⌘ + g'ildirak yoki pinch — zoom
      if (count > 1 && !e.ctrlKey && !e.metaKey) {
        if (Math.abs(e.deltaY) < 1) return;
        step(e.deltaY > 0 ? 1 : -1);
        return;
      }
      setZoom((z) => Math.min(8, Math.max(0.5, z * (e.deltaY > 0 ? 0.9 : 1.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [count, step]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  // Ekran nuqtasi -> asl rasm pikseli (zoom/pan hisobga olinadi)
  const toImage = (e: React.PointerEvent) => {
    const img = imgRef.current;
    if (!img || !natural.w) return null;
    const rc = img.getBoundingClientRect();
    return { x: ((e.clientX - rc.left) / rc.width) * natural.w, y: ((e.clientY - rc.top) / rc.height) * natural.h };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (ruler && e.button === 0) {
      const p = toImage(e);
      if (p) setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draft) {
      const p = toImage(e);
      if (p) setDraft({ ...draft, x1: p.x, y1: p.y });
      return;
    }
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => {
    if (draft) {
      if (Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) > 2) setLines((l) => ({ ...l, [index]: [...(l[index] ?? []), draft] }));
      setDraft(null);
    }
    drag.current = null;
  };

  // Qo'shni kesimlarni oldindan yuklash — aylantirish silliq bo'lsin
  useEffect(() => {
    for (let d = 1; d <= 6; d++) {
      for (const j of [index + d, index - d]) {
        const im = images[j];
        if (im) new window.Image().src = im.url;
      }
    }
  }, [index, images]);

  // Rasm keshdan React yuklanishidan oldin kelgan bo'lsa, onLoad ishlamaydi — o'lchamni shu yerda o'qiymiz
  useEffect(() => {
    const im = imgRef.current;
    if (im && im.complete && im.naturalWidth) {
      setNatural((n) => (n.w === im.naturalWidth && n.h === im.naturalHeight && n.cw === im.clientWidth ? n : { w: im.naturalWidth, h: im.naturalHeight, cw: im.clientWidth }));
    }
  }, [current?.url]);

  // Oyna o'lchami o'zgarsa, chizg'ich yozuvi o'lchamini qayta hisoblash
  useEffect(() => {
    const im = imgRef.current;
    if (im && im.clientWidth) setNatural((n) => (n.cw === im.clientWidth ? n : { ...n, cw: im.clientWidth }));
  }, [box, natural.w, natural.h]);

  // Kichik rasmlar (masalan, MRT 256 px) ham oynani to'ldirsin: tomonlar nisbatini saqlab moslash
  const fitted: React.CSSProperties =
    natural.w && box.w && box.h
      ? (() => {
          const s = Math.min(box.w / natural.w, box.h / natural.h);
          return { width: natural.w * s, height: natural.h * s };
        })()
      : { maxWidth: box.w || "100%", maxHeight: box.h || "100%" };

  const spacing = images[index]?.pixelSpacing ?? null;
  const measure = (l: Line) => {
    const px = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    return spacing ? `${(px * spacing).toFixed(1)} mm` : `${Math.round(px)} px`;
  };
  const sliceLines = [...(lines[index] ?? []), ...(draft ? [draft] : [])];
  const fs = natural.cw ? (12 * natural.w) / natural.cw / zoom : 12;

  const currentRegions = regions.filter((r) => r.imageId === current?.id);

  if (!current) {
    return <div className={cn("flex items-center justify-center bg-navy-900 text-sm text-muted-dark", className)}>Rasm yo&apos;q</div>;
  }

  return (
    <div className={cn("flex min-h-0 flex-col bg-navy-900 text-[#C9D3E3]", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-3 py-2 text-xs">
        <div className="flex items-center gap-1">
          <ToolBtn title="Kichiklashtirish" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOut /></ToolBtn>
          <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <ToolBtn title="Kattalashtirish" onClick={() => setZoom((z) => Math.min(8, z * 1.25))}><ZoomIn /></ToolBtn>
        </div>
        <label className="flex items-center gap-1.5" title="Yorqinlik">
          <Sun className="h-3.5 w-3.5" />
          <input type="range" min={30} max={250} value={brightness} onChange={(e) => setBrightness(+e.target.value)} className="h-1 w-20 accent-[#5ED3EE]" />
        </label>
        <label className="flex items-center gap-1.5" title="Kontrast">
          <Contrast className="h-3.5 w-3.5" />
          <input type="range" min={30} max={300} value={contrast} onChange={(e) => setContrast(+e.target.value)} className="h-1 w-20 accent-[#5ED3EE]" />
        </label>
        <ToolBtn title="Inversiya" active={invert} onClick={() => setInvert((v) => !v)}><SunMoon /></ToolBtn>
        <ToolBtn title="Asl holatga qaytarish" onClick={reset}><RotateCcw /></ToolBtn>
        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
        <ToolBtn title={spacing ? "Chizg'ich — mm da o'lchash" : "Chizg'ich (piksel; bu rasmda mm ma'lumoti yo'q)"} active={ruler} onClick={() => setRuler((v) => !v)}><Ruler /></ToolBtn>
        {(lines[index]?.length ?? 0) > 0 && (
          <ToolBtn title="Shu kesimdagi o'lchovlarni o'chirish" onClick={() => setLines((l) => ({ ...l, [index]: [] }))}><Trash2 /></ToolBtn>
        )}
        {regions.length > 0 && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} className="accent-[#5ED3EE]" />
            Belgilar
          </label>
        )}
        <div className="ml-auto">
          <ToolBtn title="To'liq ekran" onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</ToolBtn>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className={cn("relative min-h-0 flex-1 touch-none select-none overflow-hidden", ruler ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => !ruler && reset()}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              onLoad={(e) => {
                const im = e.currentTarget;
                setNatural({ w: im.naturalWidth, h: im.naturalHeight, cw: im.clientWidth });
              }}
              src={current.url}
              alt={current.label ?? "Tibbiy tasvir"}
              draggable={false}
              className="block object-contain"
              style={{ ...fitted, filter: `brightness(${brightness}%) contrast(${contrast}%) ${invert ? "invert(1)" : ""}` }}
            />
            {showRegions && regionShape === "circle" && natural.w > 0 && currentRegions.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${natural.w} ${natural.h}`} preserveAspectRatio="none">
                {currentRegions.map((r, i) => {
                  const cx = (r.x + r.width / 2) * natural.w;
                  const cy = (r.y + r.height / 2) * natural.h;
                  const rad = (Math.max(r.width * natural.w, r.height * natural.h) / 2) * 1.15 + fs * 0.4;
                  const col = CIRCLE_COLOR[r.color ?? "red"];
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={cy} r={rad} fill="none" stroke="#0A1528" strokeOpacity={0.55} strokeWidth={5} vectorEffect="non-scaling-stroke" />
                      <circle cx={cx} cy={cy} r={rad} fill={col} fillOpacity={0.1} stroke={col} strokeWidth={2.5} strokeDasharray={r.color === "red" ? "7 4" : undefined} vectorEffect="non-scaling-stroke" />
                      <text
                        x={cx}
                        y={cy - rad - fs * 0.5}
                        textAnchor="middle"
                        fontSize={fs}
                        fontWeight={700}
                        fill={col}
                        stroke="#0A1528"
                        strokeWidth={fs * 0.25}
                        paintOrder="stroke"
                        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                      >
                        {r.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            {showRegions &&
              regionShape === "box" &&
              currentRegions.map((r, i) => (
                <div
                  key={i}
                  className={cn("pointer-events-none absolute border-2", REGION_COLOR[r.color ?? "red"].split(" ")[0])}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }}
                >
                  <span className={cn("absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px]", REGION_COLOR[r.color ?? "red"].split(" ").slice(1).join(" "))}>
                    {r.label}
                  </span>
                </div>
              ))}
            {natural.w > 0 && sliceLines.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${natural.w} ${natural.h}`} preserveAspectRatio="none">
                {sliceLines.map((l, i) => (
                  <g key={i}>
                    <line x1={l.x0} y1={l.y0} x2={l.x1} y2={l.y1} stroke="#5ED3EE" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    <circle cx={l.x0} cy={l.y0} r={fs * 0.3} fill="#5ED3EE" />
                    <circle cx={l.x1} cy={l.y1} r={fs * 0.3} fill="#5ED3EE" />
                    <text
                      x={l.x1 + fs * 0.6}
                      y={l.y1 - fs * 0.6}
                      fontSize={fs}
                      fontWeight={700}
                      fill="#5ED3EE"
                      stroke="#0A1528"
                      strokeWidth={fs * 0.25}
                      paintOrder="stroke"
                      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                    >
                      {measure(l)}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
        </div>
        {current.label && <div className="pointer-events-none absolute left-3 top-2 text-xs text-muted-dark">{current.label}</div>}
        <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-muted-dark/80">{ruler
            ? "Chizg'ich: bosib torting · Esc — bekor qilish"
            : count > 1
              ? "G'ildirak — kesim · Ctrl/⌘ + g'ildirak — zoom · Sudrash — siljitish · 2× bosish — reset"
              : "G'ildirak — zoom · Sudrash — siljitish · 2× bosish — reset"}</div>
      </div>

      {/* Slice navigation */}
      {count > 1 && (
        <div className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-xs">
          <ToolBtn title="Oldingi kesim (←)" onClick={() => step(-1)} disabled={index === 0}><ChevronLeft /></ToolBtn>
          <input type="range" min={0} max={count - 1} value={index} onChange={(e) => setIndex(+e.target.value)} className="h-1 flex-1 accent-[#5ED3EE]" />
          <ToolBtn title="Keyingi kesim (→)" onClick={() => step(1)} disabled={index === count - 1}><ChevronRight /></ToolBtn>
          <span className="w-14 text-right tabular-nums">{index + 1} / {count}</span>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ children, title, onClick, active, disabled }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-white/[.08] disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4",
        active && "bg-cyan/20 text-cyan ring-1 ring-cyan hover:bg-cyan/30",
      )}
    >
      {children}
    </button>
  );
}
