"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "dark" | "light";
  size?: "default" | "large";
  showDot?: boolean;
  children: ReactNode;
}

export default function GlassButton({
  variant = "dark",
  size = "default",
  showDot = true,
  className,
  children,
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={clsx(
        variant === "dark" ? "glass" : "glass-light",
        "glass-hover",
        "inline-flex items-center justify-center gap-3",
        "font-display uppercase tracking-[0.08em] whitespace-nowrap",
        "transition-all duration-300 ease-out cursor-pointer select-none rounded-full",
        variant === "dark" ? "text-paper" : "text-ink",
        size === "large" ? "px-10 py-5 text-base" : "px-7 py-4 text-sm",
        className
      )}
      {...props}
    >
      {showDot && <span className="power-dot" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
