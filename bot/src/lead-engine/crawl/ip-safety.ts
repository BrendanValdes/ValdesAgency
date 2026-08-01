import { isIP } from "node:net";

export type IpAddressCategory =
  | "public"
  | "invalid"
  | "unspecified"
  | "current_network"
  | "loopback"
  | "private"
  | "carrier_grade_nat"
  | "link_local"
  | "protocol_assignment"
  | "documentation"
  | "benchmarking"
  | "multicast"
  | "reserved"
  | "limited_broadcast"
  | "discard_only"
  | "unique_local"
  | "deprecated_site_local"
  | "translation"
  | "transition"
  | "special_use";

export interface IpAddressClassification {
  readonly family: 4 | 6 | null;
  readonly normalizedAddress: string | null;
  readonly allowed: boolean;
  readonly category: IpAddressCategory;
  readonly reason: string;
  readonly embeddedIpv4?: ReadonlyArray<IpAddressClassification>;
}

interface Ipv4Range {
  readonly base: number;
  readonly prefix: number;
  readonly category: Exclude<IpAddressCategory, "public" | "invalid" | "unspecified" | "limited_broadcast">;
  readonly reason: string;
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<Ipv4Range> = [
  { base: 0x00000000, prefix: 8, category: "current_network", reason: "IPv4 current-network space is not a public destination" },
  { base: 0x0a000000, prefix: 8, category: "private", reason: "IPv4 private-use space is not a public destination" },
  { base: 0x64400000, prefix: 10, category: "carrier_grade_nat", reason: "IPv4 shared carrier-grade NAT space is not a public destination" },
  { base: 0x7f000000, prefix: 8, category: "loopback", reason: "IPv4 loopback space is not a public destination" },
  { base: 0xa9fe0000, prefix: 16, category: "link_local", reason: "IPv4 link-local space is not a public destination" },
  { base: 0xac100000, prefix: 12, category: "private", reason: "IPv4 private-use space is not a public destination" },
  { base: 0xc0000000, prefix: 24, category: "protocol_assignment", reason: "IPv4 IETF protocol-assignment space is not a public-web destination" },
  { base: 0xc0000200, prefix: 24, category: "documentation", reason: "IPv4 documentation space is not a public destination" },
  { base: 0xc01fc400, prefix: 24, category: "special_use", reason: "IPv4 AS112 special-use space is not a public-web destination" },
  { base: 0xc034c100, prefix: 24, category: "special_use", reason: "IPv4 AMT special-use space is not a public-web destination" },
  { base: 0xc0586300, prefix: 24, category: "transition", reason: "Deprecated IPv4-to-IPv6 relay space is not a public-web destination" },
  { base: 0xc0a80000, prefix: 16, category: "private", reason: "IPv4 private-use space is not a public destination" },
  { base: 0xc0af3000, prefix: 24, category: "special_use", reason: "IPv4 direct-delegation AS112 space is not a public-web destination" },
  { base: 0xc6120000, prefix: 15, category: "benchmarking", reason: "IPv4 benchmarking space is not a public destination" },
  { base: 0xc6336400, prefix: 24, category: "documentation", reason: "IPv4 documentation space is not a public destination" },
  { base: 0xcb007100, prefix: 24, category: "documentation", reason: "IPv4 documentation space is not a public destination" },
  { base: 0xe0000000, prefix: 4, category: "multicast", reason: "IPv4 multicast space is not a unicast public-web destination" },
  { base: 0xf0000000, prefix: 4, category: "reserved", reason: "IPv4 reserved or future-use space is not a public destination" },
];

function ipv4Text(value: number): string {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join(".");
}

function ipv4Value(address: string): number | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  if (octets.length !== 4) return null;
  return (((octets[0] as number) * 256 + (octets[1] as number)) * 256 +
    (octets[2] as number)) * 256 + (octets[3] as number);
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const size = 2 ** (32 - prefix);
  return value >= base && value < base + size;
}

