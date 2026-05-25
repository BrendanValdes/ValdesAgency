"use client";

import { motion } from "framer-motion";

/**
 * Central command node + ring of AI agent nodes connected by glowing
 * lines. Agents pulse on async timing. CSS+FM stand-in for the planned
 * R3F neural network. Premium dark aesthetic for the differentiator
 * section.
 */
const AGENTS = [
  { id: "leads", label: "Leads", angle: 270 },
  { id: "qualify", label: "Qualify", angle: 315 },
  { id: "book", label: "Book", angle: 0 },
  { id: "remind", label: "Remind", angle: 45 },
  { id: "report", label: "Report", angle: 90 },
  { id: "draft", label: "Draft", angle: 135 },
  { id: "nurture", label: "Nurture", angle: 180 },
  { id: "monitor", label: "Monitor", angle: 225 },
];

const RADIUS_PCT = 38;

export default function AgentConstellation() {
  return (
    <div className="relative w-full aspect-square max-w-[560px] mx-auto">
      {/* Central glow */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "60%",
          height: "60%",
          background:
            "radial-gradient(circle at center, rgba(185,28,28,0.3) 0%, transparent 60%)",
          filter: "blur(20px)",
        }}
        aria-hidden
      />

      {/* SVG connection lines */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <radialGradient id="agentEdge" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#B91C1C" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#B91C1C" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        {AGENTS.map((agent) => {
          const rad = (agent.angle * Math.PI) / 180;
          const x2 = 50 + Math.cos(rad) * RADIUS_PCT;
          const y2 = 50 + Math.sin(rad) * RADIUS_PCT;
          return (
            <line
              key={agent.id}
              x1={50}
              y1={50}
              x2={x2}
              y2={y2}
              stroke="url(#agentEdge)"
              strokeWidth="0.3"
              strokeOpacity="0.7"
            />
          );
        })}
      </svg>

      {/* Central command node */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
        initial={{ scale: 0.7, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="glass rounded-full"
          style={{
            width: 64,
            height: 64,
            background: "radial-gradient(circle at center, var(--signal) 0%, var(--signal-deep) 100%)",
            boxShadow: "0 0 40px rgba(185,28,28,0.6), 0 0 80px rgba(185,28,28,0.3)",
          }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="font-mono-accent text-[10px] uppercase tracking-[0.18em] text-paper">
          Command
        </span>
      </motion.div>

      {/* Agent nodes */}
      {AGENTS.map((agent, i) => {
        const rad = (agent.angle * Math.PI) / 180;
        const x = 50 + Math.cos(rad) * RADIUS_PCT;
        const y = 50 + Math.sin(rad) * RADIUS_PCT;
        // One agent gets the orange power-moment active state
        const isActiveAgent = agent.id === "book";
        return (
          <motion.div
            key={agent.id}
            className="absolute flex flex-col items-center gap-1.5"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
          >
            <motion.span
              className="rounded-full ring-1 ring-paper/15"
              style={{
                width: 22,
                height: 22,
                background: isActiveAgent ? "var(--power)" : "var(--signal)",
                boxShadow: isActiveAgent
                  ? "0 0 24px var(--power)"
                  : "0 0 14px rgba(185,28,28,0.5)",
              }}
              animate={{
                scale: [1, 1.18, 1],
                opacity: [0.85, 1, 0.85],
              }}
              transition={{
                duration: 2 + i * 0.4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.15,
              }}
            />
            <span className="font-mono-accent text-[9px] uppercase tracking-[0.14em] text-paper-dim whitespace-nowrap">
              {agent.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
