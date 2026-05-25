"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis smooth scroll wrapper, coordinated with GSAP ScrollTrigger.
 *
 * Pattern: Lenis owns wheel smoothing on desktop. ScrollTrigger's snap +
 * scroll-triggered animations sync via Lenis's scroll event. On touch
 * devices Lenis falls back to native scroll, so our CSS scroll-snap-type
 * media query takes over there.
 *
 * Respects prefers-reduced-motion: skips Lenis entirely.
 */
export default function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
      // Touch falls back to native scroll (smoothTouch defaults to false in v1.x)
    });

    // Drive Lenis from GSAP's ticker so snap + scrubbed timelines stay synced
    function raf(time: number) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Forward Lenis scroll into ScrollTrigger so snap math uses Lenis's value
    lenis.on("scroll", ScrollTrigger.update);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
