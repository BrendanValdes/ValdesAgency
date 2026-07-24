import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  requireServerEnv,
  valdesCrmRequest,
} from "../../../../lib/server/valdes-crm/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CalendarRecord {
  id?: string;
  name?: string;
  slug?: string;
  calendarType?: string;
}

interface CalendarsResponse {
  calendars?: CalendarRecord[];
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

export async function GET(request: Request) {
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

    const locationId = requireServerEnv("GHL_LOCATION_ID");

    const result = await valdesCrmRequest<CalendarsResponse>(
      `/calendars/?locationId=${encodeURIComponent(locationId)}`,
      { method: "GET" }
    );

    const calendars = Array.isArray(result.calendars)
      ? result.calendars
      : [];

    return NextResponse.json({
      ok: true,
      connection: "Valdes Agency CRM connected",
      calendarCount: calendars.length,
      calendars: calendars.map((calendar) => ({
        id: calendar.id ?? null,
        name: calendar.name ?? null,
        slug: calendar.slug ?? null,
        type: calendar.calendarType ?? null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown CRM error";

    console.error("[api/retell/health]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Valdes Agency CRM connection failed",
        ...(process.env.NODE_ENV === "development"
          ? { details: message }
          : {}),
      },
      { status: 502 }
    );
  }
}
