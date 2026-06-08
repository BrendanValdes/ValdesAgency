"use client";

import { motion } from "framer-motion";
import { Phone, PhoneMissed } from "lucide-react";

/**
 * Section 4 (Never Miss a Lead) — dark-tone split: an incoming call on the
 * left, the automatic missed-call-text-back SMS thread on the right. Shows
 * Ava catching the lead the moment a call goes unanswered.
 */
const THREAD = [
  { from: "ava", text: "Hi! This is Ava at Desert Blue Pools. Sorry we missed your call. How can we help?" },
  { from: "them", text: "Need a quote for weekly cleaning" },
  { from: "ava", text: "Happy to help. What's the best address? I can have you booked today." },
  { from: "them", text: "412 Sagebrook Dr" },
  { from: "ava", text: "Perfect. You're booked for Thursday 2pm. Confirmation texted." },
];

export default function AvaSplitScreen() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto grid grid-cols-1 sm:grid-cols-[0.8fr_1fr] gap-4 items-center">
      {/* Glow */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 30% 50%, rgba(232,93,4,0.16) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
      />

      {/* Incoming / missed call card */}
      <motion.div
        className="glass rounded-2xl p-5 flex flex-col items-center text-center gap-3"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        <span className="font-mono-accent text-[10px] uppercase tracking-[0.16em] text-paper-dim">
          Missed call
        </span>
        <motion.span
          className="flex items-center justify-center w-14 h-14 rounded-full bg-signal text-paper"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <PhoneMissed size={22} strokeWidth={2} />
        </motion.span>
        <div className="text-paper font-display uppercase text-sm leading-tight">
          New caller
          <br />
          702-555-0147
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono-accent uppercase tracking-wide text-power">
          <Phone size={11} strokeWidth={2} />
          Auto text in 2s
        </div>
      </motion.div>

      {/* SMS thread */}
      <motion.div
        className="glass rounded-2xl p-4 flex flex-col gap-2.5"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        {THREAD.map((m, i) => (
          <motion.div
            key={i}
            className={
              m.from === "ava"
                ? "self-start max-w-[85%] bg-ink-soft border border-white/10 rounded-2xl rounded-tl-sm px-3 py-2"
                : "self-end max-w-[85%] bg-signal text-paper rounded-2xl rounded-tr-sm px-3 py-2"
            }
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.3 + i * 0.18 }}
          >
            <p className="text-[11px] leading-snug">{m.text}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
