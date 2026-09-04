import { NextResponse } from "next/server";
import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import {
  EMAIL_ERROR_MESSAGE,
  emailDomain,
  isValidEmail,
  normalizeEmail,
} from "@/lib/emailValidation";
import { PHONE_ERROR_MESSAGE, normalizeNanpPhone } from "@/lib/phoneValidation";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const CONTACTS_API_VERSION = "2021-07-28";
const CONTACT_NOTES_API_VERSION = "v3";
const CALENDARS_API_VERSION = "v3";
const REQUEST_TIMEOUT_MS = 15_000;

interface BookRequest {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  business?: unknown;
  startTime?: unknown;
  timezone?: unknown;
}

interface ValidatedBooking {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  business?: string;
  startTime: string;
  timezone: string;
}

interface GhlContactResponse {
  contact?: { id?: string };
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validateBooking(body: BookRequest): { booking?: ValidatedBooking; error?: "email" | "phone" | "request" } {
  const firstName = text(body.firstName, 80);
  const lastName = text(body.lastName, 80);
  const rawEmail = text(body.email, 254);
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  const rawPhone = text(body.phone, 40);
  const business = body.business ? text(body.business, 1_500) ?? undefined : undefined;
  const startTime = text(body.startTime, 80);
  const timezone = text(body.timezone, 100);

  if (!firstName || !lastName || !email || !rawPhone || !startTime || !timezone) return { error: "request" };
  if (!isValidEmail(email)) return { error: "email" };
  const phone = normalizeNanpPhone(rawPhone);
  if (!phone) return { error: "phone" };
  if (!isTimezone(timezone)) return { error: "request" };

  const appointmentTime = Date.parse(startTime);
  const latestAllowed = Date.now() + 62 * 24 * 60 * 60 * 1_000;
  if (!Number.isFinite(appointmentTime) || appointmentTime <= Date.now() || appointmentTime > latestAllowed) return { error: "request" };

  return { booking: { firstName, lastName, email, phone, business, startTime, timezone } };
}

async function hasResolvableEmailDomain(email: string) {
  const domain = emailDomain(email);
  const isMissing = (error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return code === "ENOTFOUND" || code === "ENODATA";
  };
  const tryResolve = async (resolver: (hostname: string) => Promise<unknown>) => {
    try {
      await resolver(domain);
      return true;
    } catch (error) {
      return isMissing(error) ? false : null;
    }
  };

  const check = async () => {
    const mx = await tryResolve(resolveMx);
    if (mx === true || mx === null) return true;
    const [ipv4, ipv6] = await Promise.all([tryResolve(resolve4), tryResolve(resolve6)]);
    return ipv4 !== false || ipv6 !== false;
  };

  return Promise.race([
    check(),
    new Promise<true>((resolve) => setTimeout(() => resolve(true), 1_500)),
  ]);
}

function publicError(error: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

function isUnavailable(status: number, upstreamBody: string): boolean {
  if (status === 409) return true;
  if (status !== 400 && status !== 422) return false;
  return /slot|availab|conflict|overlap|booked/i.test(upstreamBody);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  const calendarId = process.env.GHL_CALENDAR_ID;

  if (!token || !locationId || !calendarId) {
    console.error("[book] Configuration missing", { requestId, token: Boolean(token), locationId: Boolean(locationId), calendarId: Boolean(calendarId) });
    return publicError("Online booking is temporarily unavailable. Please try again later.", "SERVICE_UNAVAILABLE", 503);
  }

  let rawBody: BookRequest;
  try {
    rawBody = (await req.json()) as BookRequest;
  } catch {
    return publicError("Please check your details and try again.", "INVALID_REQUEST", 400);
  }

  const validation = validateBooking(rawBody);
  if (validation.error === "email") {
    return publicError(EMAIL_ERROR_MESSAGE, "INVALID_EMAIL", 400);
  }
  if (validation.error === "phone") {
    return publicError(PHONE_ERROR_MESSAGE, "INVALID_PHONE", 400);
  }
  if (!validation.booking) {
    return publicError("Please complete all required fields and choose an available time.", "INVALID_REQUEST", 400);
  }
  const booking = validation.booking;
  if (!(await hasResolvableEmailDomain(booking.email))) {
    return publicError(EMAIL_ERROR_MESSAGE, "INVALID_EMAIL", 400);
  }

  const headers = (version: string) => ({
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    Version: version,
    "Content-Type": "application/json",
  });

  try {
    const contactResponse = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: "POST",
      headers: headers(CONTACTS_API_VERSION),
      body: JSON.stringify({
        firstName: booking.firstName,
        lastName: booking.lastName,
        email: booking.email,
        phone: booking.phone,
        locationId,
        source: "valdesagency.com",
        tags: ["website strategy call", "hot"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!contactResponse.ok) {
      console.error("[book] GHL contact upsert failed", { requestId, status: contactResponse.status });
      return publicError("We couldn't save your details right now. Please try again.", "CONTACT_FAILED", 502);
    }

    const contactData = (await contactResponse.json()) as GhlContactResponse;
    const contactId = contactData.contact?.id;
    if (!contactId) {
      console.error("[book] GHL contact response missing contact id", { requestId });
      return publicError("We couldn't save your details right now. Please try again.", "CONTACT_FAILED", 502);
    }

    if (booking.business) {
      try {
        const noteResponse = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/notes`, {
          method: "POST",
          headers: headers(CONTACT_NOTES_API_VERSION),
          body: JSON.stringify({ body: `Website booking context:\n${booking.business}` }),
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!noteResponse.ok) {
          console.warn("[book] GHL contact note creation failed", { requestId, status: noteResponse.status });
        }
      } catch (error) {
        console.warn("[book] GHL contact note request failed", {
          requestId,
          reason: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }

    const appointmentResponse = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
      method: "POST",
      headers: headers(CALENDARS_API_VERSION),
      body: JSON.stringify({
        title: `Strategy call — ${booking.firstName} ${booking.lastName}`,
        calendarId,
        locationId,
        contactId,
        startTime: booking.startTime,
        appointmentStatus: "confirmed",
        toNotify: true,
        ignoreFreeSlotValidation: false,
        ...(booking.business ? { description: `Business context: ${booking.business}` } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!appointmentResponse.ok) {
      const upstreamBody = await appointmentResponse.text();
      const unavailable = isUnavailable(appointmentResponse.status, upstreamBody);
      console.error("[book] GHL appointment creation failed", { requestId, status: appointmentResponse.status, unavailable });
      if (unavailable) {
        return publicError("That time was just taken. Please choose another available time.", "SLOT_UNAVAILABLE", 409);
      }
      return publicError("We couldn't confirm your appointment right now. Please try again.", "APPOINTMENT_FAILED", 502);
    }

    console.info("[book] Appointment created", { requestId, calendarId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[book] GHL request failed", { requestId, reason: error instanceof Error ? error.name : "UnknownError" });
    return publicError("Online booking is temporarily unavailable. Please try again.", "UPSTREAM_UNAVAILABLE", 502);
  }
}
