"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import GlassButton from "@/components/GlassButton";
import { useBooking } from "@/components/BookingProvider";
import { HERO, CTA_LABEL } from "@/lib/copy";

/**
 * Section 1 — Hero
 *
 * Port of the holding page treatment + adds:
 *   - GSAP letter-by-letter wordmark reveal on mount
 *   - Glass "BOOK A FREE STRATEGY CALL" CTA below positioning
 *   - Animated scroll indicator at bottom
 *
 * Visual signature: black bg + radial red signal bleed from lower-right.
 * Single orange power moment on the "appointment" dot in the footer row.
 */
export default function HeroSection() {
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const positioningRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const { open: openBooking } = useBooking();

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".hero-letter", {
        opacity: 0,
        y: 40,
        duration: 0.7,
        stagger: 0.05,
      })
        .from(positioningRef.current, { opacity: 0, y: 20, duration: 0.6 }, "-=0.4")
        .from(ctaRef.current, { opacity: 0, y: 20, duration: 0.5 }, "-=0.3")
        .from(footerRef.current, { opacity: 0, y: 10, duration: 0.5 }, "-=0.2");
    },
    { scope: wordmarkRef }
  );

  return (
    <section
      ref={wordmarkRef}
      data-snap-section
      className="relative min-h-screen flex flex-col text-paper bg-ink overflow-hidden"
      style={{ padding: "clamp(24px, 5vw, 64px)" }}
    >
      {/* Red signal bleed from lower right */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: "50%",
          right: "-15vw",
          width: "70vw",
          height: "70vw",
          maxWidth: 1000,
          maxHeight: 1000,
          background:
            "radial-gradient(circle at center, var(--signal) 0%, transparent 60%)",
          opacity: 0.32,
          filter: "blur(90px)",
          transform: "translateY(-50%)",
          zIndex: 0,
        }}
      />

      <div className="relative z-10 flex flex-col flex-1 justify-between">
        {/* Top bar */}
        <header className="flex justify-between items-center text-xs uppercase tracking-[0.14em] text-paper-dim font-mono-accent">
          <span>{HERO.badge}</span>
          <span>{HERO.badgeRight}</span>
        </header>

        {/* Center wordmark + positioning + CTA */}
        <div className="flex flex-col py-[clamp(40px,8vh,140px)] max-w-[1100px]">
          <h1
            className="font-display uppercase"
            style={{
              fontSize: "clamp(56px, 13vw, 200px)",
              lineHeight: 0.88,
              letterSpacing: "-0.045em",
            }}
          >
            <span className="block">
              {Array.from(HERO.wordmarkTop).map((ch, i) => (
                <span key={`top-${i}`} className="hero-letter inline-block">
                  {ch}
                </span>
              ))}
            </span>
            <span className="block">
              {Array.from(HERO.wordmarkBottom).map((ch, i) => (
                <span key={`bot-${i}`} className="hero-letter inline-block">
                  {ch}
                </span>
              ))}
              <span className="hero-letter inline-block text-signal">.</span>
            </span>
          </h1>

          <p
            ref={positioningRef}
            className="mt-[clamp(28px,4vh,48px)] max-w-[760px] text-paper"
            style={{
              fontSize: "clamp(20px, 2.4vw, 30px)",
              lineHeight: 1.3,
              letterSpacing: "-0.005em",
            }}
          >
            {HERO.positioning}
          </p>

          <div ref={ctaRef} className="mt-10">
            <GlassButton
              variant="dark"
              size="large"
              onClick={openBooking}
              aria-label={CTA_LABEL}
            >
              {CTA_LABEL}
            </GlassButton>
          </div>
        </div>

        {/* Footer row */}
        <footer
          ref={footerRef}
          className="flex justify-between items-end flex-wrap gap-x-8 gap-y-5 text-[15px]"
        >
          <div className="flex flex-col gap-1.5">
            <a
              href={`mailto:${HERO.email}`}
              className="text-paper hover:text-signal transition-colors"
            >
              {HERO.email}
            </a>
            <a
              href={`tel:${HERO.phoneHref}`}
              className="text-paper hover:text-signal transition-colors"
            >
              {HERO.phone}
            </a>
          </div>
          <div className="text-paper-dim uppercase tracking-[0.16em] text-[11px] font-mono-accent font-medium flex items-center gap-3">
            <span className="power-dot" aria-hidden="true" />
            {HERO.appointmentText}
          </div>
        </footer>

        {/* Scroll indicator */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 bottom-6 text-paper-dim text-xs uppercase tracking-[0.2em] font-mono-accent flex flex-col items-center gap-2 animate-pulse"
          style={{ animationDuration: "2.5s" }}
        >
          <span>Scroll</span>
          <span className="block w-px h-8 bg-paper-dim" />
        </div>
      </div>
    </section>
  );
}
