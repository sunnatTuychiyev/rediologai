import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex min-h-11 w-full rounded-[10px] border border-line bg-card px-3.5 py-1 text-[15px] text-navy transition-colors placeholder:text-[#8593A8] focus-visible:border-cyan-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-ink/20 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
