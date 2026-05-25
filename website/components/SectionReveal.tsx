"use client";

import { type ReactNode } from "react";

interface SectionRevealProps {
  children: ReactNode;
  from?: "left" | "right";
  className?: string;
  id?: string;
  snap?: boolean;
}

/**
 * Pass-through wrapper that marks a section as a snap target via
 * `data-snap-section`. The prior GSAP enter animation (opacity:0 +
 * translateX 120px → 1 + 0) was removed in Path A because it broke
 * native CSS scroll-snap by making snap targets invisible at their
 * layout positions. The snap motion itself is now the entry feel.
 *
 * The `from` prop is preserved as a data-attribute for any future
 * targeted CSS, but no longer drives a transform.
 */
export default function SectionReveal({
  children,
  from = "right",
  className = "",
  id,
  snap = true,
}: SectionRevealProps) {
  return (
    <div
      id={id}
      data-from={from}
      data-snap-section={snap ? "" : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
