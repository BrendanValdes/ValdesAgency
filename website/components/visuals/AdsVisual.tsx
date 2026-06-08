"use client";

import { motion } from "framer-motion";
import { Search, MapPin, Star } from "lucide-react";

/**
 * Section 3 (Be Everywhere) — light-tone mockup of a Google search ad +
 * a Meta feed ad card stacked, showing the business appearing in both
 * places a homeowner looks. CSS + Framer Motion, no heavy deps.
 */
export default function AdsVisual() {
  return (
    <div className="relative w-full max-w-[460px] mx-auto flex flex-col gap-5">
      {/* Glow behind */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 60% 40%, rgba(185,28,28,0.10) 0%, transparent 65%)",
          filter: "blur(50px)",
        }}
      />

      {/* Google search ad card */}
      <motion.div
        className="glass-light rounded-2xl p-5"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2 text-ink/50 mb-3">
          <Search size={13} strokeWidth={2} />
          <span className="font-mono-accent text-[10px] uppercase tracking-[0.16em]">
            pool service near me
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wide text-ink/70 border border-ink/20 rounded px-1.5 py-0.5">
            Ad
          </span>
          <span className="text-[10px] text-ink/50">desertbluepools.com</span>
        </div>
        <div className="text-signal font-display text-base mt-1.5 leading-tight">
          Desert Blue Pools. Same-Day Service
        </div>
        <div className="text-[11px] text-ink/60 mt-1 leading-snug">
          Weekly cleaning, repairs, renovations. Trusted by 400+ Vegas homes.
        </div>
        <div className="flex items-center gap-3 mt-2.5 text-[10px] text-ink/50">
          <span className="flex items-center gap-1">
            <Star size={10} fill="var(--power)" stroke="none" /> 4.9
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={10} strokeWidth={2} /> Las Vegas, NV
          </span>
        </div>
      </motion.div>

      {/* Meta feed ad card */}
      <motion.div
        className="glass-light rounded-2xl overflow-hidden"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-signal flex items-center justify-center text-paper font-display text-xs">
            DB
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-display text-ink">Desert Blue Pools</div>
            <div className="text-[9px] text-ink/45 font-mono-accent uppercase tracking-wide">
              Sponsored
            </div>
          </div>
        </div>
        <div
          className="h-28 flex items-end p-3"
          style={{
            background:
              "linear-gradient(135deg, #0A0A0A 0%, #1a3a5c 50%, #4d9bd9 100%)",
          }}
        >
          <span className="text-paper font-display uppercase text-sm leading-tight">
            Free quote in 60 seconds
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[10px] text-ink/55">Book your first clean</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-paper bg-signal rounded px-2.5 py-1">
            Learn more
          </span>
        </div>
      </motion.div>
    </div>
  );
}
