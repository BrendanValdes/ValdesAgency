import { request } from "undici";
import { env } from "../env.js";
import { log } from "../logger.js";

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

interface GhlPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export interface GhlOpportunity {
  id: string;
  name: string;
  monetaryValue?: number;
  status: string;
  pipelineId: string;
  pipelineStageId: string;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name?: string; email?: string };
}

async function ghlGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await request(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.ghl.token}`,
      Version: VERSION,
      Accept: "application/json",
    },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`GHL ${path} ${res.statusCode}: ${body.slice(0, 400)}`);
  }
  return (await res.body.json()) as T;
}

async function ghlPost<T>(path: string, body: unknown): Promise<T> {
  const res = await request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.ghl.token}`,
      Version: VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const text = await res.body.text();
    throw new Error(`GHL ${path} ${res.statusCode}: ${text.slice(0, 400)}`);
  }
  return (await res.body.json()) as T;
}

export async function getPipelines(): Promise<GhlPipeline[]> {
  const data = await ghlGet<{ pipelines?: GhlPipeline[] }>("/opportunities/pipelines", {
    locationId: env.ghl.locationId,
  });
  return data.pipelines ?? [];
}

export async function searchOpportunities(
  filters: { status?: string; pipelineId?: string; limit?: number } = {},
): Promise<GhlOpportunity[]> {
  const query: Record<string, string> = {
    location_id: env.ghl.locationId,
    limit: String(filters.limit ?? 100),
  };
  if (filters.status) query.status = filters.status;
  if (filters.pipelineId) query.pipeline_id = filters.pipelineId;
  const data = await ghlGet<{ opportunities?: GhlOpportunity[] }>(
    "/opportunities/search",
    query,
  );
  return data.opportunities ?? [];
}

export interface PipelineSnapshot {
  pipelineName: string;
  openCount: number;
  totalValue: number;
  byStage: { stage: string; count: number; value: number }[];
  newToday: number;
  newThisWeek: number;
  wonThisWeek: number;
  lostThisWeek: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildPipelineSnapshot(): Promise<PipelineSnapshot | null> {
  try {
    const pipelines = await getPipelines();
    if (pipelines.length === 0) {
      log.warn("ghl_no_pipelines");
      return null;
    }
    const pipeline = pipelines[0]!;
    const stageNames = new Map(pipeline.stages.map((s) => [s.id, s.name] as const));

    const opps = await searchOpportunities({ pipelineId: pipeline.id, limit: 100 });

    const today = isoDay(new Date());
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const open = opps.filter((o) => o.status === "open");
    const byStageMap = new Map<string, { count: number; value: number }>();
    for (const o of open) {
      const stage = stageNames.get(o.pipelineStageId) ?? "Unknown";
      const cur = byStageMap.get(stage) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += o.monetaryValue ?? 0;
      byStageMap.set(stage, cur);
    }
    const byStage = [...byStageMap.entries()].map(([stage, v]) => ({ stage, ...v }));

    return {
      pipelineName: pipeline.name,
      openCount: open.length,
      totalValue: open.reduce((sum, o) => sum + (o.monetaryValue ?? 0), 0),
      byStage,
      newToday: opps.filter((o) => o.createdAt.startsWith(today)).length,
      newThisWeek: opps.filter((o) => new Date(o.createdAt) >= weekAgo).length,
      wonThisWeek: opps.filter(
        (o) => o.status === "won" && new Date(o.updatedAt) >= weekAgo,
      ).length,
      lostThisWeek: opps.filter(
        (o) => o.status === "lost" && new Date(o.updatedAt) >= weekAgo,
      ).length,
    };
  } catch (err) {
    log.error("ghl_snapshot_failed", { err: String(err) });
    return null;
  }
}

export async function fireOnboardingWebhook(payload: Record<string, unknown>): Promise<void> {
  if (!env.ghl.onboardingWebhook || env.ghl.onboardingWebhook === "placeholder") {
    log.warn("onboarding_webhook_unset");
    return;
  }
  await ghlPost(env.ghl.onboardingWebhook, payload);
}
