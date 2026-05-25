"use client";

import { motion } from "framer-motion";

/**
 * CSS+FM 2D node network. Lightweight stand-in for R3F. Represents the
 * CRM automation graph — leads, follow-up, calendar, deals.
 */
const NODES = [
  { id: "lead", label: "Lead in", cx: 50, cy: 18, accent: false },
  { id: "text", label: "Text", cx: 18, cy: 40, accent: false },
  { id: "call", label: "Call", cx: 82, cy: 40, accent: false },
  { id: "email", label: "Email", cx: 30, cy: 65, accent: false },
  { id: "calendar", label: "Calendar", cx: 70, cy: 65, accent: false },
  { id: "closed", label: "Closed", cx: 50, cy: 88, accent: true },
];

const EDGES = [
  ["lead", "text"],
  ["lead", "call"],
  ["lead", "email"],
  ["text", "calendar"],
  ["call", "calendar"],
  ["email", "calendar"],
  ["calendar", "closed"],
];

export default function NodeNetwork() {
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B91C1C" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#E85D04" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {EDGES.map(([from, to]) => {
          const fromNode = NODES.find((n) => n.id === from)!;
          const toNode = NODES.find((n) => n.id === to)!;
          return (
            <line
              key={`${from}-${to}`}
              x1={fromNode.cx}
              y1={fromNode.cy}
              x2={toNode.cx}
              y2={toNode.cy}
              stroke="url(#edge)"
              strokeWidth="0.25"
              strokeOpacity="0.5"
            />
          );
        })}
      </svg>

      {NODES.map((node, i) => (
        <motion.div
          key={node.id}
          className="absolute flex flex-col items-center gap-2"
          style={{
            left: `${node.cx}%`,
            top: `${node.cy}%`,
            transform: "translate(-50%, -50%)",
          }}
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: i * 0.12 }}
        >
          <motion.span
            className="w-3.5 h-3.5 rounded-full ring-1 ring-paper/20"
            style={{
              background: node.accent ? "var(--power)" : "var(--signal)",
              boxShadow: node.accent
                ? "0 0 18px var(--power)"
                : "0 0 12px rgba(185,28,28,0.6)",
            }}
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.85, 1, 0.85],
            }}
            transition={{
              duration: 2.5 + i * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <span className="font-mono-accent text-[9px] uppercase tracking-[0.14em] text-paper-dim whitespace-nowrap">
            {node.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
