import { cn } from "@/lib/utils";

/** Logotip: "radiolog" + AI nishoni. `dark` — to'q (navy) fon ustida. */
export function Logo({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap font-display text-[22px] font-extrabold leading-none tracking-[-0.035em]",
        dark ? "text-white" : "text-navy",
        className,
      )}
      aria-label="RadiologAI"
    >
      radiolog
      <span
        className={cn(
          "inline-grid place-items-center rounded-[7px] px-1.5 pb-1 pt-[3px] text-[0.68em] tracking-[-0.01em]",
          dark ? "bg-cyan text-navy" : "bg-navy text-cyan",
        )}
      >
        AI
      </span>
    </span>
  );
}
