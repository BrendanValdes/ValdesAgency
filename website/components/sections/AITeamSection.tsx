"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SectionReveal from "@/components/SectionReveal";
import GlassButton from "@/components/GlassButton";
import AgentConstellation from "@/components/visuals/AgentConstellation";
import { useBooking } from "@/components/BookingProvider";
import { SECTION_7_AI_TEAM } from "@/lib/copy";

gsap.registerPlugin(ScrollTrigger);

/**
 * Section 7 — Your Own AI-Powered Team (DIFFERENTIATOR)
 *
 * Black with DEEPER red glow (heavier weight than other sections).
 * 5-6 bullets (expanded per spec). LARGER CTA than other sections.
 * Visual: CSS+FM agent constellation. Higgsfield atmospheric backdrop
 * lands here as Credit 1 after Brendan approves the prompt.
 */
export default function AITeamSection() {
  const bulletsRef = useRef<HTMLUListElement>(null);
  const { open: openBooking } = useBooking();

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
        stagger: 0.12,
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
    <SectionReveal from="right" id="ai-team">
      <section className="relative bg-ink text-paper overflow-hidden min-h-screen flex flex-col justify-center py-[clamp(40px,8vh,80px)] px-[clamp(24px,5vw,64px)]">
        {/* Deeper red glow — denser than other sections */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            top: "50%",
            left: "50%",
            width: "100vw",
            height: "100vw",
            maxWidth: 1400,
            maxHeight: 1400,
            background:
              "radial-gradient(circle at center, var(--signal) 0%, transparent 55%)",
            opacity: 0.25,
            filter: "blur(120px)",
            transform: "translate(-50%, -50%)",
            zIndex: 0,
          }}
        />
        {/* Optional Higgsfield backdrop slot — appears here if/when credit burns */}

        <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div>
            <p className="font-mono-accent text-xs uppercase tracking-[0.18em] text-paper-dim mb-6">
              07 / AI-powered team
            </p>
            <h2
              className="font-display uppercase"
              style={{
                fontSize: "clamp(40px, 6.2vw, 88px)",
                lineHeight: 0.92,
                letterSpacing: "-0.04em",
              }}
            >
              {SECTION_7_AI_TEAM.headline}
            </h2>
            {SECTION_7_AI_TEAM.subhead && (
              <p
                className="mt-5 text-paper-dim max-w-xl"
                style={{ fontSize: "clamp(16px, 1.6vw, 22px)", lineHeight: 1.4 }}
              >
                {SECTION_7_AI_TEAM.subhead}
              </p>
            )}
            {SECTION_7_AI_TEAM.body && (
              <p className="mt-6 text-paper max-w-xl text-base leading-relaxed">
                {SECTION_7_AI_TEAM.body}
              </p>
            )}
            <ul ref={bulletsRef} className="mt-8 space-y-3.5 max-w-xl">
              {SECTION_7_AI_TEAM.bullets?.map((b, i) => (
                <li
                  key={i}
                  className="flex gap-3 items-start text-base text-paper"
                >
                  <span
                    className="flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-signal"
                    aria-hidden
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-12">
              <GlassButton variant="dark" size="large" onClick={openBooking}>
                {SECTION_7_AI_TEAM.ctaLabel}
              </GlassButton>
            </div>
          </div>

          {/* Visual */}
          <div className="relative">
            <AgentConstellation />
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
