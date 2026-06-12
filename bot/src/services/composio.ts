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

// Gate 6 — Instagram publishes in two calls (container → publish), Facebook
// in one. Verified against the live API 2026-06-12.
export const IG_CONTAINER_TOOL = "INSTAGRAM_CREATE_MEDIA_CONTAINER";
export const IG_PUBLISH_TOOL = "INSTAGRAM_CREATE_POST";
export const IG_ME_TOOL = "INSTAGRAM_GET_USER_INFO";
export const FB_PHOTO_POST_TOOL = "FACEBOOK_CREATE_PHOTO_POST";
export const FB_PAGES_TOOL = "FACEBOOK_GET_USER_PAGES";

/** Tool slugs the self-check verifies per platform present in slot_times. */
export const REQUIRED_TOOLS: Record<"linkedin" | "instagram" | "facebook", string[]> = {
  linkedin: [LINKEDIN_POST_TOOL],
  instagram: [IG_CONTAINER_TOOL, IG_PUBLISH_TOOL, IG_ME_TOOL],
  facebook: [FB_PHOTO_POST_TOOL, FB_PAGES_TOOL],
};

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
    user_id?: string;
  };
  // Cache the entity_id (user_id) so executeTool can include it without an extra round-trip.
  if (data.user_id) entityIdCache.set(id, data.user_id);
  return { status: data.status ?? "UNKNOWN" };
}

// entity_id (Composio "user_id") is required by some toolkits (IG, FB) at execute time.
// Fetched once per connection per process, then cached. Self-check populates this cache
// before any actual posting happens via the getConnectedAccount call above.
const entityIdCache = new Map<string, string>();

async function resolveEntityId(connectionId: string): Promise<string> {
  if (entityIdCache.has(connectionId)) return entityIdCache.get(connectionId)!;
  const data = (await composioGet(
    `/connected_accounts/${encodeURIComponent(connectionId)}`,
  )) as { user_id?: string };
  const id = data.user_id ?? "default";
  entityIdCache.set(connectionId, id);
  log.info("composio_entity_id_resolved", { connectionId, entityId: id });
  return id;
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
  const entityId = await resolveEntityId(connectedAccountId);
  const res = await request(`${BASE}/tools/execute/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify({ connected_account_id: connectedAccountId, entity_id: entityId, arguments: args }),
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

// ---------------------------------------------------------------------------
// Instagram posting (Gate 6) — two calls: media container → publish.
// The container id is returned so the scheduler can persist it and retry
// publish-only when IG's CDN hasn't finished processing the image.
// ---------------------------------------------------------------------------

/** Tolerant numeric-id extraction — Graph responses nest under response_dict
 *  or data depending on toolkit version. */
function extractGraphId(data: Record<string, unknown>): string | null {
  const d = (data.response_dict ?? data.data ?? data) as Record<string, unknown>;
  const id = d.id ?? d.creation_id ?? d.user_id;
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  if (typeof id === "number") return String(id);
  const m = JSON.stringify(data).match(/"(?:id|creation_id)"\s*:\s*"?(\d{5,})"?/);
  return m?.[1] ?? null;
}

/** True for IG's "media not ready yet" class of publish errors — the
 *  scheduler holds WITHOUT counting an attempt and retries next tick. */
export function isIgMediaNotReady(err: unknown): boolean {
  return /not (?:available|ready|finished)|2207027|media.{0,20}process/i.test(String(err));
}

async function getIgUserId(connectedAccountId: string): Promise<string> {
  const cached = getState().igUserId;
  if (cached) return cached;
  const me = await executeTool(IG_ME_TOOL, connectedAccountId, {});
  if (!me.successful) {
    throw new Error(`Instagram get-user-info failed: ${me.error ?? "unknown error"}`);
  }
  const id = extractGraphId(me.data);
  if (!id) {
    throw new Error(
      `Could not extract ig_user_id from get-user-info response: ${JSON.stringify(me.data).slice(0, 200)}`,
    );
  }
  await mutateState((s) => {
    s.igUserId = id;
  });
  log.info("ig_user_id_cached", { id });
  return id;
}

export async function postToInstagram(opts: {
  caption: string;
  imageUrl: string;
  connectedAccountId: string;
  /** Persisted container id from a prior attempt — skips container creation. */
  existingCreationId?: string;
}): Promise<{ postUrl: string | null; creationId: string }> {
  const igUserId = await getIgUserId(opts.connectedAccountId);

  let creationId = opts.existingCreationId;
  if (!creationId) {
    const container = await executeTool(IG_CONTAINER_TOOL, opts.connectedAccountId, {
      ig_user_id: igUserId,
      image_url: opts.imageUrl,
      caption: opts.caption,
      content_type: "photo",
    });
    if (!container.successful) {
      throw new Error(`Instagram media container failed: ${container.error ?? "unknown error"}`);
    }
    const extracted = extractGraphId(container.data);
    if (!extracted) {
      throw new Error(
        `Could not extract creation_id from container response: ${JSON.stringify(container.data).slice(0, 200)}`,
      );
    }
    creationId = extracted;
  }

  const publish = await executeTool(IG_PUBLISH_TOOL, opts.connectedAccountId, {
    ig_user_id: igUserId,
    creation_id: creationId,
  });
  if (!publish.successful) {
    const err = new Error(`Instagram publish failed: ${publish.error ?? "unknown error"}`);
    // Attach the container id so the caller can persist it before rethrowing.
    (err as Error & { creationId?: string }).creationId = creationId;
    throw err;
  }

  const mediaId = extractGraphId(publish.data);
  return {
    postUrl: mediaId ? `https://www.instagram.com/p/${mediaId}/` : null,
    creationId,
  };
}

