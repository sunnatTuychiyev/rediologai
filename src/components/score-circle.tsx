import { cn } from "@/lib/utils";

export function ScoreCircle({ score, size = 140 }: { score: number; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score < 50 ? "#B91C1C" : score < 80 ? "#E08A12" : "#15803D";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EAF0F6" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-display text-4xl font-extrabold tracking-[-0.04em] tabular-nums")} style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-line-soft bg-card p-[22px] shadow-sm">
      <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        {label}
        {Icon && <Icon className="h-4 w-4" />}
      </div>
      <div className="mt-1 font-display text-[32px] font-extrabold leading-tight tracking-[-0.025em] tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
