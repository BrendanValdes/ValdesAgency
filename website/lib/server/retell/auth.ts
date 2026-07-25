import { timingSafeEqual } from "node:crypto";

import { requireServerEnv } from "../valdes-crm/client";

export function hasValidIntegrationSecret(request: Request): boolean {
  const expected = requireServerEnv("RETELL_FUNCTION_SECRET");
  const provided = request.headers.get("x-valdes-integration-secret");

  if (!provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function areAvaWritesEnabled(): boolean {
  return process.env.AVA_EXTERNAL_WRITES_ENABLED === "true";
}
