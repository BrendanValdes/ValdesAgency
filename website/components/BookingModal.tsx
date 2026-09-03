"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { ArrowRight, Check, Clock3, X } from "lucide-react";
import styles from "./BookingModal.module.css";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "submitting" | "success" | "error";

export default function BookingModal({ open, onClose }: BookingModalProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => firstFieldRef.current?.focus());

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
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

  function handleBackdropMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

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
      className={styles.backdrop}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={dialogRef}
        className={styles.modal}
      >
        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close booking form"
        >
          <X size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>

        {status === "success" ? (
          <div className={styles.successPanel}>
            <div className={styles.successMark} aria-hidden="true">
              <Check size={26} strokeWidth={1.7} />
            </div>
            <p className={styles.kicker}>Request received</p>
            <h2 id={titleId}>You’re all set.</h2>
            <p id={descriptionId} className={styles.successLead}>Brendan will call you within 24 hours.</p>
            <p className={styles.contactLine}>
              hello@valdesagency.com &middot; 702.523.8826
            </p>
            <button
              type="button"
              onClick={onClose}
              className={styles.doneButton}
            >
              Done <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className={styles.bookingLayout}>
            <div className={styles.modalIntro}>
              <div>
                <p className={styles.kicker}><span aria-hidden="true" /> Focused working session</p>
                <h2 id={titleId}>Let’s find the best place to start.</h2>
                <p id={descriptionId} className={styles.introCopy}>
                  Tell us a little about the business. We’ll look at how opportunities come in, how they move, and what, if anything, would make the biggest difference.
                </p>
              </div>

              <div className={styles.sessionDetails}>
                <div className={styles.detailIcon}><Clock3 size={18} strokeWidth={1.6} aria-hidden="true" /></div>
                <div>
                  <strong>30 minutes</strong>
                  <span>Free. Direct. No pitch deck.</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.nameRow}>
                <label className={styles.field}>
                  <span>First name <small>Required</small></span>
                  <input
                    ref={firstFieldRef}
                    name="firstName"
                    required
                    placeholder="First name"
                    autoComplete="given-name"
                  />
                </label>
                <label className={styles.field}>
                  <span>Last name <small>Required</small></span>
                  <input
                    name="lastName"
                    required
                    placeholder="Last name"
                    autoComplete="family-name"
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>Email <small>Required</small></span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </label>

              <label className={styles.field}>
                <span>Phone <small>Required</small></span>
                <input
                  name="phone"
                  type="tel"
                  required
                  placeholder="(555) 555-5555"
                  autoComplete="tel"
                />
              </label>

              <label className={styles.field}>
                <span>Tell us about your business <small>Optional</small></span>
                <textarea
                  name="business"
                  rows={3}
                  placeholder="Service area, growth goals, or where you would like more capacity"
                />
              </label>

              {status === "error" && (
                <p className={styles.errorMessage} role="alert">
                  {errorMsg || "Something went wrong. Try again."}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className={styles.submitButton}
              >
                <span>{status === "submitting" ? "Sending request…" : "Find the best place to start"}</span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
              <p className={styles.formNote}>Your details stay private and are only used to arrange this call.</p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
