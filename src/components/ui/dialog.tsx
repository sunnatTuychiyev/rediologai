"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/60" onClick={() => onOpenChange(false)} />
      <div role="dialog" aria-modal className={cn("relative w-full max-w-md rounded-2xl border border-line-soft bg-card p-6 shadow-md", className)}>
        <button className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" onClick={() => onOpenChange(false)} aria-label="Yopish">
          <X className="h-4 w-4" />
        </button>
        <h2 className="font-display text-[19px] font-bold">{title}</h2>
        {description && <div className="mt-2 text-sm text-muted-foreground">{description}</div>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
