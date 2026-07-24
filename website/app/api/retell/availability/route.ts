import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  requireServerEnv,
  valdesCrmRequest,
} from "../../../../lib/server/valdes-crm/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AvailabilityRequest {
  timezone?: unknown;
  maxSlots?: unknown;
  startOffsetDays?: unknown;
  searchDays?: unknown;
}

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function clampInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function collectAppointmentSlots(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);

    if (
      Number.isFinite(timestamp) &&
      /^\d{4}-\d{2}-\d{2}T/.test(value)
    ) {
      output.push(value);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAppointmentSlots(item, output);
    }

    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectAppointmentSlots(item, output);
    }
  }
}

export async function POST(request: Request) {
  try {
    const expectedSecret = requireServerEnv("RETELL_FUNCTION_SECRET");
    const providedSecret = request.headers.get(
      "x-valdes-integration-secret"
    );

    if (!secretsMatch(providedSecret, expectedSecret)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: AvailabilityRequest = {};

    try {
      body = (await request.json()) as AvailabilityRequest;
    } catch {
      body = {};
    }

    const requestedTimezone =
      typeof body.timezone === "string"
        ? body.timezone.trim()
        : "";

    const timezone = isValidTimezone(requestedTimezone)
      ? requestedTimezone
      : "America/Los_Angeles";

    /*
     * By default, Ava looks two days ahead and searches the following
     * seven days. This supports offering two near-term appointment times
     * without claiming availability that has not been verified.
     */
    const startOffsetDays = clampInteger(
      body.startOffsetDays,
      2,
      0,
      14
    );

    const searchDays = clampInteger(body.searchDays, 7, 1, 14);
    const maxSlots = clampInteger(body.maxSlots, 6, 2, 10);

    const now = Date.now();
    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    const startDate =
      now + startOffsetDays * millisecondsPerDay;

    const endDate =
      startDate + searchDays * millisecondsPerDay;

    const calendarId = requireServerEnv("GHL_CALENDAR_ID");

    const query = new URLSearchParams({
      startDate: String(startDate),
      endDate: String(endDate),
      timezone,
    });

    const result = await valdesCrmRequest<unknown>(
      `/calendars/${encodeURIComponent(
        calendarId
      )}/free-slots?${query.toString()}`,
      { method: "GET" }
    );

    const collectedSlots: string[] = [];
    collectAppointmentSlots(result, collectedSlots);

    const slots = Array.from(new Set(collectedSlots))
      .filter((slot) => {
        const timestamp = Date.parse(slot);
        return Number.isFinite(timestamp) && timestamp > now;
      })
      .sort(
        (first, second) =>
          Date.parse(first) - Date.parse(second)
      )
      .slice(0, maxSlots)
      .map((startTime) => ({
        startTime,
        displayTime: new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
          timeZoneName: "short",
        }).format(new Date(startTime)),
      }));

    return NextResponse.json({
      ok: true,
      timezone,
      slotCount: slots.length,
      slots,
      searchRange: {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown availability error";

    console.error("[api/retell/availability]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to retrieve appointment availability",
        ...(process.env.NODE_ENV === "development"
          ? { details: message }
          : {}),
      },
      { status: 502 }
    );
  }
}
