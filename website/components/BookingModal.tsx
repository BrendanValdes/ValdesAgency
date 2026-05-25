"use client";

import { useState, useEffect, type FormEvent } from "react";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "submitting" | "success" | "error";

export default function BookingModal({ open, onClose }: BookingModalProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStatus("idle");
        setErrorMsg("");
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          email: data.get("email"),
          phone: data.get("phone"),
          business: data.get("business"),
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Book a strategy call"
    >
      <div
        className="glass rounded-3xl p-8 sm:p-10 max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "success" ? (
          <div className="text-center space-y-5 py-6">
            <span className="power-dot inline-block" aria-hidden="true" />
            <h2 className="font-display text-3xl sm:text-4xl uppercase">Got it.</h2>
            <p className="text-paper">Brendan will call you within 24 hours.</p>
            <p className="text-paper-dim text-sm">
              hello@valdesagency.com &middot; 702.523.8826
            </p>
            <button
              onClick={onClose}
              className="mt-4 font-mono-accent uppercase text-xs tracking-[0.14em] text-paper-dim hover:text-paper transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl uppercase leading-none">
                  Book a strategy call
                </h2>
                <p className="text-paper-dim mt-2 text-sm">
                  30 minutes. Free. No pitch deck.
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-paper-dim hover:text-paper transition-colors text-2xl leading-none cursor-pointer"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  name="firstName"
                  required
                  placeholder="First name"
                  autoComplete="given-name"
                  className="bg-ink-soft border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper-dim focus:outline-none focus:border-signal transition-colors"
                />
                <input
                  name="lastName"
                  required
                  placeholder="Last name"
                  autoComplete="family-name"
                  className="bg-ink-soft border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper-dim focus:outline-none focus:border-signal transition-colors"
                />
              </div>
              <input
                name="email"
                type="email"
                required
                placeholder="Email"
                autoComplete="email"
                className="w-full bg-ink-soft border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper-dim focus:outline-none focus:border-signal transition-colors"
              />
              <input
                name="phone"
                type="tel"
                required
                placeholder="Phone"
                autoComplete="tel"
                className="w-full bg-ink-soft border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper-dim focus:outline-none focus:border-signal transition-colors"
              />
              <textarea
                name="business"
                rows={3}
                placeholder="What's your business? (optional)"
                className="w-full bg-ink-soft border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper-dim focus:outline-none focus:border-signal transition-colors resize-none"
              />
              {status === "error" && (
                <p className="text-signal text-sm">
                  {errorMsg || "Something went wrong. Try again."}
                </p>
              )}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="glass glass-hover w-full font-display uppercase tracking-[0.08em] text-sm py-4 rounded-full text-paper transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {status === "submitting" ? "Sending..." : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
