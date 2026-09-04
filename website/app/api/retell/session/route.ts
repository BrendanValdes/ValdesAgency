export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETELL_CREATE_WEB_CALL_URL =
  "https://api.retellai.com/v2/create-web-call";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Origin",
};

interface RetellWebCallResponse {
  access_token?: unknown;
  call_id?: unknown;
}

interface SessionContext {
  intent?: unknown;
  timezone?: unknown;
  firstName?: unknown;
  businessName?: unknown;
  email?: unknown;
  phone?: unknown;
  selectedDate?: unknown;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function sessionVariables(context: SessionContext): Record<string, string> {
  const intent = context.intent === "scheduling_alternative"
    ? "scheduling_alternative"
    : "general";
  const firstName = cleanString(context.firstName, 40);
  const openingFirstName = /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u.test(firstName)
    ? firstName
    : "";
  const values: Record<string, string> = {
    website_intent: intent,
    current_datetime_utc: new Date().toISOString(),
    opening_message: intent === "scheduling_alternative"
      ? openingFirstName
        ? `Hey ${openingFirstName}, I can help you find a better time. What day or time range would work best for you?`
        : "Hey, I can help you find a better time. What day or time range would work best for you?"
      : "Hey, this is Ava with Valdes Agency. What can I help you with today?",
    scheduling_context: intent === "scheduling_alternative"
      ? "Visitor needs another appointment time because the displayed options did not work."
      : "Visitor opened Ava from the Valdes Agency website.",
  };
  const optional = {
    visitor_timezone: cleanString(context.timezone, 100),
    visitor_first_name: cleanString(context.firstName, 100),
    business_description: cleanString(context.businessName, 1500),
    visitor_email: cleanString(context.email, 254).toLowerCase(),
    visitor_phone: cleanString(context.phone, 50),
    selected_date: cleanString(context.selectedDate, 20),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) values[key] = value;
  }
  return values;
}

function isValidAllowedOrigin(value: string): boolean {
  if (!value || value === "*" || value === "null") {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function getAllowedOrigins(): Set<string> | null {
  const rawOrigins = process.env.AVA_ALLOWED_ORIGINS;

  if (!rawOrigins?.trim()) {
    return null;
  }

  const origins = rawOrigins.split(",").map((origin) => origin.trim());

  if (origins.some((origin) => !isValidAllowedOrigin(origin))) {
    return null;
  }

  return new Set(origins);
}

function getApprovedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins();

  if (!origin || !allowedOrigins?.has(origin)) {
    return null;
  }

  return origin;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    ...NO_STORE_HEADERS,
    "Access-Control-Allow-Origin": origin,
  };
}

function jsonError(
  origin: string,
  status: number,
  error: string,
): Response {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: corsHeaders(origin),
    },
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const origin = getApprovedOrigin(request);

  if (!origin) {
    if (!getAllowedOrigins()) {
      console.error(
        "[api/retell/session] Invalid allowed-origins configuration",
      );
    }

    return Response.json(
      { ok: false, error: "Forbidden" },
      {
        status: 403,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const origin = getApprovedOrigin(request);

  if (!origin) {
    if (!getAllowedOrigins()) {
      console.error(
        "[api/retell/session] Invalid allowed-origins configuration",
      );
    }

    return Response.json(
      { ok: false, error: "Forbidden" },
      {
        status: 403,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  const apiKey = process.env.RETELL_API_KEY?.trim();
  const agentId = process.env.RETELL_AGENT_ID?.trim();

  if (!apiKey || !agentId) {
    console.error(
      "[api/retell/session] Missing required server configuration",
    );

    return jsonError(
      origin,
      503,
      "Call service is temporarily unavailable",
    );
  }

  let context: SessionContext = {};
  try {
    const body = (await request.json()) as { context?: SessionContext };
    if (body?.context && typeof body.context === "object") context = body.context;
  } catch {
    return jsonError(origin, 400, "Invalid request");
  }

  const dynamicVariables = sessionVariables(context);

  let retellResponse: Response;

  try {
    retellResponse = await fetch(RETELL_CREATE_WEB_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: agentId,
        metadata: {
          source: "valdes-agency-website",
          intent: dynamicVariables.website_intent,
          visitor_timezone: dynamicVariables.visitor_timezone,
        },
        retell_llm_dynamic_variables: dynamicVariables,
      }),
      cache: "no-store",
    });
  } catch {
    console.error(
      "[api/retell/session] Retell create-web-call request failed",
    );

    return jsonError(origin, 502, "Unable to start the call");
  }

  if (!retellResponse.ok) {
    console.error(
      "[api/retell/session] Retell create-web-call returned an error",
      { status: retellResponse.status },
    );

    return jsonError(origin, 502, "Unable to start the call");
  }

  let result: unknown;

  try {
    result = await retellResponse.json();
  } catch {
    console.error(
      "[api/retell/session] Retell create-web-call returned invalid JSON",
    );

    return jsonError(origin, 502, "Unable to start the call");
  }

  if (!result || typeof result !== "object") {
    console.error(
      "[api/retell/session] Retell create-web-call response was incomplete",
    );

    return jsonError(origin, 502, "Unable to start the call");
  }

  const webCall = result as RetellWebCallResponse;

  if (
    typeof webCall.access_token !== "string" ||
    !webCall.access_token.trim() ||
    typeof webCall.call_id !== "string" ||
    !webCall.call_id.trim()
  ) {
    console.error(
      "[api/retell/session] Retell create-web-call response was incomplete",
    );

    return jsonError(origin, 502, "Unable to start the call");
  }

  return Response.json(
    {
      ok: true,
      accessToken: webCall.access_token,
      callId: webCall.call_id,
    },
    {
      headers: corsHeaders(origin),
    },
  );
}
