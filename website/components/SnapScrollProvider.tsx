"use client";

import { useEffect, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Snap-to-section page-flip behavior. Targets any element marked with
 * `data-snap-section`. Snap happens on scroll idle (after wheel pause),
 * with a 0.7s power2.out ease — feels like a premium magazine page-flip.
 *
 * Respects prefers-reduced-motion: skips snap entirely.
 *
 * Pause/resume via window event `valdes:snap-pause` / `valdes:snap-resume`
 * (BookingProvider fires these when the modal opens/closes).
 */
export default function SnapScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let trigger: ScrollTrigger | null = null;

    function setup() {
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-snap-section]")
      );
      if (sections.length === 0) return;

      const docHeight = () =>
        document.documentElement.scrollHeight - window.innerHeight;

      // Convert each section's top into a progress value
      const positions = () =>
        sections.map((s) => Math.max(0, s.offsetTop) / Math.max(1, docHeight()));

      trigger = ScrollTrigger.create({
        start: 0,
        end: "max",
        snap: {
          snapTo: (progress: number) => {
            const points = positions();
            return points.reduce(
              (closest, point) =>
                Math.abs(point - progress) < Math.abs(closest - progress)
                  ? point
                  : closest,
              points[0]
            );
          },
          duration: { min: 0.35, max: 0.75 },
          delay: 0.08,
          ease: "power2.out",
        },
      });
    }

    // Wait one frame so all sections render before measuring
    const id = requestAnimationFrame(() => {
      setup();
      ScrollTrigger.refresh();
    });

    // Pause/resume handlers (BookingModal fires these)
    function pause() {
      if (trigger) trigger.disable();
    }
    function resume() {
      if (trigger) trigger.enable();
    }
    window.addEventListener("valdes:snap-pause", pause);
    window.addEventListener("valdes:snap-resume", resume);

    // Re-measure on resize
    function onResize() {
      ScrollTrigger.refresh();
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("valdes:snap-pause", pause);
      window.removeEventListener("valdes:snap-resume", resume);
      window.removeEventListener("resize", onResize);
      if (trigger) trigger.kill();
    };
  }, []);

  return <>{children}</>;
}
