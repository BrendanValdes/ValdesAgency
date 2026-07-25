import { NextResponse } from "next/server";

import {
  requireServerEnv,
  valdesCrmRequest,
} from "../../../../lib/server/valdes-crm/client";
import {
  areAvaWritesEnabled,
  hasValidIntegrationSecret,
} from "../../../../lib/server/retell/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContactRequest {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  business_name?: unknown;
  channel?: unknown;
}

interface ContactRecord {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface UpsertContactResponse {
  contact?: ContactRecord;
  id?: string;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
          error: "Ava CRM writes are currently disabled",
        },
        { status: 503 }
      );
    }

    let body: ContactRequest;

    try {
      body = (await request.json()) as ContactRequest;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const firstName = cleanString(body.first_name, 100);
    const lastName = cleanString(body.last_name, 100);
    const email = cleanString(body.email, 254).toLowerCase();
    const phone = cleanString(body.phone, 50);
    const businessName = cleanString(body.business_name, 200);
    const channel = cleanString(body.channel, 30).toLowerCase();

    if (!firstName) {
      return NextResponse.json(
        { ok: false, error: "First name is required" },
        { status: 400 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "A valid email is required" },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    const locationId = requireServerEnv("GHL_LOCATION_ID");

    const source =
      channel === "chat"
        ? "Valdes Agency Website AI Chat"
        : "Valdes Agency AI Voice Receptionist";

    const result = await valdesCrmRequest<UpsertContactResponse>(
      "/contacts/upsert",
      {
        method: "POST",
        body: JSON.stringify({
          locationId,
          firstName,
          ...(lastName ? { lastName } : {}),
          email,
          phone,
          ...(businessName ? { companyName: businessName } : {}),
          source,
        }),
      }
    );

    const contact = result.contact ?? {};
    const contactId = contact.id ?? result.id;

    if (!contactId) {
      throw new Error(
        "Valdes Agency CRM did not return a contact ID"
      );
    }

    const tags = [
      "AI Lead",
      channel === "chat"
        ? "AI Chat Conversation"
        : "AI Voice Conversation",
    ];

    await valdesCrmRequest(
      `/contacts/${encodeURIComponent(contactId)}/tags`,
      {
        method: "POST",
        body: JSON.stringify({ tags }),
      }
    );

    return NextResponse.json({
      ok: true,
      contactId,
      contact: {
        firstName: contact.firstName ?? firstName,
        lastName: (contact.lastName ?? lastName) || null,
        email: contact.email ?? email,
        phone: contact.phone ?? phone,
        businessName: businessName || null,
      },
      tagsApplied: tags,
      message: "Contact saved in the Valdes Agency CRM",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown contact error";

    console.error("[api/retell/contact]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to save contact",
        ...(process.env.NODE_ENV === "development"
          ? { details: message }
          : {}),
      },
      { status: 502 }
    );
  }
}
