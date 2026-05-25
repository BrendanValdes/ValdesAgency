"use client";

import SectionReveal from "@/components/SectionReveal";
import GlassButton from "@/components/GlassButton";
import AnimatedHeadline from "@/components/AnimatedHeadline";
import SynergyBrain from "@/components/visuals/SynergyBrain";
import { useBooking } from "@/components/BookingProvider";
import { SECTION_10_SYNERGY, HERO } from "@/lib/copy";

/**
 * Section 10 — Synergy (CLIMAX)
 *
 * Dramatic black + neural network glow. 7-service nodes in a brain
 * formation rotating slowly. Headline above, descriptive sentence
 * below. Primary CTA — largest on the site. Secondary email + phone
 * CTAs below.
 */
export default function SynergySection() {
  const { open: openBooking } = useBooking();

  return (
    <SectionReveal from="right" id="synergy">
      <section className="relative bg-ink text-paper overflow-hidden min-h-screen flex flex-col justify-center py-[clamp(40px,8vh,80px)] px-[clamp(24px,5vw,64px)]">
        {/* Dramatic dual-color glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            top: "50%",
            left: "50%",
            width: "120vw",
            height: "120vw",
            maxWidth: 1600,
            maxHeight: 1600,
            background:
              "radial-gradient(circle at center, rgba(185,28,28,0.22) 0%, rgba(232,93,4,0.06) 40%, transparent 70%)",
            filter: "blur(120px)",
            transform: "translate(-50%, -50%)",
            zIndex: 0,
          }}
        />

        <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center text-center">
          <p className="font-mono-accent text-xs uppercase tracking-[0.18em] text-paper-dim mb-6">
            10 / Every system
          </p>

          <p className="font-mono-accent text-sm uppercase tracking-[0.2em] text-paper-dim mb-8">
            Every system feeds the others
          </p>

          {/* Brain visual */}
          <div className="my-8 sm:my-12 w-full">
            <SynergyBrain />
          </div>

          {/* Headline */}
          <AnimatedHeadline
            as="h2"
            text={SECTION_10_SYNERGY.headline}
            splitBy="word"
            stagger={0.08}
            className="font-display uppercase max-w-4xl mb-8"
          />
          <style>{`
            #synergy .reveal-part {
              font-size: clamp(36px, 6vw, 84px);
              line-height: 0.95;
              letter-spacing: -0.035em;
            }
          `}</style>

          {/* Descriptive sentence */}
          <p
            className="max-w-3xl text-paper"
            style={{ fontSize: "clamp(18px, 2.1vw, 26px)", lineHeight: 1.5 }}
          >
            {SECTION_10_SYNERGY.body}
          </p>

          {/* Primary CTA — LARGEST on site */}
          <div className="mt-12">
            <GlassButton variant="dark" size="large" onClick={openBooking}>
              {SECTION_10_SYNERGY.ctaLabel}
            </GlassButton>
          </div>

          {/* Secondary contact CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row gap-2 sm:gap-8 text-paper-dim text-sm">
            <a
              href={`mailto:${HERO.email}`}
              className="hover:text-signal transition-colors"
            >
              {HERO.email}
            </a>
            <span className="hidden sm:inline opacity-30">/</span>
            <a
              href={`tel:${HERO.phoneHref}`}
              className="hover:text-signal transition-colors"
            >
              {HERO.phone}
            </a>
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
