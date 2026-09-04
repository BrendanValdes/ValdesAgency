"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, LoaderCircle, RefreshCw, X } from "lucide-react";
import { EMAIL_ERROR_MESSAGE, isValidEmail, normalizeEmail } from "@/lib/emailValidation";
import { PHONE_ERROR_MESSAGE, normalizeNanpPhone } from "@/lib/phoneValidation";
import styles from "./BookingModal.module.css";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
}

interface BookingDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  business: string;
}

interface AvailableDate {
  date: string;
  slots: string[];
}

interface AvailabilityResponse {
  dates?: AvailableDate[];
  error?: string;
}

interface BookingResponse {
  ok?: boolean;
  error?: string;
  code?: string;
}

interface AvaSchedulingContext {
  intent: "scheduling_alternative";
  timezone: string;
  firstName: string;
  businessName: string;
  email: string;
  phone: string;
  selectedDate?: string;
}

type Status = "idle" | "loading" | "submitting" | "success" | "error";
type Step = "details" | "schedule";
const DEFAULT_VISIBLE_SLOTS = 3;
const SLOT_BATCH_SIZE = 3;
const TIMEZONE_OPTIONS = [
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/New_York", label: "Eastern Time" },
];

function getVisitorTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function timezoneLabel(timezone: string) {
  const known = TIMEZONE_OPTIONS.find(({ value }) => value === timezone);
  if (known) return known.label;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longGeneric",
    }).formatToParts().find(({ type }) => type === "timeZoneName")?.value ?? timezone.replaceAll("_", " ");
  } catch {
    return timezone.replaceAll("_", " ");
  }
}

function calendarDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function formatDate(date: string, _timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(calendarDate(date));
}

function formatTime(slot: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slot));
}

