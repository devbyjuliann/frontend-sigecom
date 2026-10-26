import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/cn.js";

const variants = {
  primary: "bg-brand text-white hover:bg-brand/90",
  secondary: "border border-border bg-white text-ink hover:bg-slate-50",
  ghost: "text-muted hover:bg-slate-100 hover:text-ink",
};

export function Button({
  asChild = false,
  variant = "primary",
  className,
  ...props
}) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive disabled:pointer-events-none disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
