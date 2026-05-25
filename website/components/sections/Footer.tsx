"use client";

import { FOOTER, HERO } from "@/lib/copy";

export default function Footer() {
  return (
    <footer className="bg-ink text-paper py-16 sm:py-20 px-[clamp(24px,5vw,64px)] border-t border-white/5">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
        <div>
          <div
            className="font-display uppercase"
            style={{
              fontSize: "clamp(48px, 8vw, 96px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            {FOOTER.wordmark}
            <span className="text-signal">.</span>
          </div>
          <p className="mt-4 text-paper-dim text-sm max-w-md">{FOOTER.tagline}</p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
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
      </div>

      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row sm:justify-between gap-3 text-paper-dim text-xs uppercase tracking-[0.14em] font-mono-accent">
        <span>{FOOTER.copyright}</span>
        <span>
          Las Vegas / {FOOTER.year}
        </span>
      </div>
    </footer>
  );
}
