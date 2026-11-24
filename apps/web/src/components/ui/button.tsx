import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** shadcn/ui-style button on GovNavAI tokens. All sizes keep tap targets of 48px or more. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-strong active:bg-primary-strong",
        secondary: "bg-surface-2 text-ink ring-1 ring-line hover:bg-white",
        ghost: "text-ink hover:bg-surface-2",
        gold: "bg-gold text-ink hover:brightness-95",
        outline: "bg-surface text-primary ring-1 ring-primary/40 hover:bg-primary/5",
      },
      size: {
        md: "min-h-12 px-4 text-base",
        lg: "min-h-14 px-6 text-lg",
        icon: "size-12",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
