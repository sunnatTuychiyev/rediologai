import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-[10px] border border-line bg-card px-3.5 py-3 text-[15px] leading-relaxed text-navy placeholder:text-[#8593A8] focus-visible:border-cyan-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-ink/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