// ---------------------------------------------------------------------------
// Facebook page posting (Gate 6) — single photo-post call.
// ---------------------------------------------------------------------------

async function getFbPageId(
  connectedAccountId: string,
  configuredPageId: string | undefined,
): Promise<string> {
  if (configuredPageId && configuredPageId !== "[set after connect]") return configuredPageId;
  const cached = getState().fbPageId;
  if (cached) return cached;
  const pages = await executeTool(FB_PAGES_TOOL, connectedAccountId, {});
  if (!pages.successful) {
    throw new Error(`Facebook get-user-pages failed: ${pages.error ?? "unknown error"}`);
  }
  const d = (pages.data.response_dict ?? pages.data.response_data ?? pages.data) as Record<string, unknown>;
  const list = (Array.isArray(d.data) ? d.data : []) as Array<{ id?: string; name?: string }>;
  const first = list[0];
  if (!first?.id) {
    throw new Error(
      `No Facebook pages on this connection — check page permissions in the Composio connect. Response: ${JSON.stringify(pages.data).slice(0, 200)}`,
    );
  }
  if (list.length > 1) {
    log.warn("fb_multiple_pages", {
      picked: first.id,
      names: list.map((p) => p.name ?? p.id),
      hint: "set accounts.facebook.page_id in valdes.yaml to override",
    });
  }
  await mutateState((s) => {
    s.fbPageId = first.id;
  });
  log.info("fb_page_id_cached", { id: first.id, name: first.name });
  return first.id;
}

export async function postToFacebook(opts: {
  message: string;
  imageUrl: string;
  connectedAccountId: string;
  configuredPageId?: string;
}): Promise<{ postUrl: string | null }> {
  const pageId = await getFbPageId(opts.connectedAccountId, opts.configuredPageId);
  const result = await executeTool(FB_PHOTO_POST_TOOL, opts.connectedAccountId, {
    page_id: pageId,
    url: opts.imageUrl,
    message: opts.message,
    published: true,
  });
  if (!result.successful) {
    throw new Error(`Facebook photo post failed: ${result.error ?? "unknown error"}`);
  }
  const d = (result.data.response_dict ?? result.data) as Record<string, unknown>;
  const postId = (d.post_id ?? d.id) as string | undefined;
  return { postUrl: postId ? `https://www.facebook.com/${postId}` : null };
}
