import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-transparent text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border-sand disabled:bg-sand disabled:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-navy text-white hover:bg-navy-700",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-line bg-card text-navy hover:border-navy",
        secondary: "bg-sand text-navy hover:bg-line-soft",
        ghost: "text-cyan-ink hover:bg-sand hover:text-navy",
        link: "text-cyan-ink underline-offset-[3px] hover:text-navy hover:underline",
        cyan: "bg-cyan text-navy hover:bg-cyan-light",
      },
      size: {
        default: "min-h-11 px-5",
        sm: "min-h-9 rounded-[10px] px-3.5 text-[13.5px]",
        lg: "min-h-[52px] px-[26px] text-base",
        icon: "h-10 w-10 rounded-[10px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
