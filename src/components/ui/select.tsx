import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex min-h-11 w-full rounded-[10px] border border-line bg-card px-3.5 py-1 text-[15px] text-navy focus-visible:border-cyan-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-ink/20 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
