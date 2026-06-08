"use client";

import { BOTTOM_CTA, CONTACT, CALENDLY_URL, FOOTER } from "@/lib/copy";

/**
 * Section 10 — Bottom CTA (dark) + footer. Red signal bleed behind the
 * headline. "Book Your Call" links to the Calendly placeholder (swap
 * CALENDLY_URL when the real link exists).
 */
export default function BottomCTASection() {
  return (
    <section
      id="book"
      className="relative bg-ink text-paper overflow-hidden flex flex-col justify-center min-h-screen px-[clamp(24px,5vw,64px)] py-[clamp(56px,10vh,110px)]"
    >
      {/* Red signal bleed */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          bottom: "-10vw",
          left: "50%",
          width: "80vw",
          height: "80vw",
          maxWidth: 1100,
          maxHeight: 1100,
          background:
            "radial-gradient(circle at center, var(--signal) 0%, transparent 60%)",
          opacity: 0.28,
          filter: "blur(100px)",
          transform: "translateX(-50%)",
        }}
      />

      <div className="relative z-10 w-full max-w-3xl mx-auto text-center flex flex-col items-center">
        <h2
          className="font-display"
          style={{
            fontSize: "clamp(38px, 6vw, 84px)",
            lineHeight: 1.0,
            letterSpacing: "-0.035em",
          }}
        >
          {BOTTOM_CTA.headline}
        </h2>

        <p
          className="mt-6 text-paper-dim"
          style={{ fontSize: "clamp(18px, 2.2vw, 24px)", lineHeight: 1.4 }}
        >
          {BOTTOM_CTA.subhead}
        </p>

        <a
          href={CALENDLY_URL}
          target={CALENDLY_URL.startsWith("http") ? "_blank" : undefined}
          rel={CALENDLY_URL.startsWith("http") ? "noopener noreferrer" : undefined}
          className="mt-10 inline-flex items-center justify-center gap-3 rounded-full bg-signal text-paper font-display uppercase tracking-[0.08em] text-base px-10 py-5 transition-all hover:bg-signal-deep cursor-pointer"
        >
          <span className="power-dot" aria-hidden="true" />
          {BOTTOM_CTA.buttonLabel}
        </a>
      </div>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto mt-[clamp(56px,12vh,120px)] flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-t border-white/10 pt-8">
        <div>
          <div className="font-display text-2xl">
            {FOOTER.wordmark}
            <span className="text-signal">.</span>
          </div>
          <p className="text-paper-dim text-sm mt-2 max-w-xs">{FOOTER.tagline}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm sm:text-right">
          <a
            href={`mailto:${CONTACT.email}`}
            className="text-paper hover:text-signal transition-colors"
          >
            {CONTACT.email}
          </a>
          <a
            href={`tel:${CONTACT.phoneHref}`}
            className="text-paper hover:text-signal transition-colors"
          >
            {CONTACT.phone}
          </a>
          <span className="text-paper-dim font-mono-accent text-[11px] uppercase tracking-[0.14em] mt-2">
            {FOOTER.copyright}
          </span>
        </div>
      </footer>
    </section>
  );
}
