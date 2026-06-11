// Composio REST v3 client — LinkedIn posting for Gate 5.
// ============================================================================
// Direct undici calls, no SDK (one endpoint family doesn't justify the dep).
// Tool slugs are the documented Composio LinkedIn toolkit slugs; the Gate 5
// self-check verifies LINKEDIN_CREATE_LINKED_IN_POST exists against the live
// API at boot, so slug drift surfaces in #content-valdes, not as a silent
// posting failure at slot time.
// ============================================================================

import { request } from "undici";
import { env } from "../env.js";
import { log } from "../logger.js";
import { getState, mutateState } from "./state.js";

const BASE = "https://backend.composio.dev/api/v3";
const TIMEOUT_MS = 30_000;

export const LINKEDIN_POST_TOOL = "LINKEDIN_CREATE_LINKED_IN_POST";
export const LINKEDIN_ME_TOOL = "LINKEDIN_GET_MY_INFO";

function apiKey(): string {
  const key = env.content.composioKey;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  return key;
}

async function composioGet(path: string): Promise<unknown> {
  const res = await request(`${BASE}${path}`, {
    method: "GET",
    headers: { "x-api-key": apiKey() },
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
  });
  const body = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`Composio GET ${path} → ${res.statusCode}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}

export async function listToolSlugs(toolkit: string): Promise<string[]> {
  const data = (await composioGet(
    `/tools?toolkit_slug=${encodeURIComponent(toolkit)}&limit=99`,
  )) as { items?: Array<{ slug?: string }> };
  return (data.items ?? []).map((t) => t.slug ?? "").filter((s) => s.length > 0);
}

export async function getConnectedAccount(id: string): Promise<{ status: string }> {
  const data = (await composioGet(`/connected_accounts/${encodeURIComponent(id)}`)) as {
    status?: string;
  };
  return { status: data.status ?? "UNKNOWN" };
}

export type ToolExecResult = {
  successful: boolean;
  data: Record<string, unknown>;
  error: string | null;
};

export async function executeTool(
  slug: string,
  connectedAccountId: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  const res = await request(`${BASE}/tools/execute/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify({ connected_account_id: connectedAccountId, arguments: args }),
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
  });
  const body = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`Composio execute ${slug} → ${res.statusCode}: ${body.slice(0, 300)}`);
  }
  const parsed = JSON.parse(body) as Partial<ToolExecResult>;
  return {
    successful: parsed.successful === true,
    data: (parsed.data as Record<string, unknown>) ?? {},
    error: parsed.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// LinkedIn posting
// ---------------------------------------------------------------------------

function extractAuthorUrn(data: Record<string, unknown>): string | null {
  // GET_MY_INFO responses expose the member id under response_dict.author_id
  // or a sub/id field depending on toolkit version. Try the known shapes.
  const flat = JSON.stringify(data);
  const urnMatch = flat.match(/urn:li:person:[A-Za-z0-9_-]+/);
  if (urnMatch) return urnMatch[0];
  const d = (data.response_dict ?? data) as Record<string, unknown>;
  const id = d.author_id ?? d.sub ?? d.id;
  return typeof id === "string" && id.length > 0 ? `urn:li:person:${id}` : null;
}

function extractShareUrn(data: Record<string, unknown>): string | null {
  const flat = JSON.stringify(data);
  const m = flat.match(/urn:li:(?:share|ugcPost|activity):[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}

export async function postToLinkedIn(
  body: string,
  connectedAccountId: string,
): Promise<{ postUrl: string | null }> {
  // Author URN bootstraps once, then lives in Gate 5 state.
  let urn = getState().linkedinAuthorUrn;
  if (!urn) {
    const me = await executeTool(LINKEDIN_ME_TOOL, connectedAccountId, {});
    if (!me.successful) {
      throw new Error(`LinkedIn get-my-info failed: ${me.error ?? "unknown error"}`);
    }
    const extracted = extractAuthorUrn(me.data);
    if (!extracted) {
      throw new Error(
        `Could not extract author URN from get-my-info response: ${JSON.stringify(me.data).slice(0, 200)}`,
      );
    }
    urn = extracted;
    await mutateState((s) => {
      s.linkedinAuthorUrn = extracted;
    });
    log.info("linkedin_author_urn_cached", { urn });
  }

  const result = await executeTool(LINKEDIN_POST_TOOL, connectedAccountId, {
    author: urn,
    commentary: body,
    visibility: "PUBLIC",
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
  if (!result.successful) {
    throw new Error(`LinkedIn post failed: ${result.error ?? "unknown error"}`);
  }

  const shareUrn = extractShareUrn(result.data);
  return { postUrl: shareUrn ? `https://www.linkedin.com/feed/update/${shareUrn}/` : null };
}
