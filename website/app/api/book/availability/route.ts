import { NextResponse } from "next/server";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const CALENDARS_API_VERSION = "v3";
const AVAILABILITY_DAYS = 21;

interface SlotGroup { slots?: unknown }

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeAvailability(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const root = "data" in payload && payload.data && typeof payload.data === "object" ? payload.data : payload;

  return Object.entries(root)
    .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map(([date, group]) => {
      const values = (group as SlotGroup)?.slots;
      const slots = Array.isArray(values)
        ? values.filter((slot): slot is string => typeof slot === "string" && Number.isFinite(Date.parse(slot)))
        : [];
      return { date, slots };
    })
    .filter(({ slots }) => slots.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const calendarId = process.env.GHL_CALENDAR_ID;
  const timezone = new URL(req.url).searchParams.get("timezone") ?? "";

  if (!token || !calendarId) {
    console.error("[availability] Configuration missing", { requestId, token: Boolean(token), calendarId: Boolean(calendarId) });
    return NextResponse.json({ error: "Scheduling is temporarily unavailable." }, { status: 503 });
  }
  if (!isTimezone(timezone)) {
    return NextResponse.json({ error: "A valid timezone is required." }, { status: 400 });
  }

  const startDate = Date.now();
  const endDate = startDate + AVAILABILITY_DAYS * 24 * 60 * 60 * 1_000;
  const params = new URLSearchParams({ startDate: String(startDate), endDate: String(endDate), timezone });

  try {
    const response = await fetch(`${GHL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/free-slots?${params}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, Version: CALENDARS_API_VERSION },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error("[availability] GHL availability failed", { requestId, status: response.status });
      return NextResponse.json({ error: "Available times could not be loaded. Please try again." }, { status: 502 });
    }

    const dates = normalizeAvailability(await response.json());
    return NextResponse.json({ dates, timezone });
  } catch (error) {
    console.error("[availability] GHL request failed", { requestId, reason: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Available times could not be loaded. Please try again." }, { status: 502 });
  }
}
