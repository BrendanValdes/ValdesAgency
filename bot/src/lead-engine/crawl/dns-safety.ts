import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  DnsResolver,
  ResolvedAddress,
  ResolvedDestination,
} from "./types.js";

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((octets[0] as number) * 256 + (octets[1] as number)) * 256 + (octets[2] as number)) * 256 + (octets[3] as number);
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const size = 2 ** (32 - prefix);
  return value >= base && value < base + size;
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<[number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function expandIpv6(address: string): number[] | null {
  let candidate = address.toLocaleLowerCase("en-US");
  if (candidate.includes("%")) return null;
  const ipv4Tail = candidate.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    candidate = candidate.slice(0, -ipv4Tail.length) + `${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = candidate.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const words = [...left, ...Array(missing).fill("0"), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  return words.map((word) => Number.parseInt(word, 16));
}

export function isBlockedIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = parseIpv4(address);
    return value === null || BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Range(value, base, prefix));
  }
  if (family !== 6) return true;
  const words = expandIpv6(address);
  if (!words) return true;
  if (words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
  const first = words[0] as number;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x2001 && words[1] === 0x0db8) return true;
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const nat64 = words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0);
  if (ipv4Mapped || nat64) {
    const ipv4 = (words[6] as number) * 65_536 + (words[7] as number);
    return BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Range(ipv4, base, prefix));
  }
  return false;
}

export const systemDnsResolver: DnsResolver = {
  async resolve(hostname) {
    if (isIP(hostname) === 4) return [{ address: hostname, family: 4 }];
    if (isIP(hostname) === 6) return [{ address: hostname, family: 6 }];
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((result) => ({ address: result.address, family: result.family as 4 | 6 }));
  },
};

export async function resolveSafeDestination(
  hostname: string,
  resolver: DnsResolver = systemDnsResolver,
): Promise<ResolvedDestination> {
  const results = await resolver.resolve(hostname);
  const unique = [...new Map(results.map((result) => [`${result.family}:${result.address}`, result])).values()]
    .sort((left, right) => `${left.family}:${left.address}`.localeCompare(`${right.family}:${right.address}`));
  if (unique.length === 0) throw new Error("DNS returned no addresses");
  for (const result of unique) {
    if ((result.family !== 4 && result.family !== 6) || isIP(result.address) !== result.family) {
      throw new Error("DNS returned a malformed address");
    }
    if (isBlockedIpAddress(result.address)) {
      throw new Error("DNS resolved to a blocked address");
    }
  }
  return { hostname, addresses: unique, selected: unique[0] as ResolvedAddress };
}

export function assertPinnedConnection(
  destination: ResolvedDestination,
  connectedAddress: string,
): void {
  if (connectedAddress !== destination.selected.address || isBlockedIpAddress(connectedAddress)) {
    throw new Error("Connected address does not match the validated pinned destination");
  }
}
