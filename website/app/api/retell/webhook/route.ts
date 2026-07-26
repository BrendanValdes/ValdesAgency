import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type RetellCall = {
  call_id?: string;
  duration_ms?: number;
  disconnection_reason?: string;
  collected_dynamic_variables?: JsonRecord;
  retell_llm_dynamic_variables?: JsonRecord;
  metadata?: JsonRecord;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: JsonRecord;
  };
};

type RetellWebhookPayload = {
  event?: string;
  call?: RetellCall;
};

type CrmCustomField = {
  id: string;
  name?: string;
  fieldKey?: string;
  model?: string;
};

type CrmFieldValue = string | number | string[];

/**
 * Prevents immediate Retell retries from creating duplicate notes while this
 * Next.js process is running. Production deployment should eventually use
 * persistent storage for webhook idempotency.
 */
const processedEvents = new Set<string>();

let customFieldCache: CrmCustomField[] | null = null;
let customFieldCacheTimestamp = 0;

const CUSTOM_FIELD_CACHE_MS = 10 * 60 * 1000;

const FIELD_ALIASES: Record<string, string[]> = {
  industry: ["industry"],
  company_size: ["company size"],
  monthly_inbound_lead_volume: [
    "monthly inbound lead volume",
    "inbound lead volume",
  ],
  estimated_missed_calls_per_month: [
    "estimated missed calls per month",
    "missed calls per month",
  ],
  average_customer_value: ["average customer value"],
  current_crm: ["current crm"],
  current_lead_response_process: [
    "current lead response process",
    "lead response process",
  ],
  primary_problem: [
    "primary problem",
    "primary lead conversion problem",
  ],
  decision_maker_status: ["decision maker status"],
  implementation_timeframe: ["implementation timeframe"],
  qualification_score: [
    "qualification score",
    "ai qualification score",
  ],
  qualification_result: [
    "qualification result",
    "ai qualification result",
  ],
  qualification_reason: [
    "qualification reason",
    "ai qualification reason",
  ],
  appointment_booked: [
    "appointment booked",
    "ai appointment booked",
  ],
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function verifyRetellSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) {
    return false;
  }

  const match = /^v=(\d+),d=([a-f0-9]{64})$/i.exec(signature);

  if (!match) {
    return false;
  }

  const [, timestamp, providedDigest] = match;
  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  // Reject webhook signatures older than five minutes.
  if (Math.abs(Date.now() - timestampNumber) > 5 * 60 * 1000) {
    return false;
  }

  const expectedDigest = createHmac(
    "sha256",
    requireEnvironmentVariable("RETELL_API_KEY"),
  )
    .update(rawBody + timestamp)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedDigest, "hex");
  const providedBuffer = Buffer.from(providedDigest, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return undefined;
}

function displayValue(value: unknown): string | undefined {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return asString(value);
}

