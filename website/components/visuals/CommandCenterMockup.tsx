"use client";

import { motion } from "framer-motion";
import {
  Inbox,
  Calendar,
  Workflow,
  BarChart3,
  Sparkles,
  Smartphone,
} from "lucide-react";

/**
 * Custom CSS dashboard mockup + iPhone frame to the side. Apple-glass
 * treatment on both. No third-party UI lib, no CRM branding visible.
 */
export default function CommandCenterMockup() {
  return (
    <div className="relative w-full max-w-[640px] mx-auto">
      {/* Glow behind */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 30% 50%, rgba(232,93,4,0.18) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
      />

      {/* Dashboard panel */}
      <motion.div
        className="glass rounded-2xl p-5 aspect-[16/10] flex flex-col gap-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-signal" />
            <div className="w-2 h-2 rounded-full bg-paper-dim/40" />
            <div className="w-2 h-2 rounded-full bg-paper-dim/40" />
          </div>
          <span className="font-mono-accent text-[9px] uppercase tracking-[0.18em] text-paper-dim">
            Valdes Agency platform
          </span>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-3 gap-3 flex-1">
          {[
            { Icon: Inbox, label: "Inbox", count: "12 new" },
            { Icon: Calendar, label: "Calendar", count: "3 today" },
            { Icon: Workflow, label: "Flows", count: "8 live" },
            { Icon: BarChart3, label: "Reports", count: "Week 21" },
            { Icon: Sparkles, label: "AI", count: "Active" },
            { Icon: Smartphone, label: "Mobile", count: "Synced" },
          ].map(({ Icon, label, count }, i) => (
            <motion.div
              key={label}
              className="bg-ink-soft border border-white/5 rounded-lg p-2.5 flex flex-col justify-between"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
            >
              <Icon size={14} strokeWidth={1.5} className="text-signal" />
              <div>
                <div className="text-[10px] font-display uppercase text-paper">
                  {label}
                </div>
                <div className="text-[8px] font-mono-accent text-paper-dim uppercase tracking-wider">
                  {count}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer pulse */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="font-mono-accent text-[9px] uppercase tracking-[0.18em] text-paper-dim">
            All systems
          </span>
          <span className="flex items-center gap-2">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-power"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="font-mono-accent text-[9px] uppercase tracking-[0.18em] text-paper">
              Online
            </span>
          </span>
        </div>
      </motion.div>

      {/* iPhone frame, overlapping bottom-right */}
      <motion.div
        className="absolute -bottom-12 -right-4 sm:-right-8 w-[140px] sm:w-[180px] aspect-[9/19]"
        initial={{ opacity: 0, y: 30, rotate: 6 }}
        whileInView={{ opacity: 1, y: 0, rotate: 6 }}
        viewport={{ once: true, margin: "-80px" }}
        animate={{ rotate: [6, 2, 6] }}
        transition={{
          opacity: { duration: 0.7, delay: 0.4 },
          y: { duration: 0.7, delay: 0.4 },
          rotate: { duration: 8, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        {/* iPhone body */}
        <div className="relative w-full h-full rounded-[24px] bg-ink-soft border border-white/10 p-1.5 shadow-2xl">
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-3.5 rounded-full bg-ink z-10" />
          {/* Screen */}
          <div className="w-full h-full rounded-[18px] bg-ink overflow-hidden flex flex-col p-2.5 pt-6 gap-2">
            <div className="flex items-center justify-between">
              <span className="font-display uppercase text-[8px] text-paper">
                Valdes
              </span>
              <span className="w-1 h-1 rounded-full bg-power" />
            </div>
            {/* Lead cards */}
            {[
              { name: "S. Walker", note: "New lead, pool" },
              { name: "L. Cohen", note: "Replied, hot" },
              { name: "M. Ruiz", note: "Booked, 3pm" },
            ].map((l, i) => (
              <div
                key={i}
                className="bg-ink/80 border border-white/5 rounded-md p-2"
              >
                <div className="font-display uppercase text-[7px] text-paper">
                  {l.name}
                </div>
                <div className="font-mono-accent text-[6px] uppercase tracking-wider text-paper-dim mt-0.5">
                  {l.note}
                </div>
              </div>
            ))}
            <div className="flex-1" />
            {/* Tab bar */}
            <div className="flex justify-around border-t border-white/5 pt-1.5">
              <div className="w-1 h-1 rounded-full bg-signal" />
              <div className="w-1 h-1 rounded-full bg-paper-dim/30" />
              <div className="w-1 h-1 rounded-full bg-paper-dim/30" />
              <div className="w-1 h-1 rounded-full bg-paper-dim/30" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