function localMinutes(slot: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(slot));
  const hour = Number(parts.find(({ type }) => type === "hour")?.value ?? 0);
  const minute = Number(parts.find(({ type }) => type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function curateSlots(slots: string[], timezone: string) {
  const sorted = [...slots].sort((a, b) => Date.parse(a) - Date.parse(b));
  const selected: string[] = [];
  const take = (candidates: string[], score: (slot: string) => number) => {
    const choice = candidates
      .filter((slot) => !selected.includes(slot))
      .sort((a, b) => score(a) - score(b))[0];
    if (choice) selected.push(choice);
  };

  take(sorted.filter((slot) => localMinutes(slot, timezone) <= 8 * 60 + 30), (slot) => -localMinutes(slot, timezone));
  take(sorted.filter((slot) => {
    const minutes = localMinutes(slot, timezone);
    return minutes >= 11 * 60 + 30 && minutes <= 14 * 60 + 30;
  }), (slot) => Math.abs(localMinutes(slot, timezone) - 13 * 60));
  take(sorted.filter((slot) => localMinutes(slot, timezone) >= 15 * 60 + 30), (slot) => localMinutes(slot, timezone));

  while (selected.length < Math.min(DEFAULT_VISIBLE_SLOTS, sorted.length)) {
    take(sorted, (slot) => {
      const minutes = localMinutes(slot, timezone);
      return -Math.min(...selected.map((chosen) => Math.abs(minutes - localMinutes(chosen, timezone))));
    });
  }

  const remaining = sorted.filter((slot) => !selected.includes(slot));
  while (remaining.length) {
    const next = [...remaining].sort((a, b) => {
      const distance = (slot: string) => Math.min(...selected.map((chosen) => Math.abs(localMinutes(slot, timezone) - localMinutes(chosen, timezone))));
      return distance(b) - distance(a) || Date.parse(a) - Date.parse(b);
    })[0];
    selected.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return selected;
}

export default function BookingModal({ open, onClose }: BookingModalProps) {
  const [step, setStep] = useState<Step>("details");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [visibleSlotCount, setVisibleSlotCount] = useState(DEFAULT_VISIBLE_SLOTS);
  const [hasExpandedTimes, setHasExpandedTimes] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    setTimezone(getVisitorTimezone());

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

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep("details");
        setStatus("idle");
        setErrorMsg("");
        setDetails(null);
        setAvailableDates([]);
        setSelectedDate("");
        setSelectedSlot("");
        setVisibleSlotCount(DEFAULT_VISIBLE_SLOTS);
        setHasExpandedTimes(false);
        setEmailError("");
        setPhoneError("");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  function handleBackdropMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  async function loadAvailability(nextTimezone = getVisitorTimezone()) {
    setStatus("loading");
    setErrorMsg("");
    setSelectedSlot("");
    setVisibleSlotCount(DEFAULT_VISIBLE_SLOTS);
    setHasExpandedTimes(false);
    setTimezone(nextTimezone);

    try {
      const response = await fetch(`/api/book/availability?timezone=${encodeURIComponent(nextTimezone)}`, { cache: "no-store" });
      const payload = (await response.json()) as AvailabilityResponse;
      if (!response.ok) throw new Error(payload.error || "Available times could not be loaded. Please try again.");
      const dates = payload.dates ?? [];
      setAvailableDates(dates);
      setSelectedDate(dates[0]?.date ?? "");
      setStatus("idle");
      if (!dates.length) setErrorMsg("No times are currently available. Please check back soon.");
    } catch (error) {
      setAvailableDates([]);
      setSelectedDate("");
      setStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Available times could not be loaded. Please try again.");
    }
  }

  async function handleContinue() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const email = normalizeEmail(String(data.get("email") ?? ""));
    const phone = normalizeNanpPhone(String(data.get("phone") ?? ""));
    if (!isValidEmail(email)) {
      setEmailError(EMAIL_ERROR_MESSAGE);
      form.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
      return;
    }
    setEmailError("");
    if (!phone) {
      setPhoneError(PHONE_ERROR_MESSAGE);
      form.querySelector<HTMLInputElement>('input[name="phone"]')?.focus();
      return;
    }
    setPhoneError("");
    if (!form.reportValidity()) return;
    setDetails({
      firstName: String(data.get("firstName") ?? "").trim(),
      lastName: String(data.get("lastName") ?? "").trim(),
      email,
      phone,
      business: String(data.get("business") ?? "").trim(),
    });
    setStep("schedule");
    await loadAvailability(timezone);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === "details") {
      await handleContinue();
      return;
    }
    if (!details || !selectedSlot) {
      setErrorMsg("Choose an available time to continue.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, startTime: selectedSlot, timezone }),
      });
      const payload = (await response.json()) as BookingResponse;
      if (!response.ok) {
        if (payload.code === "INVALID_EMAIL") {
          setStatus("idle");
          setEmailError(payload.error || EMAIL_ERROR_MESSAGE);
          setStep("details");
          return;
        }
        if (payload.code === "INVALID_PHONE") {
          setStatus("idle");
          setPhoneError(payload.error || PHONE_ERROR_MESSAGE);
          setStep("details");
          return;
        }
        if (payload.code === "SLOT_UNAVAILABLE") {
          await loadAvailability(timezone);
          setErrorMsg(payload.error || "That time was just taken. Please choose another.");
          return;
        }
        throw new Error(payload.error || "We couldn't confirm your appointment. Please try again.");
      }
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  function handleAskAva() {
    if (!details) return;

    const context: AvaSchedulingContext = {
      intent: "scheduling_alternative",
      timezone,
      firstName: details.firstName,
      businessName: details.business,
      email: details.email,
      phone: details.phone,
      ...(selectedDate ? { selectedDate } : {}),
    };

    onClose();
    window.dispatchEvent(new CustomEvent<AvaSchedulingContext>("valdes:ava-open", { detail: context }));
  }

  const activeDate = availableDates.find(({ date }) => date === selectedDate);
  const curatedSlots = activeDate ? curateSlots(activeDate.slots, timezone) : [];
  const visibleSlots = curatedSlots.slice(0, visibleSlotCount);
  const hasMoreSlots = curatedSlots.length > visibleSlotCount;
  const isExpanded = visibleSlotCount > DEFAULT_VISIBLE_SLOTS;
  const timezoneOptions = TIMEZONE_OPTIONS.some(({ value }) => value === timezone)
    ? TIMEZONE_OPTIONS
    : [{ value: timezone, label: timezoneLabel(timezone) }, ...TIMEZONE_OPTIONS];

  return (
    <div className={styles.backdrop} onMouseDown={handleBackdropMouseDown} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div ref={dialogRef} className={styles.modal}>
        <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close booking form">
          <X size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>

        {status === "success" ? (
          <div className={styles.successPanel}>
            <div className={styles.successMark} aria-hidden="true"><Check size={26} strokeWidth={1.7} /></div>
            <p className={styles.kicker}>Appointment confirmed</p>
            <h2 id={titleId}>You’re all set.</h2>
            <p id={descriptionId} className={styles.successLead}>
              {formatDate(selectedDate, timezone)} at {formatTime(selectedSlot, timezone)}
            </p>
            <p className={styles.contactLine}>{timezoneLabel(timezone)} · hello@valdesagency.com</p>
            <button type="button" onClick={onClose} className={styles.doneButton}>Done <ArrowRight size={15} aria-hidden="true" /></button>
          </div>
        ) : (
          <div className={styles.bookingLayout}>
            <div className={styles.modalIntro}>
              <div>
                <p className={styles.kicker}><span aria-hidden="true" /> {step === "details" ? "01 / Your details" : "02 / Choose a time"}</p>
                <h2 id={titleId}>{step === "details" ? "Let’s find the best place to start." : "Choose a time that works."}</h2>
                <p id={descriptionId} className={styles.introCopy}>
                  {step === "details"
                    ? "Tell us a little about the business. Then choose a live time from our calendar."
                    : "These times come directly from our calendar and are shown in your local timezone."}
                </p>
              </div>
              <div className={styles.sessionDetails}>
                <div className={styles.detailIcon}>{step === "details" ? <Clock3 size={18} strokeWidth={1.6} aria-hidden="true" /> : <CalendarDays size={18} strokeWidth={1.6} aria-hidden="true" />}</div>
                <div><strong>30 minutes</strong><span>{step === "details" ? "Free. Direct. No pitch deck." : timezoneLabel(timezone)}</span></div>
              </div>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
              {step === "details" ? (
                <>
                  <div className={styles.nameRow}>
                    <label className={styles.field}><span>First name <small>Required</small></span><input ref={firstFieldRef} name="firstName" required maxLength={80} defaultValue={details?.firstName} placeholder="First name" autoComplete="given-name" /></label>
                    <label className={styles.field}><span>Last name <small>Required</small></span><input name="lastName" required maxLength={80} defaultValue={details?.lastName} placeholder="Last name" autoComplete="family-name" /></label>
                  </div>
                  <label className={styles.field}><span>Email <small>Required</small></span><input name="email" type="email" required maxLength={254} defaultValue={details?.email} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? `${titleId}-email-error` : undefined} onChange={() => emailError && setEmailError("")} onBlur={(event) => { event.currentTarget.value = normalizeEmail(event.currentTarget.value); }} placeholder="you@company.com" autoComplete="email" />{emailError && <small id={`${titleId}-email-error`} className={styles.fieldError} role="alert">{emailError}</small>}</label>
                  <label className={styles.field}><span>Phone <small>Required</small></span><input name="phone" type="tel" required maxLength={40} defaultValue={details?.phone} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? `${titleId}-phone-error` : undefined} onChange={() => phoneError && setPhoneError("")} onBlur={(event) => { const normalized = normalizeNanpPhone(event.currentTarget.value); event.currentTarget.value = normalized ?? event.currentTarget.value.trim(); }} placeholder="(555) 555-5555" autoComplete="tel" />{phoneError && <small id={`${titleId}-phone-error`} className={styles.fieldError} role="alert">{phoneError}</small>}</label>
                  <label className={styles.field}><span>Tell us about your business <small>Optional</small></span><textarea name="business" rows={3} maxLength={1500} defaultValue={details?.business} placeholder="Service area, growth goals, or where you would like more capacity" /></label>
                  <label className={styles.timezoneField}><span><small>Timezone</small><strong>{timezoneLabel(timezone)}</strong></span><select value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-label="Appointment timezone">{timezoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  {status === "error" && <p className={styles.errorMessage} role="alert">{errorMsg}</p>}
                  <button type="submit" className={styles.submitButton}><span>See available times</span><ArrowRight size={17} aria-hidden="true" /></button>
                  <p className={styles.formNote}>Your details stay private and are only used to arrange this call.</p>
                </>
              ) : (
                <div className={styles.scheduleStep}>
                  <div className={styles.scheduleControls}><button type="button" className={styles.backButton} onClick={() => { setStep("details"); setStatus("idle"); setErrorMsg(""); }}><ArrowLeft size={14} /> Edit your details</button><button type="button" className={styles.changeTimezone} onClick={() => { setStep("details"); setStatus("idle"); setErrorMsg(""); }}>Change timezone</button></div>
                  {status === "loading" ? (
                    <div className={styles.loadingPanel} role="status"><LoaderCircle size={22} className={styles.spinner} /><span>Checking the calendar…</span></div>
                  ) : (
                    <>
                      {availableDates.length > 0 && (
                        <>
                          <div className={styles.dateRail} aria-label="Available dates">
                            {availableDates.map(({ date }) => (
                              <button type="button" key={date} className={selectedDate === date ? styles.selectedDate : ""} aria-pressed={selectedDate === date} onClick={() => { setSelectedDate(date); setSelectedSlot(""); setVisibleSlotCount(DEFAULT_VISIBLE_SLOTS); setHasExpandedTimes(false); setErrorMsg(""); }}>
                                <small>{formatDate(date, timezone).split(",")[0]}</small><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(calendarDate(date))}</strong><span>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(calendarDate(date))}</span>
                              </button>
                            ))}
                          </div>
                          <div className={styles.slotHeader}><span>{formatDate(selectedDate, timezone)}</span><small>Times shown in {timezoneLabel(timezone)}</small></div>
                          <div className={styles.timeGrid} aria-label={`Available times for ${formatDate(selectedDate, timezone)}`}>
                            {visibleSlots.map((slot) => <button type="button" key={slot} className={selectedSlot === slot ? styles.selectedTime : ""} aria-pressed={selectedSlot === slot} onClick={() => { setSelectedSlot(slot); setErrorMsg(""); }}>{formatTime(slot, timezone)}{selectedSlot === slot && <Check size={14} />}</button>)}
                          </div>
                          {(hasMoreSlots || isExpanded) && <div className={styles.timesActions}>{hasMoreSlots && <button type="button" className={styles.timesToggle} aria-expanded={isExpanded} onClick={() => { setHasExpandedTimes(true); setVisibleSlotCount((count) => Math.min(count + SLOT_BATCH_SIZE, curatedSlots.length)); }}>See more times</button>}{isExpanded && <button type="button" className={styles.timesToggle} onClick={() => setVisibleSlotCount(DEFAULT_VISIBLE_SLOTS)}>Show fewer times</button>}</div>}
                          {hasExpandedTimes && (
                            <div className={styles.avaOption}>
                              <div>
                                <strong>Still need a different time?</strong>
                                <p>Ava can check for another option that may work.</p>
                              </div>
                              <button type="button" onClick={handleAskAva}>Ask Ava about another time <ArrowRight size={14} aria-hidden="true" /></button>
                            </div>
                          )}
                        </>
                      )}
                      {errorMsg && <p className={styles.errorMessage} role="alert">{errorMsg}</p>}
                      {!availableDates.length && <button type="button" className={styles.retryButton} onClick={() => loadAvailability(timezone)}><RefreshCw size={14} /> Refresh availability</button>}
                      {availableDates.length > 0 && <button type="submit" disabled={status === "submitting" || !selectedSlot} className={styles.submitButton}><span>{status === "submitting" ? "Confirming…" : "Confirm appointment"}</span><ArrowRight size={17} aria-hidden="true" /></button>}
                      <p className={styles.formNote}>Times are live and remain subject to availability until confirmed.</p>
                    </>
                  )}
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
