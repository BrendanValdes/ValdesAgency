"use client";

import { useRef, type ElementType } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface AnimatedHeadlineProps {
  text: string;
  as?: ElementType;
  className?: string;
  splitBy?: "word" | "letter";
  stagger?: number;
  delay?: number;
}

/**
 * GSAP SplitText is a paid plugin — this is a free manual split implementation.
 * Splits text into spans, reveals on scroll into view via opacity + y translate.
 */
export default function AnimatedHeadline({
  text,
  as: Component = "h1",
  className = "",
  splitBy = "word",
  stagger = 0.06,
  delay = 0,
}: AnimatedHeadlineProps) {
  const ref = useRef<HTMLElement>(null);
  const parts = splitBy === "word" ? text.split(" ") : Array.from(text);

  useGSAP(
    () => {
      if (!ref.current) return;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const spans = ref.current.querySelectorAll(".reveal-part");
      if (reduce) {
        gsap.set(spans, { opacity: 1, y: 0 });
        return;
      }
      gsap.from(spans, {
        opacity: 0,
        y: 30,
        duration: 0.6,
        stagger,
        delay,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ref.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });
    },
    { scope: ref }
  );

  return (
    <Component ref={ref} className={className}>
      {parts.map((part, i) => (
        <span
          key={i}
          className="reveal-part inline-block"
          style={{ marginRight: splitBy === "word" ? "0.25em" : 0 }}
        >
          {part === " " ? " " : part}
        </span>
      ))}
    </Component>
  );
}
