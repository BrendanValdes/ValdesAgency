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

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  const containsSpokenSeparator =
    /\s+(?:at|dot)\s+/i.test(trimmed);

  let normalized = trimmed
    .toLowerCase()
    .replace(/\s+\bat\b\s+/gi, "@")
    .replace(/\s+\bdot\b\s+/gi, ".")
    .replace(/\s*([@.])\s*/g, "$1");

  const containsOnlySpelledWhitespace = normalized
    .split(/[@.]/)
    .every((segment) => {
      if (!/\s/.test(segment)) {
        return true;
      }

      return segment
        .trim()
        .split(/\s+/)
        .every((token) => /^[a-z0-9]$/.test(token));
    });

  if (
    containsSpokenSeparator &&
    containsOnlySpelledWhitespace &&
    /\s/.test(normalized)
  ) {
    const compacted = normalized.replace(/\s+/g, "");

    if (isValidEmail(compacted)) {
      normalized = compacted;
    }
  }

  return normalized;
}

function isValidEmail(value: string): boolean {
  if (
    !value ||
    value.length > 254 ||
    /\s/.test(value) ||
    value.includes("..")
  ) {
    return false;
  }

  const parts = value.split("@");

  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;

  if (
    !localPart ||
    localPart.length > 64 ||
    !domain ||
    !domain.includes(".") ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    domain.startsWith(".") ||
    domain.endsWith(".")
  ) {
    return false;
  }

  return true;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const startsWithPlus = trimmed.startsWith("+");

  if (
    (startsWithPlus && trimmed.slice(1).includes("+")) ||
    (!startsWithPlus && trimmed.includes("+"))
  ) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (startsWithPlus) {
    const internationalPhone = `+${digits}`;
    return /^\+[1-9]\d{6,14}$/.test(internationalPhone)
      ? internationalPhone
      : null;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
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
    const email = normalizeEmail(body.email);
    const rawPhone = cleanString(body.phone, 50);
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
        { ok: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (!rawPhone) {
      return NextResponse.json(
        { ok: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(rawPhone);

    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid phone number" },
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

    if (businessName) {
      await valdesCrmRequest(
        `/contacts/${encodeURIComponent(contactId)}/notes`,
        {
          method: "POST",
          apiVersion: "v3",
          body: JSON.stringify({
            body: `Website business context: ${businessName}`.slice(0, 1900),
          }),
        },
      );
    }

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

    console.error("[api/retell/contact] Unable to save contact", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

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
