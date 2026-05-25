"use client";

/**
 * CSS/SVG MacBook frame with embedded pool-service mockup on screen.
 * Apple-glass treatment on the frame edge. No Spline runtime required.
 * Will be upgraded to a Spline community template if/when one is sourced.
 */
export default function MacBookFrame() {
  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      {/* MacBook body */}
      <div className="relative">
        {/* Lid */}
        <div className="glass-light rounded-[18px_18px_3px_3px] p-3 sm:p-4 shadow-2xl">
          {/* Screen */}
          <div
            className="relative rounded-[10px] overflow-hidden aspect-[16/10] bg-ink"
            style={{
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 30px rgba(0,0,0,0.4)",
            }}
          >
            {/* Pool service site mockup */}
            <PoolSiteMockup />
          </div>
        </div>
        {/* Base/hinge */}
        <div
          className="mx-auto"
          style={{
            width: "98%",
            height: "10px",
            background:
              "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #0a0a0a 100%)",
            borderRadius: "0 0 14px 14px",
            position: "relative",
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 top-0 rounded-full"
            style={{
              width: "16%",
              height: "3px",
              background: "rgba(0,0,0,0.5)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Embedded mock pool service site. Uses Valdes palette so it reads
 * intentional, not random. Hero photo replaced with a CSS gradient
 * mock since no Higgsfield credits burned here.
 */
function PoolSiteMockup() {
  return (
    <div className="absolute inset-0 flex flex-col bg-paper text-ink">
      {/* Mock top nav */}
      <div className="flex items-center justify-between px-4 py-2 text-[8px] sm:text-[10px] border-b border-ink/5">
        <div className="font-display uppercase tracking-tight">DESERT BLUE POOLS</div>
        <div className="flex gap-3 text-ink/60">
          <span>Services</span>
          <span>About</span>
          <span>Contact</span>
          <span className="text-signal font-medium">702-555-0199</span>
        </div>
      </div>

      {/* Mock hero */}
      <div
        className="relative flex-1 flex items-center px-4 py-4"
        style={{
          background:
            "linear-gradient(135deg, #0A0A0A 0%, #1a3a5c 50%, #4d9bd9 100%)",
        }}
      >
        <div className="text-paper space-y-2 max-w-[60%]">
          <div className="font-display uppercase text-[11px] sm:text-[14px] leading-tight">
            Vegas pools.<br />Done right.
          </div>
          <div className="text-[6px] sm:text-[8px] text-paper-dim">
            Weekly service. Repairs. Renovations.
          </div>
          <div
            className="inline-block bg-signal text-paper px-2 py-1 rounded text-[7px] sm:text-[9px] font-medium uppercase tracking-wide mt-2"
          >
            Get a quote
          </div>
        </div>
        {/* Pool icon shape */}
        <div
          aria-hidden
          className="absolute right-4 bottom-2 w-16 h-10 sm:w-24 sm:h-14 rounded-lg"
          style={{
            background:
              "radial-gradient(ellipse at center, #4d9bd9 0%, #1a3a5c 100%)",
            opacity: 0.7,
          }}
        />
      </div>

      {/* Mock card row */}
      <div className="grid grid-cols-3 gap-2 px-4 py-2 text-[6px] sm:text-[8px]">
        <div className="bg-ink/5 rounded p-1.5">
          <div className="font-medium text-ink">Weekly Service</div>
          <div className="text-ink/60 mt-0.5">From $89/mo</div>
        </div>
        <div className="bg-ink/5 rounded p-1.5">
          <div className="font-medium text-ink">Repairs</div>
          <div className="text-ink/60 mt-0.5">Same-day calls</div>
        </div>
        <div className="bg-ink/5 rounded p-1.5">
          <div className="font-medium text-ink">Renovations</div>
          <div className="text-ink/60 mt-0.5">Free quotes</div>
        </div>
      </div>
    </div>
  );
}
