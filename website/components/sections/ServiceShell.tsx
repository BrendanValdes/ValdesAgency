"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import clsx from "clsx";
import SectionReveal from "@/components/SectionReveal";
import type { SectionCopy } from "@/lib/copy";

gsap.registerPlugin(ScrollTrigger);

interface ServiceShellProps {
  id: string;
  copy: SectionCopy;
  visual: ReactNode;
  background: "ink" | "paper";
  from: "left" | "right";
  visualSide?: "left" | "right";
  visualClassName?: string;
}

/**
 * Reusable shell for the service sections (label / headline / body / tag
 * pills / visual). Background toggles ink (dark) or paper (white) for the
 * alternating create.video rhythm; the visual sits left or right.
 */
export default function ServiceShell({
  id,
  copy,
  visual,
  background,
  from,
  visualSide = "right",
  visualClassName,
}: ServiceShellProps) {
  const tagsRef = useRef<HTMLDivElement>(null);

  const isDark = background === "ink";
  const bgClass = isDark ? "bg-ink text-paper" : "bg-paper text-ink";
  const subColor = isDark ? "text-paper-dim" : "text-ink/60";
  const bodyColor = isDark ? "text-paper" : "text-ink";

  useGSAP(
    () => {
      if (!tagsRef.current) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const items = tagsRef.current.querySelectorAll("[data-pill]");
      if (reduce) {
        gsap.set(items, { opacity: 1, y: 0 });
        return;
      }
      gsap.from(items, {
        opacity: 0,
        y: 12,
        duration: 0.5,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: tagsRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });
    },
    { scope: tagsRef }
  );

  return (
    <SectionReveal from={from} id={id}>
      <section
        className={clsx(
          bgClass,
          "relative overflow-hidden min-h-screen flex flex-col justify-center py-[clamp(56px,10vh,110px)] px-[clamp(24px,5vw,64px)]"
        )}
      >
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Copy column */}
          <div className={clsx("flex flex-col", visualSide === "left" && "lg:order-2")}>
            <p className="eyebrow mb-6">{copy.label}</p>

            <h2
              className="font-display"
              style={{
                fontSize: "clamp(34px, 5vw, 68px)",
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
              }}
            >
              {copy.headline}
            </h2>

            {copy.subhead && (
              <p
                className={clsx("mt-5", subColor)}
                style={{ fontSize: "clamp(16px, 1.6vw, 20px)", lineHeight: 1.4 }}
              >
                {copy.subhead}
              </p>
            )}

            {copy.body && (
              <p
                className={clsx("mt-6 max-w-xl", bodyColor)}
                style={{ fontSize: "clamp(16px, 1.25vw, 18px)", lineHeight: 1.6 }}
              >
                {copy.body}
              </p>
            )}

            {copy.tags && copy.tags.length > 0 && (
              <div ref={tagsRef} className="mt-9 flex flex-wrap gap-3">
                {copy.tags.map((t) => (
                  <span
                    key={t}
                    data-pill
                    className={clsx(
                      "tag-pill",
                      isDark ? "text-paper-dim" : "text-ink/50"
                    )}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Visual column */}
          <div
            className={clsx(
              "relative w-full",
              visualClassName,
              visualSide === "left" && "lg:order-1"
            )}
          >
            {visual}
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
