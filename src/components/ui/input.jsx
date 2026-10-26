import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink placeholder:text-slate-400 focus-visible:border-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive/20 disabled:cursor-not-allowed disabled:bg-slate-50",
        className,
      )}
      {...props}
    />
  );
});
