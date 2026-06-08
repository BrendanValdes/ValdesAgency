"use client";

import { motion } from "framer-motion";
import { TIMELINE } from "@/lib/copy";

/**
 * Section 9 — Timeline (light). Label + headline, then a 4-phase path.
 * Horizontal connector with numbered nodes on desktop; stacks to a
 * vertical list at 375px.
 */
export default function TimelineSection() {
  return (
    <section
      id="timeline"
      className="relative bg-paper text-ink overflow-hidden min-h-screen flex flex-col justify-center py-[clamp(56px,10vh,110px)] px-[clamp(24px,5vw,64px)]"
    >
      <div className="w-full max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <p className="eyebrow mb-6">{TIMELINE.label}</p>
          <h2
            className="font-display"
            style={{
              fontSize: "clamp(34px, 5vw, 68px)",
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
            }}
          >
            {TIMELINE.headline}
          </h2>
        </div>

        {/* Phases */}
        <div className="relative mt-[clamp(48px,8vh,88px)]">
          {/* Connector line (desktop) */}
          <div
            aria-hidden
            className="hidden md:block absolute top-5 left-0 right-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, var(--signal) 0%, var(--power) 100%)",
            }}
          />

          <ol className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-6">
            {TIMELINE.phases.map((phase, i) => (
              <motion.li
                key={phase.when}
                className="relative flex md:flex-col items-start gap-4 md:gap-0"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
              >
                {/* Node */}
                <span
                  className="relative z-10 flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-signal text-paper font-display text-sm"
                  style={{ boxShadow: "0 0 0 6px var(--paper)" }}
                >
                  {i + 1}
                </span>
                <div className="md:mt-6">
                  <div className="font-mono-accent text-[11px] uppercase tracking-[0.16em] text-signal">
                    {phase.when}
                  </div>
                  <div className="mt-1.5 font-display text-lg sm:text-xl text-ink leading-tight">
                    {phase.title}
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
