"use client";

import { type ReactNode } from "react";
import clsx from "clsx";

interface GlassCardProps {
  children: ReactNode;
  variant?: "dark" | "light";
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export default function GlassCard({
  children,
  variant = "dark",
  className,
  onClick,
  interactive = false,
}: GlassCardProps) {
  return (
    <div
      className={clsx(
        variant === "dark" ? "glass" : "glass-light",
        (interactive || onClick) && "glass-hover cursor-pointer",
        "rounded-2xl p-6 transition-all duration-300 ease-out",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
