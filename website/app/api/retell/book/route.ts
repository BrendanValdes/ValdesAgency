import { NextResponse } from "next/server";

import {
  requireServerEnv,
  ValdesCrmError,
  valdesCrmRequest,
} from "../../../../lib/server/valdes-crm/client";
import {
  areAvaWritesEnabled,
  hasValidIntegrationSecret,
} from "../../../../lib/server/retell/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPOINTMENT_DURATION_MINUTES = 30;
const MAXIMUM_ADVANCE_DAYS = 14;

interface BookRequest {
  contact_id?: unknown;
  start_time?: unknown;
  timezone?: unknown;
}

interface AppointmentRecord {
  id?: string;
  calendarId?: string;
  contactId?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
}

interface CreateAppointmentResponse {
  appointment?: AppointmentRecord;
  id?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function collectSlots(value: unknown, output: string[]): void {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    if (Number.isFinite(Date.parse(value))) output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSlots(item, output));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectSlots(item, output));
  }
}

export async function POST(request: Request) {
  try {
    if (!hasValidIntegrationSecret(request)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!areAvaWritesEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ava appointment writes are currently disabled",
        },
        { status: 503 }
      );
    }

    let body: BookRequest;

    try {
      body = (await request.json()) as BookRequest;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const contactId = cleanString(body.contact_id, 100);
    const startTimeInput = cleanString(body.start_time, 100);
    const requestedTimezone = cleanString(body.timezone, 100);
    const timezone = isValidTimezone(requestedTimezone)
      ? requestedTimezone
      : "America/Los_Angeles";

    if (!contactId) {
      return NextResponse.json(
        { ok: false, error: "Contact ID is required" },
        { status: 400 }
      );
    }

    if (!startTimeInput) {
      return NextResponse.json(
        { ok: false, error: "Start time is required" },
        { status: 400 }
      );
    }

    const startTimestamp = Date.parse(startTimeInput);

    if (!Number.isFinite(startTimestamp)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Start time must be a valid ISO 8601 date and time",
        },
        { status: 400 }
      );
    }

    const now = Date.now();
    const maximumAdvanceTime =
      now + MAXIMUM_ADVANCE_DAYS * 24 * 60 * 60 * 1000;

    if (startTimestamp <= now) {
      return NextResponse.json(
        { ok: false, error: "Appointment time must be in the future" },
        { status: 400 }
      );
    }

    if (startTimestamp > maximumAdvanceTime) {
      return NextResponse.json(
        {
          ok: false,
          error: `Appointment must be within ${MAXIMUM_ADVANCE_DAYS} days`,
        },
        { status: 400 }
      );
    }

    const endTimestamp =
      startTimestamp +
      APPOINTMENT_DURATION_MINUTES * 60 * 1000;

    const locationId = requireServerEnv("GHL_LOCATION_ID");
    const calendarId = requireServerEnv("GHL_CALENDAR_ID");

    // Re-check the CRM calendar immediately before writing. The requested
    // timestamp must be one of GHL's live free slots; nearby is not sufficient.
    const availabilityQuery = new URLSearchParams({
      startDate: String(startTimestamp - 24 * 60 * 60 * 1000),
      endDate: String(startTimestamp + 24 * 60 * 60 * 1000),
      timezone,
    });
    const availability = await valdesCrmRequest<unknown>(
      `/calendars/${encodeURIComponent(calendarId)}/free-slots?${availabilityQuery.toString()}`,
      { method: "GET" },
    );
    const freeSlots: string[] = [];
    collectSlots(availability, freeSlots);
    if (!freeSlots.some((slot) => Date.parse(slot) === startTimestamp)) {
      return NextResponse.json(
        { ok: false, error: "That appointment time is no longer available. Please select another available time." },
        { status: 409 },
      );
    }

    const result =
      await valdesCrmRequest<CreateAppointmentResponse>(
        "/calendars/events/appointments",
        {
          method: "POST",
          body: JSON.stringify({
            calendarId,
            locationId,
            contactId,
            title:
              "Lead Conversion Call with Brendan | Valdes Agency",
            startTime: new Date(startTimestamp).toISOString(),
            endTime: new Date(endTimestamp).toISOString(),
            appointmentStatus: "confirmed",
            meetingLocationType: "gmeet",
            overrideLocationConfig: true,
            toNotify: true,
            ignoreDateRange: false,
            ignoreFreeSlotValidation: false,
          }),
        }
      );

    const appointment: AppointmentRecord = result.appointment ?? {
      id: result.id,
      startTime: result.startTime,
      endTime: result.endTime,
      appointmentStatus: result.appointmentStatus,
    };

    const appointmentId = appointment.id ?? result.id;

    if (!appointmentId) {
      throw new Error(
        "Valdes Agency CRM did not return an appointment ID"
      );
    }

    return NextResponse.json({
      ok: true,
      appointmentId,
      appointment: {
        contactId:
          appointment.contactId ?? contactId,
        calendarId:
          appointment.calendarId ?? calendarId,
        startTime:
          appointment.startTime ??
          new Date(startTimestamp).toISOString(),
        endTime:
          appointment.endTime ??
          new Date(endTimestamp).toISOString(),
        status:
          appointment.appointmentStatus ?? "confirmed",
      },
      message: "Strategy call successfully booked",
    });
  } catch (error) {
    if (
      error instanceof ValdesCrmError &&
      [400, 409, 422].includes(error.status)
    ) {
      console.error(
        "[api/retell/book] Booking rejected:",
        error.status,
        error.responseBody
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "That appointment time is no longer available. Please select another available time.",
        },
        { status: 409 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown booking error";

    console.error("[api/retell/book]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to book the strategy call",
        ...(process.env.NODE_ENV === "development"
          ? { details: message }
          : {}),
      },
      { status: 502 }
    );
  }
}
