import { NextResponse } from "next/server";

/**
 * Whitelabeled booking endpoint.
 *
 * Accepts a Valdes Agency strategy call request from the BookingModal form,
 * upserts the contact into our underlying CRM server-side, applies tags, and
 * fires a Discord notification to #outreach. The upstream call happens here
 * on the server so the browser never sees the CRM platform identity.
 *
 * Base URL is sourced from VALDES_CRM_API_BASE env var (kept out of source
 * for whitelabel hygiene). Defaults silently if missing.
 */

const CRM_API_BASE =
  process.env.VALDES_CRM_API_BASE ?? "https://services.leadconnectorhq.com";
const CRM_API_VERSION = process.env.VALDES_CRM_API_VERSION ?? "2021-07-28";

interface BookRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  business?: string;
}

export async function POST(req: Request) {
  let body: BookRequest;
  try {
    body = (await req.json()) as BookRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { firstName, lastName, email, phone, business } = body;

  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const token = process.env.GHL_PRIVATE_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    console.error("[book] Missing GHL_PRIVATE_TOKEN or GHL_LOCATION_ID env");
    return NextResponse.json(
      { error: "Booking temporarily unavailable" },
      { status: 503 }
    );
  }

  const tags = ["website strategy call request", "hot"];

  try {
    const crmRes = await fetch(`${CRM_API_BASE}/contacts/upsert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: CRM_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
        locationId,
        tags,
        source: "valdesagency.com",
      }),
    });

    if (!crmRes.ok) {
      const errText = await crmRes.text();
      console.error("[book] CRM upsert failed:", crmRes.status, errText);
      return NextResponse.json(
        { error: "Booking failed" },
        { status: 502 }
      );
    }

    // Fire-and-forget Discord notification (does not block the response)
    const webhookUrl = process.env.DISCORD_WEBHOOK_OUTREACH;
    if (webhookUrl) {
      void fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: [
            "**NEW STRATEGY CALL REQUEST — valdesagency.com**",
            `Name: ${firstName} ${lastName}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            business ? `Business: ${business}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      }).catch((e) => console.error("[book] Discord webhook failed:", e));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[book] Unexpected error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
