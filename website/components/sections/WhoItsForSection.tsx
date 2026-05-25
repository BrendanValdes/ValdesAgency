"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SectionReveal from "@/components/SectionReveal";
import GlassCard from "@/components/GlassCard";
import GlassButton from "@/components/GlassButton";
import AnimatedHeadline from "@/components/AnimatedHeadline";
import { useBooking } from "@/components/BookingProvider";
import { BUSINESS_TYPES } from "@/lib/businessTypes";
import { SECTION_2_WHO } from "@/lib/copy";

gsap.registerPlugin(ScrollTrigger);

/**
 * Section 2 — Who It's For
 *
 * PHASE 1 REVERT: rolled back to pre-rebuild state (GlassCard primitive,
 * 32px icons, left-aligned text). The Phase 2 premium rebuild will re-land
 * after Phase 1 snap verification passes.
 */
export default function WhoItsForSection() {
  const cardsRef = useRef<HTMLDivElement>(null);
  const { open: openBooking } = useBooking();

  useGSAP(
    () => {
      if (!cardsRef.current) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const cards = cardsRef.current.querySelectorAll("[data-card]");
      if (reduce) {
        gsap.set(cards, { opacity: 1, y: 0 });
        return;
      }
      gsap.from(cards, {
        opacity: 0,
        y: 24,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: cardsRef.current,
          start: "top 70%",
          toggleActions: "play none none reverse",
        },
      });
    },
    { scope: cardsRef }
  );

  return (
    <SectionReveal from="right" id="who-its-for">
      <section className="relative bg-ink text-paper overflow-hidden min-h-screen flex flex-col justify-center py-[clamp(40px,8vh,80px)] px-[clamp(24px,5vw,64px)]">
        {/* Subtle red atmospheric accent, lower right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            bottom: "-20vw",
            right: "-20vw",
            width: "60vw",
            height: "60vw",
            maxWidth: 800,
            maxHeight: 800,
            background:
              "radial-gradient(circle at center, var(--signal) 0%, transparent 65%)",
            opacity: 0.18,
            filter: "blur(100px)",
            zIndex: 0,
          }}
        />

        <div className="relative z-10 w-full max-w-6xl mx-auto">
          {/* Section number */}
          <p className="font-mono-accent text-xs uppercase tracking-[0.18em] text-paper-dim mb-6">
            02 / Who it&apos;s for
          </p>

          {/* Headline */}
          <h2
            className="font-display uppercase max-w-4xl"
            style={{
              fontSize: "clamp(40px, 7vw, 96px)",
              lineHeight: 0.95,
              letterSpacing: "-0.035em",
            }}
          >
            {SECTION_2_WHO.headline}
          </h2>

          {/* Subhead */}
          <p
            className="mt-6 max-w-2xl text-paper-dim"
            style={{ fontSize: "clamp(16px, 1.7vw, 20px)", lineHeight: 1.5 }}
          >
            {SECTION_2_WHO.subhead}
          </p>

          {/* 9 business cards */}
          <div
            ref={cardsRef}
            className="mt-14 grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5"
          >
            {BUSINESS_TYPES.map((biz) => {
              const Icon = biz.Icon;
              return (
                <div key={biz.id} data-card>
                  <GlassCard variant="dark" interactive className="aspect-[5/4] sm:aspect-square flex flex-col justify-between">
                    <Icon
                      size={32}
                      strokeWidth={1.5}
                      className="text-paper transition-colors"
                      aria-hidden="true"
                    />
                    <div className="font-display uppercase text-base sm:text-lg leading-tight">
                      {biz.label}
                    </div>
                  </GlassCard>
                </div>
              );
            })}
          </div>

          {/* Unifying banner */}
          <div className="mt-16 sm:mt-20 max-w-5xl">
            <AnimatedHeadline
              as="p"
              text={SECTION_2_WHO.body ?? ""}
              splitBy="word"
              stagger={0.12}
              className="font-display uppercase text-paper"
            />
            <style>{`
              #who-its-for .reveal-part {
                font-size: clamp(36px, 6vw, 80px);
                line-height: 1;
                letter-spacing: -0.03em;
              }
            `}</style>
          </div>

          {/* CTA */}
          <div className="mt-12">
            <GlassButton variant="dark" size="default" onClick={openBooking}>
              {SECTION_2_WHO.ctaLabel}
            </GlassButton>
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