function classifyIpv4Number(value: number): IpAddressClassification {
  const normalizedAddress = ipv4Text(value);
  if (value === 0) {
    return { family: 4, normalizedAddress, allowed: false, category: "unspecified", reason: "The IPv4 unspecified address is not a destination" };
  }
  if (value === 0xffffffff) {
    return { family: 4, normalizedAddress, allowed: false, category: "limited_broadcast", reason: "The IPv4 limited-broadcast address is not a destination" };
  }
  const range = BLOCKED_IPV4_RANGES.find((candidate) =>
    inIpv4Range(value, candidate.base, candidate.prefix)
  );
  if (range) {
    return {
      family: 4,
      normalizedAddress,
      allowed: false,
      category: range.category,
      reason: range.reason,
    };
  }
  return { family: 4, normalizedAddress, allowed: true, category: "public", reason: "Globally routable IPv4 unicast address" };
}

function normalizedIpv6(address: string): string | null {
  if (address.includes("%") || isIP(address) !== 6) return null;
  try {
    const hostname = new URL(`http://[${address}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

function ipv6Words(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const words = [...left, ...Array(missing).fill("0"), ...right]
    .map((word) => Number.parseInt(word, 16));
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff)
    ? words
    : null;
}

function matchesIpv6Prefix(words: ReadonlyArray<number>, base: ReadonlyArray<number>, prefix: number): boolean {
  let remaining = prefix;
  for (let index = 0; remaining > 0; index += 1) {
    const bits = Math.min(16, remaining);
    const mask = bits === 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff;
    if (((words[index] as number) & mask) !== (((base[index] ?? 0) as number) & mask)) return false;
    remaining -= bits;
  }
  return true;
}

function embeddedIpv4(words: ReadonlyArray<number>, offset: number): IpAddressClassification {
  const value = (words[offset] as number) * 65_536 + (words[offset + 1] as number);
  return classifyIpv4Number(value);
}

function blockedIpv6(
  normalizedAddress: string,
  category: Exclude<IpAddressCategory, "public" | "invalid">,
  reason: string,
  embedded: ReadonlyArray<IpAddressClassification> = [],
): IpAddressClassification {
  return {
    family: 6,
    normalizedAddress,
    allowed: false,
    category,
    reason,
    ...(embedded.length > 0 ? { embeddedIpv4: embedded } : {}),
  };
}

function classifyIpv6(address: string): IpAddressClassification {
  const normalizedAddress = normalizedIpv6(address);
  const words = normalizedAddress ? ipv6Words(normalizedAddress) : null;
  if (!normalizedAddress || !words) {
    return { family: null, normalizedAddress: null, allowed: false, category: "invalid", reason: "Malformed IP address" };
  }
  if (words.every((word) => word === 0)) {
    return blockedIpv6(normalizedAddress, "unspecified", "The IPv6 unspecified address is not a destination");
  }
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) {
    return blockedIpv6(normalizedAddress, "loopback", "The IPv6 loopback address is not a public destination");
  }
  if (matchesIpv6Prefix(words, [0, 0, 0, 0, 0, 0xffff], 96)) {
    return blockedIpv6(normalizedAddress, "translation", "IPv4-mapped IPv6 addresses are not public-web destinations", [embeddedIpv4(words, 6)]);
  }
  if (matchesIpv6Prefix(words, [0, 0, 0, 0, 0xffff, 0], 96)) {
    return blockedIpv6(normalizedAddress, "translation", "IPv4-translated IPv6 addresses are not public-web destinations", [embeddedIpv4(words, 6)]);
  }
  if (matchesIpv6Prefix(words, [0, 0, 0, 0, 0, 0], 96)) {
    return blockedIpv6(normalizedAddress, "transition", "Deprecated IPv4-compatible IPv6 addresses are not public-web destinations", [embeddedIpv4(words, 6)]);
  }
  if (matchesIpv6Prefix(words, [0x0064, 0xff9b, 0, 0, 0, 0], 96)) {
    return blockedIpv6(normalizedAddress, "translation", "Well-known NAT64 translated addresses are not public-web destinations", [embeddedIpv4(words, 6)]);
  }
  if (matchesIpv6Prefix(words, [0x0064, 0xff9b, 0x0001], 48)) {
    return blockedIpv6(normalizedAddress, "translation", "Local-use NAT64 translated space is not a public-web destination");
  }
  if (matchesIpv6Prefix(words, [0x0100, 0, 0, 0], 64)) {
    return blockedIpv6(normalizedAddress, "discard_only", "IPv6 discard-only space is not a destination");
  }
  if (((words[0] as number) & 0xfe00) === 0xfc00) {
    return blockedIpv6(normalizedAddress, "unique_local", "IPv6 unique-local space is not a public destination");
  }
  if (((words[0] as number) & 0xffc0) === 0xfe80) {
    return blockedIpv6(normalizedAddress, "link_local", "IPv6 link-local space is not a public destination");
  }
  if (((words[0] as number) & 0xffc0) === 0xfec0) {
    return blockedIpv6(normalizedAddress, "deprecated_site_local", "Deprecated IPv6 site-local space is not a public destination");
  }
  if (((words[0] as number) & 0xff00) === 0xff00) {
    return blockedIpv6(normalizedAddress, "multicast", "IPv6 multicast space is not a unicast public-web destination");
  }
  if (words[0] === 0x2002) {
    return blockedIpv6(normalizedAddress, "transition", "Deprecated 6to4 transition addresses are not public-web destinations", [embeddedIpv4(words, 1)]);
  }
  if (words[0] === 0x2001 && words[1] === 0) {
    const server = embeddedIpv4(words, 2);
    const obfuscatedClient = (words[6] as number) * 65_536 + (words[7] as number);
    const client = classifyIpv4Number((0xffffffff - obfuscatedClient) >>> 0);
    return blockedIpv6(normalizedAddress, "transition", "Teredo transition addresses are not public-web destinations", [server, client]);
  }
  if ((words[4] === 0 || words[4] === 0x0200) && words[5] === 0x5efe) {
    return blockedIpv6(normalizedAddress, "transition", "ISATAP transition addresses are not public-web destinations", [embeddedIpv4(words, 6)]);
  }
  if (matchesIpv6Prefix(words, [0x2001, 0x0002, 0], 48)) {
    return blockedIpv6(normalizedAddress, "benchmarking", "IPv6 benchmarking space is not a public destination");
  }
  if (matchesIpv6Prefix(words, [0x2001, 0x0010], 28) || matchesIpv6Prefix(words, [0x2001, 0x0020], 28)) {
    return blockedIpv6(normalizedAddress, "special_use", "IPv6 ORCHID identifier space is not a public-web destination");
  }
  if (matchesIpv6Prefix(words, [0x2001, 0], 23)) {
    return blockedIpv6(normalizedAddress, "protocol_assignment", "IPv6 IETF protocol-assignment space is not a public-web destination");
  }
  if (matchesIpv6Prefix(words, [0x2001, 0x0db8], 32) || matchesIpv6Prefix(words, [0x3fff, 0], 20)) {
    return blockedIpv6(normalizedAddress, "documentation", "IPv6 documentation space is not a public destination");
  }
  if (matchesIpv6Prefix(words, [0x3ffe], 16)) {
    return blockedIpv6(normalizedAddress, "transition", "Deprecated 6bone space is not a public-web destination");
  }
  if (matchesIpv6Prefix(words, [0x5f00], 16)) {
    return blockedIpv6(normalizedAddress, "special_use", "IPv6 segment-routing identifier space is not a public-web destination");
  }
  if (((words[0] as number) & 0xe000) !== 0x2000) {
    return blockedIpv6(normalizedAddress, "reserved", "IPv6 reserved or unallocated space is not a public destination");
  }
  return { family: 6, normalizedAddress, allowed: true, category: "public", reason: "Globally routable IPv6 unicast address" };
}

export function classifyIpAddress(address: string): IpAddressClassification {
  if (typeof address !== "string" || address !== address.trim()) {
    return { family: null, normalizedAddress: null, allowed: false, category: "invalid", reason: "Malformed IP address" };
  }
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Value(address);
    return value === null
      ? { family: null, normalizedAddress: null, allowed: false, category: "invalid", reason: "Malformed IP address" }
      : classifyIpv4Number(value);
  }
  if (family === 6) return classifyIpv6(address);
  return { family: null, normalizedAddress: null, allowed: false, category: "invalid", reason: "Malformed IP address" };
}

export function sameIpAddress(left: string, right: string): boolean {
  const leftClassification = classifyIpAddress(left);
  const rightClassification = classifyIpAddress(right);
  return leftClassification.family !== null &&
    leftClassification.family === rightClassification.family &&
    leftClassification.normalizedAddress === rightClassification.normalizedAddress;
}
