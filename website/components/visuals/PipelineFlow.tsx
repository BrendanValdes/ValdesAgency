"use client";

import { motion } from "framer-motion";

/**
 * Vertical pipeline with droplets flowing top-to-bottom. CSS+FM fallback
 * for the planned R3F scene. Single column of "lead" droplets entering
 * at top, transforming into "booked" markers at the bottom.
 */
export default function PipelineFlow() {
  const droplets = Array.from({ length: 6 });

  return (
    <div className="relative w-full max-w-[420px] mx-auto h-[480px]">
      {/* The pipe rail */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.15) 12%, rgba(185,28,28,0.4) 50%, rgba(232,93,4,0.4) 88%, rgba(10,10,10,0) 100%)",
        }}
        aria-hidden
      />

      {/* Stage markers */}
      {[
        { y: "5%", label: "Click", color: "var(--ink)" },
        { y: "35%", label: "Captured", color: "var(--signal)" },
        { y: "65%", label: "Nurtured", color: "var(--signal)" },
        { y: "92%", label: "Booked", color: "var(--power)" },
      ].map((stage, i) => (
        <div
          key={i}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3"
          style={{ top: stage.y, transform: "translate(-50%, -50%)" }}
        >
          <span
            className="w-3 h-3 rounded-full ring-1 ring-ink/10"
            style={{
              background: stage.color,
              boxShadow:
                stage.color === "var(--power)"
                  ? "0 0 16px var(--power)"
                  : "0 0 10px rgba(185,28,28,0.4)",
            }}
          />
          <span
            className="font-mono-accent text-[10px] uppercase tracking-[0.18em] text-ink/60 whitespace-nowrap"
            style={{ position: "absolute", left: "calc(100% + 12px)" }}
          >
            {stage.label}
          </span>
        </div>
      ))}

      {/* Flowing droplets */}
      {droplets.map((_, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
          style={{
            background:
              "linear-gradient(180deg, var(--signal) 0%, var(--power) 100%)",
            boxShadow: "0 0 12px rgba(185,28,28,0.5)",
          }}
          initial={{ y: "-20px", opacity: 0 }}
          animate={{
            y: ["0%", "480px"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 4.5,
            delay: i * 0.75,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
