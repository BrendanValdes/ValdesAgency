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
        },
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
