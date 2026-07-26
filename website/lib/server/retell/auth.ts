import { timingSafeEqual } from "node:crypto";

import { requireServerEnv } from "../valdes-crm/client";

export function hasValidIntegrationSecret(request: Request): boolean {
  const expectedRaw = requireServerEnv("RETELL_FUNCTION_SECRET");
  const providedRaw = request.headers.get("x-valdes-integration-secret");

  const expected = expectedRaw.trim();

  if (!providedRaw) {
    console.error("[retell-auth] rejected request", {
      reason: "header_missing",
      expectedLength: expected.length,
    });
    return false;
  }

  const provided = providedRaw.trim();

  const sameLength =
    Buffer.byteLength(expected) === Buffer.byteLength(provided);

  const valid =
    sameLength &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

  if (!valid) {
    console.error("[retell-auth] rejected request", {
      reason: "secret_mismatch",
      expectedLength: Buffer.byteLength(expected),
      providedLength: Buffer.byteLength(provided),
      whitespaceRemoved: providedRaw.length !== provided.length,
      startsWithQuote:
        providedRaw.startsWith('"') || providedRaw.startsWith("'"),
      endsWithQuote:
        providedRaw.endsWith('"') || providedRaw.endsWith("'"),
    });
  }

  return valid;
}

export function areAvaWritesEnabled(): boolean {
  return process.env.AVA_EXTERNAL_WRITES_ENABLED === "true";
}
