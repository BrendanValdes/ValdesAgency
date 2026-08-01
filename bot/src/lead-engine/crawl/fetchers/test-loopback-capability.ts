export interface TestLoopbackCapability {
  readonly kind: "test_loopback_capability";
  readonly testScopeId: string;
  readonly allowedOrigin: string;
  readonly expiresAt: string;
}

interface TestLoopbackState {
  readonly testScopeId: string;
  readonly allowedOrigin: string;
  readonly expiresAtMs: number;
  readonly now: () => number;
}

const testLoopbackStates = new WeakMap<object, TestLoopbackState>();

function reject(code: string): never {
  throw Object.assign(new Error(`Test loopback capability rejected: ${code}`), {
    fetchCode: "policy_rejected" as const,
  });
}

function stateFor(
  capability: unknown,
  testScopeId: string,
): TestLoopbackState {
  if (process.env.NODE_ENV !== "test") reject("test_environment_required");
  if (!capability || typeof capability !== "object") reject("capability_missing");
  const state = testLoopbackStates.get(capability);
  if (!state) reject("capability_untrusted");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(testScopeId) ||
    state.testScopeId !== testScopeId) reject("scope_mismatch");
  if (state.now() >= state.expiresAtMs) reject("capability_expired");
  return state;
}

export function issueTestLoopbackCapability(input: {
  testScopeId: string;
  allowedOrigin: string;
  ttlMs?: number;
  now?: () => number;
}): TestLoopbackCapability {
  if (process.env.NODE_ENV !== "test") reject("test_environment_required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(input.testScopeId)) reject("scope_invalid");
  let origin: URL;
  try {
    origin = new URL(input.allowedOrigin);
  } catch {
    reject("origin_invalid");
  }
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    !origin.port || origin.username || origin.password || origin.pathname !== "/" ||
    origin.search || origin.hash || origin.href !== origin.origin + "/") {
    reject("origin_not_explicit_ipv4_loopback");
  }
  const port = Number(origin.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) reject("port_invalid");
  const ttlMs = input.ttlMs ?? 60_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 600_000) reject("ttl_invalid");
  const now = input.now ?? Date.now;
  const expiresAtMs = now() + ttlMs;
  const capability: TestLoopbackCapability = Object.freeze({
    kind: "test_loopback_capability",
    testScopeId: input.testScopeId,
    allowedOrigin: origin.origin,
    expiresAt: new Date(expiresAtMs).toISOString(),
  });
  testLoopbackStates.set(capability, {
    testScopeId: input.testScopeId,
    allowedOrigin: origin.origin,
    expiresAtMs,
    now,
  });
  return capability;
}

export function requireTestLoopbackOrigin(
  capability: unknown,
  testScopeId: string,
): URL {
  return new URL(stateFor(capability, testScopeId).allowedOrigin);
}

export function assertTestLoopbackRequest(
  capability: unknown,
  testScopeId: string,
  url: URL,
): void {
  const state = stateFor(capability, testScopeId);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
    url.origin !== state.allowedOrigin) {
    reject("destination_not_authorized");
  }
}
