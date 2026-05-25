"use client";

import { motion } from "framer-motion";
import { Heart, MessageCircle, Share2 } from "lucide-react";

/**
 * CSS+Framer Motion floating social post tile grid. Lightweight stand-in
 * for the planned R3F 3D scene — same metaphor, ~5kb vs ~200kb.
 */
const TILES = [
  { id: 1, type: "post", text: "Service truck rolling out at sunrise" },
  { id: 2, type: "carousel", text: "Before / After pool restoration" },
  { id: 3, type: "reel", text: "Quick tip: salt cell maintenance" },
  { id: 4, type: "story", text: "On-site at the Henderson property" },
  { id: 5, type: "post", text: "Customer review: 'They saved us'" },
  { id: 6, type: "carousel", text: "Weekly recap, 14 new bookings" },
];

export default function SocialTileGrid() {
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-3 p-3">
        {TILES.map((tile, i) => {
          const isAccent = i === 1 || i === 4; // 2 tiles get the signal-bordered look
          return (
            <motion.div
              key={tile.id}
              className="glass rounded-xl p-3 flex flex-col justify-between overflow-hidden"
              style={{
                borderColor: isAccent ? "var(--signal)" : undefined,
                borderWidth: isAccent ? "1px" : undefined,
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              animate={{
                y: [0, -3, 0],
              }}
              transition={{
                opacity: { duration: 0.4, delay: i * 0.08 },
                scale: { duration: 0.4, delay: i * 0.08 },
                y: {
                  duration: 4 + i * 0.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
            >
              <div className="text-[8px] text-paper-dim uppercase tracking-wider font-mono-accent">
                {tile.type}
              </div>
              <div className="text-[10px] sm:text-xs text-paper leading-tight line-clamp-3">
                {tile.text}
              </div>
              <div className="flex gap-2 text-paper-dim">
                <Heart size={10} strokeWidth={2} />
                <MessageCircle size={10} strokeWidth={2} />
                <Share2 size={10} strokeWidth={2} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
