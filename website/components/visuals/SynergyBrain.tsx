"use client";

import { motion } from "framer-motion";
import {
  Monitor,
  Share2,
  Filter,
  Workflow,
  Sparkles,
  LayoutDashboard,
  CalendarCheck,
} from "lucide-react";

/**
 * 7 service nodes arranged in a circle with crossed connection lines
 * (every node connects to every other node — that's the "synergy"
 * metaphor). Each connection pulses with red/orange data. Glass
 * treatment on nodes. CSS+FM stand-in for the planned R3F brain.
 */
const SERVICES = [
  { id: "site", label: "Sites", Icon: Monitor, angle: 270 },
  { id: "social", label: "Social", Icon: Share2, angle: 322 },
  { id: "funnel", label: "Funnel", Icon: Filter, angle: 14 },
  { id: "crm", label: "Auto", Icon: Workflow, angle: 66 },
  { id: "ai", label: "AI", Icon: Sparkles, angle: 118 },
  { id: "cmd", label: "Center", Icon: LayoutDashboard, angle: 170 },
  { id: "report", label: "Report", Icon: CalendarCheck, angle: 222 },
];

const RADIUS_PCT = 38;

export default function SynergyBrain() {
  return (
    <div className="relative w-full max-w-[640px] aspect-square mx-auto">
      {/* Central network glow */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "85%",
          height: "85%",
          background:
            "radial-gradient(circle at center, rgba(185,28,28,0.18) 0%, transparent 60%)",
          filter: "blur(50px)",
        }}
      />

      {/* SVG: all pairwise connections */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id="brainEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#B91C1C" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#E85D04" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {SERVICES.map((from, i) =>
          SERVICES.slice(i + 1).map((to) => {
            const rf = (from.angle * Math.PI) / 180;
            const rt = (to.angle * Math.PI) / 180;
            const x1 = 50 + Math.cos(rf) * RADIUS_PCT;
            const y1 = 50 + Math.sin(rf) * RADIUS_PCT;
            const x2 = 50 + Math.cos(rt) * RADIUS_PCT;
            const y2 = 50 + Math.sin(rt) * RADIUS_PCT;
            return (
              <line
                key={`${from.id}-${to.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="url(#brainEdge)"
                strokeWidth="0.18"
                strokeOpacity="0.45"
              />
            );
          })
        )}
      </svg>

      {/* Slow rotating wrapper for the icon ring */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      >
        {SERVICES.map((s, i) => {
          const rad = (s.angle * Math.PI) / 180;
          const x = 50 + Math.cos(rad) * RADIUS_PCT;
          const y = 50 + Math.sin(rad) * RADIUS_PCT;
          const Icon = s.Icon;
          return (
            <motion.div
              key={s.id}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
            >
              {/* Counter-rotate icon so it doesn't spin upside down */}
              <motion.div
                className="glass rounded-full flex flex-col items-center justify-center gap-1"
                style={{ width: 64, height: 64 }}
                animate={{ rotate: -360 }}
                transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
              >
                <Icon
                  size={18}
                  strokeWidth={1.5}
                  className="text-signal"
                />
                <span className="font-mono-accent text-[7px] uppercase tracking-[0.18em] text-paper-dim">
                  {s.label}
                </span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
