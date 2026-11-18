import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-semibold leading-none", {
  variants: {
    variant: {
      default: "border-transparent bg-cyan-100 text-[#075E6A]",
      secondary: "border-transparent bg-sand text-navy",
      outline: "border-line text-navy",
      success: "border-transparent bg-[#E7F6EC] text-[#14532D]",
      warning: "border-transparent bg-[#FDF1DC] text-[#7A3E06]",
      danger: "border-transparent bg-[#FDE8E8] text-[#7F1D1D]",
      muted: "border-transparent bg-sand text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
