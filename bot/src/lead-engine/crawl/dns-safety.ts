import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classifyIpAddress, sameIpAddress } from "./ip-safety.js";
import type {
  DnsResolver,
  ResolvedAddress,
  ResolvedDestination,
} from "./types.js";

export class DnsSafetyError extends Error {
  readonly code:
    | "resolver_failure"
    | "resolver_timeout"
    | "resolver_aborted"
    | "no_addresses"
    | "malformed_address"
    | "blocked_address";

  constructor(code: DnsSafetyError["code"], message: string) {
    super(message);
    this.name = "DnsSafetyError";
    this.code = code;
  }
}

export function isBlockedIpAddress(address: string): boolean {
  return !classifyIpAddress(address).allowed;
}

export const systemDnsResolver: DnsResolver = {
  async resolve(hostname) {
    if (isIP(hostname) === 4) return [{ address: hostname, family: 4 }];
    if (isIP(hostname) === 6) return [{ address: hostname, family: 6 }];
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((result) => ({ address: result.address, family: result.family as 4 | 6 }));
  },
};

async function resolveWithDeadline(
  hostname: string,
  resolver: DnsResolver,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<ReadonlyArray<ResolvedAddress>> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60_000) {
    throw new DnsSafetyError("resolver_timeout", "DNS timeout must be between one millisecond and one minute");
  }
  return await new Promise<ReadonlyArray<ResolvedAddress>>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => finish(() => reject(new DnsSafetyError("resolver_aborted", "DNS resolution was cancelled")));
    timer = setTimeout(
      () => finish(() => reject(new DnsSafetyError("resolver_timeout", "DNS resolution timed out"))),
      options.timeoutMs,
    );
    timer.unref?.();
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    void Promise.resolve()
      .then(() => resolver.resolve(hostname))
      .then(
        (answers) => finish(() => resolve(answers)),
        () => finish(() => reject(new DnsSafetyError("resolver_failure", "DNS resolution failed"))),
      );
  });
}

export async function resolveSafeDestination(
  hostname: string,
  resolver: DnsResolver = systemDnsResolver,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ResolvedDestination> {
  const results = await resolveWithDeadline(hostname, resolver, {
    timeoutMs: options.timeoutMs ?? 5_000,
    signal: options.signal,
  });
  const unique = new Map<string, ResolvedAddress>();
  for (const result of results) {
    const classification = classifyIpAddress(result.address);
    if ((result.family !== 4 && result.family !== 6) ||
      classification.family !== result.family || !classification.normalizedAddress) {
      throw new DnsSafetyError("malformed_address", "DNS returned a malformed address");
    }
    if (!classification.allowed) {
      throw new DnsSafetyError("blocked_address", `DNS resolved to a blocked ${classification.category} address`);
    }
    const normalized = { address: classification.normalizedAddress, family: result.family } as const;
    unique.set(`${normalized.family}:${normalized.address}`, normalized);
  }
  const addresses = [...unique.values()];
  if (addresses.length === 0) throw new DnsSafetyError("no_addresses", "DNS returned no addresses");
  return { hostname, addresses, selected: addresses[0] as ResolvedAddress };
}

export function assertPinnedConnection(
  destination: ResolvedDestination,
  connectedAddress: string,
): void {
  const selected = classifyIpAddress(destination.selected.address);
  const connected = classifyIpAddress(connectedAddress);
  const selectedWasApproved = selected.allowed && selected.family === destination.selected.family &&
    destination.addresses.some((address) => address.family === destination.selected.family &&
      sameIpAddress(address.address, destination.selected.address));
  if (!selectedWasApproved || !connected.allowed || connected.family !== destination.selected.family ||
    !sameIpAddress(connectedAddress, destination.selected.address)) {
    throw new Error("Connected address does not match the validated pinned destination");
  }
}
