"use client";

import { motion } from "framer-motion";
import { FileText } from "lucide-react";

/**
 * Stacked report cards (fanning out) + a mini calendar with strategy
 * call dots. CSS/SVG, no 3D library.
 */
export default function ReportCalendar() {
  // Mock 5-week calendar with 2 strategy call days highlighted per month
  const weeks = Array.from({ length: 5 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => ({ w, d, day: w * 7 + d - 2 }))
  );

  return (
    <div className="relative w-full max-w-[520px] mx-auto flex flex-col items-center gap-8">
      {/* Stacked report cards */}
      <div className="relative w-full h-44 sm:h-52">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="glass-light absolute top-0 left-1/2 w-[78%] sm:w-[68%] aspect-[7/4] rounded-2xl p-5 flex flex-col justify-between"
            style={{
              transform: `translateX(calc(-50% + ${(i - 1) * 26}px)) rotate(${(i - 1) * 4}deg)`,
              zIndex: 3 - i,
            }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: i * 0.15 }}
          >
            <div className="flex items-center gap-2">
              <FileText size={14} strokeWidth={1.8} className="text-signal" />
              <span className="font-mono-accent text-[10px] uppercase tracking-[0.18em] text-ink/60">
                Week {i + 1} report
              </span>
            </div>
            <div className="text-xs sm:text-sm font-display uppercase text-ink leading-tight">
              Spend $940
              <br />
              <span className="text-signal">11 booked</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Mini calendar */}
      <div className="glass-light rounded-2xl p-4 sm:p-5 w-full max-w-[300px]">
        <div className="flex items-center justify-between mb-3">
          <span className="font-display uppercase text-xs text-ink">
            This month
          </span>
          <span className="font-mono-accent text-[10px] uppercase tracking-[0.18em] text-ink/50">
            2 strategy calls
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-mono-accent uppercase tracking-wide text-ink/40 mb-1.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weeks.flat().map(({ w, d, day }) => {
            const valid = day >= 1 && day <= 31;
            const isCall = day === 8 || day === 22;
            return (
              <div
                key={`${w}-${d}`}
                className="aspect-square flex items-center justify-center text-[10px] relative"
              >
                {valid && (
                  <>
                    <span
                      className={
                        isCall
                          ? "text-paper z-10"
                          : "text-ink/70"
                      }
                    >
                      {day}
                    </span>
                    {isCall && (
                      <motion.span
                        className="absolute inset-1 rounded-full"
                        style={{
                          background: "var(--signal)",
                          boxShadow: "0 0 8px rgba(185,28,28,0.6)",
                        }}
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
