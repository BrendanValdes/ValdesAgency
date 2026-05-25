"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import clsx from "clsx";
import SectionReveal from "@/components/SectionReveal";
import GlassButton from "@/components/GlassButton";
import { useBooking } from "@/components/BookingProvider";
import type { SectionCopy } from "@/lib/copy";

gsap.registerPlugin(ScrollTrigger);

interface ServiceShellProps {
  id: string;
  number: string;
  copy: SectionCopy;
  visual: ReactNode;
  background: "ink" | "paper";
  from: "left" | "right";
  visualSide?: "left" | "right";
  visualClassName?: string;
}

/**
 * Reusable shell for Sections 3-9 (structurally similar service blocks).
 * Renders: section number + headline + subhead + body + bullet list + CTA,
 * with a visual slot on left or right. Background toggles ink (dark) or
 * paper (white) per the locked background-variety pattern.
 *
 * Sections wrap themselves in SectionReveal for the horizontal-feel entry.
 */
export default function ServiceShell({
  id,
  number,
  copy,
  visual,
  background,
  from,
  visualSide = "right",
  visualClassName,
}: ServiceShellProps) {
  const bulletsRef = useRef<HTMLUListElement>(null);
  const { open: openBooking } = useBooking();

  const isDark = background === "ink";
  const bgClass = isDark ? "bg-ink text-paper" : "bg-paper text-ink";
  const subColor = isDark ? "text-paper-dim" : "text-ink/60";
  const bodyColor = isDark ? "text-paper" : "text-ink";
  const numColor = isDark ? "text-paper-dim" : "text-ink/50";
  const ctaVariant = isDark ? "dark" : "light";

  useGSAP(
    () => {
      if (!bulletsRef.current) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const items = bulletsRef.current.querySelectorAll("li");
      if (reduce) {
        gsap.set(items, { opacity: 1, x: 0 });
        return;
      }
      gsap.from(items, {
        opacity: 0,
        x: -16,
        duration: 0.5,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: bulletsRef.current,
          start: "top 80%",
          toggleActions: "play none none reverse",
        },
      });
    },
    { scope: bulletsRef }
  );

  return (
    <SectionReveal from={from} id={id}>
      <section
        className={clsx(
          bgClass,
          "relative overflow-hidden min-h-screen flex flex-col justify-center py-[clamp(40px,8vh,80px)] px-[clamp(24px,5vw,64px)]"
        )}
      >
        <div
          className={clsx(
            "w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
          )}
        >
          {/* Copy column */}
          <div className={clsx("flex flex-col", visualSide === "left" && "lg:order-2")}>
            <p
              className={clsx(
                "font-mono-accent text-xs uppercase tracking-[0.18em] mb-6",
                numColor
              )}
            >
              {number}
            </p>

            <h2
              className="font-display uppercase"
              style={{
                fontSize: "clamp(36px, 5.5vw, 76px)",
                lineHeight: 0.95,
                letterSpacing: "-0.035em",
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
                style={{ fontSize: "clamp(15px, 1.2vw, 17px)", lineHeight: 1.6 }}
              >
                {copy.body}
              </p>
            )}

            {copy.bullets && copy.bullets.length > 0 && (
              <ul ref={bulletsRef} className={clsx("mt-8 space-y-3 max-w-xl")}>
                {copy.bullets.map((b, i) => (
                  <li
                    key={i}
                    className={clsx(
                      "flex gap-3 items-start text-sm sm:text-base",
                      bodyColor
                    )}
                  >
                    <span
                      className="flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-signal"
                      aria-hidden="true"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {copy.ctaLabel && (
              <div className="mt-10">
                <GlassButton variant={ctaVariant} onClick={openBooking}>
                  {copy.ctaLabel}
                </GlassButton>
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
