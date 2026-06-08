"use client";

import { useRef, useState, type FormEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  HERO,
  CONTACT,
  BUSINESS_TYPE_OPTIONS,
  BUDGET_OPTIONS,
  VIDEO_EMBED_URL,
} from "@/lib/copy";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Section 1 — Hero (light).
 *
 * Pill label, headline, subhead, a vertical (9:16) video placeholder, and
 * the qualify intake form. The form posts to /api/book (the same GHL
 * endpoint the rest of the site uses), extended with businessType + budget.
 */
export default function HeroSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [playing, setPlaying] = useState(false);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;
      gsap.from(".hero-reveal", {
        opacity: 0,
        y: 24,
        duration: 0.7,
        stagger: 0.12,
        ease: "power3.out",
      });
    },
    { scope: rootRef }
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.get("firstName"),
          phone: data.get("phone"),
          email: data.get("email"),
          businessType: data.get("businessType"),
          budget: data.get("budget"),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const inputClass =
    "w-full bg-paper border border-ink/15 rounded-xl px-4 py-3 text-ink placeholder:text-ink/40 focus:outline-none focus:border-signal transition-colors";

  return (
    <section
      ref={rootRef}
      className="relative bg-paper text-ink overflow-hidden flex flex-col items-center min-h-screen px-[clamp(24px,5vw,64px)] py-[clamp(48px,8vh,96px)]"
    >
      {/* Top bar */}
      <header className="w-full max-w-5xl flex justify-between items-center text-xs uppercase tracking-[0.14em] text-ink/50 font-mono-accent">
        <span>Valdes Agency</span>
        <a href={`tel:${CONTACT.phoneHref}`} className="hover:text-signal transition-colors">
          {CONTACT.phone}
        </a>
      </header>

      {/* Headline block */}
      <div className="w-full max-w-3xl text-center flex flex-col items-center mt-[clamp(32px,7vh,72px)]">
        <span className="hero-reveal inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 font-mono-accent text-[11px] uppercase tracking-[0.16em] text-ink/70">
          <span className="power-dot" aria-hidden="true" />
          {HERO.pill}
        </span>

        <h1
          className="hero-reveal font-display mt-7"
          style={{
            fontSize: "clamp(40px, 7vw, 92px)",
            lineHeight: 0.98,
            letterSpacing: "-0.04em",
          }}
        >
          {HERO.headline}
        </h1>

        <p
          className="hero-reveal mt-6 text-ink/60"
          style={{ fontSize: "clamp(18px, 2.2vw, 26px)", lineHeight: 1.3 }}
        >
          {HERO.subhead}
        </p>
      </div>

      {/* Video placeholder (vertical 9:16) */}
      <div className="hero-reveal w-full max-w-[340px] mt-[clamp(36px,6vh,64px)]">
        <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden glass-light">
          {playing && VIDEO_EMBED_URL ? (
            <iframe
              src={VIDEO_EMBED_URL}
              title={HERO.videoLabel}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={HERO.videoLabel}
              className="group absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer"
              style={{
                background:
                  "linear-gradient(160deg, #f5f5f5 0%, #e9e9e9 55%, #dcdcdc 100%)",
              }}
            >
              <span className="flex items-center justify-center w-16 h-16 rounded-full bg-signal text-paper shadow-lg transition-transform group-hover:scale-110">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="font-mono-accent text-[11px] uppercase tracking-[0.16em] text-ink/55 px-6 text-center">
                {HERO.videoLabel}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Intake form */}
      <div className="hero-reveal w-full max-w-md mt-[clamp(36px,6vh,64px)]">
        {status === "success" ? (
          <div className="text-center glass-light rounded-2xl p-8">
            <span className="power-dot inline-block mb-4" aria-hidden="true" />
            <h2 className="font-display text-3xl">{HERO.successHeadline}</h2>
            <p className="mt-3 text-ink/60">{HERO.successBody}</p>
            <p className="mt-4 font-mono-accent text-xs uppercase tracking-[0.14em] text-ink/45">
              {CONTACT.email}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              name="firstName"
              required
              placeholder="First name"
              autoComplete="given-name"
              className={inputClass}
            />
            <select name="businessType" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Business type
              </option>
              {BUSINESS_TYPE_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              name="phone"
              type="tel"
              required
              placeholder="Phone"
              autoComplete="tel"
              className={inputClass}
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              className={inputClass}
            />
            <select name="budget" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Monthly budget
              </option>
              {BUDGET_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            {status === "error" && (
              <p className="text-signal text-sm">
                {errorMsg || "Something went wrong. Try again."}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="mt-2 inline-flex items-center justify-center gap-3 rounded-full bg-signal text-paper font-display uppercase tracking-[0.08em] text-sm py-4 transition-all hover:bg-signal-deep disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {status === "submitting" ? "Sending..." : HERO.formCta}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