function toCrmFieldValue(value: unknown): CrmFieldValue | undefined {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (Array.isArray(value)) {
    const values = value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));

    return values.length > 0 ? values : undefined;
  }

  return undefined;
}

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function crmRequest(
  path: string,
  init: RequestInit = {},
  version?: string,
): Promise<unknown> {
  const baseUrl = (
    process.env.VALDES_CRM_API_BASE ??
    "https://services.leadconnectorhq.com"
  ).replace(/\/$/, "");

  const headers = new Headers(init.headers);

  headers.set(
    "Authorization",
    `Bearer ${requireEnvironmentVariable("GHL_PRIVATE_TOKEN")}`,
  );
  headers.set("Accept", "application/json");
  headers.set(
    "Version",
    version ??
      process.env.VALDES_CRM_API_VERSION?.trim() ??
      "2021-07-28",
  );

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Valdes Agency CRM request failed: ${response.status} ${responseText}`,
    );
  }

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

async function getContactCustomFields(): Promise<CrmCustomField[]> {
  const now = Date.now();

  if (
    customFieldCache &&
    now - customFieldCacheTimestamp < CUSTOM_FIELD_CACHE_MS
  ) {
    return customFieldCache;
  }

  const locationId = requireEnvironmentVariable("GHL_LOCATION_ID");

  const result = (await crmRequest(
    `/locations/${encodeURIComponent(
      locationId,
    )}/customFields?model=contact`,
    { method: "GET" },
    "v3",
  )) as { customFields?: CrmCustomField[] };

  customFieldCache = (result.customFields ?? []).filter(
    (field) => Boolean(field.id) && field.model !== "opportunity",
  );
  customFieldCacheTimestamp = now;

  return customFieldCache;
}

function findCustomField(
  fields: CrmCustomField[],
  aliases: string[],
): CrmCustomField | undefined {
  const normalizedAliases = aliases.map(normalizeFieldName);

  return fields.find((field) => {
    const names = [
      field.name,
      field.fieldKey?.replace(/^contact\./i, ""),
    ].filter((value): value is string => Boolean(value));

    return names.some((name) =>
      normalizedAliases.includes(normalizeFieldName(name)),
    );
  });
}

function formatNoteLine(
  label: string,
  value: unknown,
): string | undefined {
  const formatted = displayValue(value);

  return formatted ? `${label}: ${formatted}` : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-retell-signature");

  if (!verifyRetellSignature(rawBody, signature)) {
    console.error("[retell-webhook] Invalid signature");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let payload: RetellWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as RetellWebhookPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // We only need the completed post-call analysis event.
  if (payload.event !== "call_analyzed") {
    return new Response(null, { status: 204 });
  }

  const call = payload.call;
  const callId = call?.call_id;

  if (!call || !callId) {
    console.error("[retell-webhook] Missing call object or call ID");
    return new Response(null, { status: 204 });
  }

  const eventKey = `call_analyzed:${callId}`;

  if (processedEvents.has(eventKey)) {
    console.log("[retell-webhook] Duplicate event skipped", eventKey);
    return new Response(null, { status: 204 });
  }

  const analysis = call.call_analysis?.custom_analysis_data ?? {};

  const contactId =
    asString(call.collected_dynamic_variables?.crm_contact_id) ??
    asString(call.retell_llm_dynamic_variables?.crm_contact_id) ??
    asString(call.metadata?.crm_contact_id) ??
    asString(analysis.crm_contact_id);

  if (!contactId) {
    console.error("[retell-webhook] No crm_contact_id found", {
      callId,
      collectedVariableNames: Object.keys(
        call.collected_dynamic_variables ?? {},
      ),
    });

    // Acknowledge so Retell does not repeatedly send an event that cannot
    // currently be matched to a contact.
    return new Response(null, { status: 204 });
  }

  try {
    const fields = await getContactCustomFields();

    const customFields: Array<{
      id: string;
      fieldValue: CrmFieldValue;
    }> = [];

    for (const [analysisKey, aliases] of Object.entries(
      FIELD_ALIASES,
    )) {
      const fieldValue = toCrmFieldValue(analysis[analysisKey]);

      if (fieldValue === undefined) {
        continue;
      }

      const crmField = findCustomField(fields, aliases);

      if (!crmField) {
        console.warn(
          `[retell-webhook] Custom field not found for ${analysisKey}`,
        );
        continue;
      }

      customFields.push({
        id: crmField.id,
        fieldValue,
      });
    }

    const businessName = asString(analysis.business_name);

    const contactUpdate: Record<string, unknown> = {};

    if (businessName) {
      contactUpdate.companyName = businessName;
    }

    if (customFields.length > 0) {
      contactUpdate.customFields = customFields;
    }

    const summary = call.call_analysis?.call_summary;

    const noteLines = [
      "AVA POST-CALL SUMMARY",
      `Call ID: ${callId}`,
      formatNoteLine(
        "Call successful",
        call.call_analysis?.call_successful,
      ),
      formatNoteLine(
        "Caller sentiment",
        call.call_analysis?.user_sentiment,
      ),
      formatNoteLine(
        "Duration",
        call.duration_ms
          ? `${Math.round(call.duration_ms / 1000)} seconds`
          : undefined,
      ),
      formatNoteLine(
        "Disconnection reason",
        call.disconnection_reason,
      ),
      "",
      formatNoteLine("Summary", summary),
      "",
      "QUALIFICATION DETAILS",
      formatNoteLine("Business", analysis.business_name),
      formatNoteLine("Industry", analysis.industry),
      formatNoteLine("Company size", analysis.company_size),
      formatNoteLine(
        "Monthly inbound leads",
        analysis.monthly_inbound_lead_volume,
      ),
      formatNoteLine(
        "Estimated missed calls",
        analysis.estimated_missed_calls_per_month,
      ),
      formatNoteLine(
        "Average customer value",
        analysis.average_customer_value,
      ),
      formatNoteLine("Current CRM", analysis.current_crm),
      formatNoteLine(
        "Current lead-response process",
        analysis.current_lead_response_process,
      ),
      formatNoteLine(
        "Primary problem",
        analysis.primary_problem,
      ),
      formatNoteLine(
        "Decision-maker status",
        analysis.decision_maker_status,
      ),
      formatNoteLine(
        "Implementation timeframe",
        analysis.implementation_timeframe,
      ),
      formatNoteLine(
        "Qualification score",
        analysis.qualification_score,
      ),
      formatNoteLine(
        "Qualification result",
        analysis.qualification_result,
      ),
      formatNoteLine(
        "Qualification reason",
        analysis.qualification_reason,
      ),
      formatNoteLine(
        "Appointment booked",
        analysis.appointment_booked,
      ),
    ].filter(
      (line): line is string => typeof line === "string",
    );

    const noteBody = noteLines.join("\n").slice(0, 4900);

    const qualificationResult =
      displayValue(analysis.qualification_result)?.toLowerCase() ??
      "";

    const humanReviewRequired =
      call.call_analysis?.call_successful === false ||
      !qualificationResult ||
      qualificationResult.includes("review");

    const writeRequests: Promise<unknown>[] = [];

    if (Object.keys(contactUpdate).length > 0) {
      writeRequests.push(
        crmRequest(`/contacts/${encodeURIComponent(contactId)}`, {
          method: "PUT",
          body: JSON.stringify(contactUpdate),
        }),
      );
    }

    writeRequests.push(
      crmRequest(
        `/contacts/${encodeURIComponent(contactId)}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body: noteBody }),
        },
      ),
    );

    if (humanReviewRequired) {
      writeRequests.push(
        crmRequest(
          `/contacts/${encodeURIComponent(contactId)}/tags`,
          {
            method: "POST",
            body: JSON.stringify({
              tags: ["AI Human Review Required"],
            }),
          },
        ),
      );
    }

    await Promise.all(writeRequests);

    processedEvents.add(eventKey);

    if (processedEvents.size > 1000) {
      processedEvents.clear();
      processedEvents.add(eventKey);
    }

    console.log("[retell-webhook] Call analysis saved", {
      callId,
      contactId,
      customFieldCount: customFields.length,
      humanReviewRequired,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[retell-webhook] Processing failed", {
      callId,
      contactId,
      error:
        error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { ok: false, error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
