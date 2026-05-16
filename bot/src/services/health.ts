import { request } from "undici";
import { env } from "../env.js";

export type Status = "ok" | "down" | "unknown";

export interface ServiceStatus {
  name: string;
  status: Status;
  latencyMs?: number;
  detail?: string;
}

async function check(
  name: string,
  fn: () => Promise<void>,
  timeoutMs = 4000,
): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
    return { name, status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      name,
      status: "down",
      latencyMs: Date.now() - start,
      detail: String(err).slice(0, 80),
    };
  }
}

async function pingGhl(): Promise<void> {
  const res = await request(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${env.ghl.locationId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.ghl.token}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    },
  );
  await res.body.dump();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
}

async function pingAnthropic(): Promise<void> {
  const res = await request("https://api.anthropic.com/v1/models", {
    method: "GET",
    headers: {
      "x-api-key": env.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    },
  });
  await res.body.dump();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
}

export async function checkAllServices(): Promise<ServiceStatus[]> {
  return Promise.all([
    check("ghl", pingGhl),
    check("anthropic", pingAnthropic),
  ]);
}
