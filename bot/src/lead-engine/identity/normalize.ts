import type { AddressIdentity, PhoneIdentity, ProviderIdentity } from "./hierarchy.js";

function text(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeBusinessName(value: string): string {
  return text(value);
}

export function normalizeDomain(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const hostname = parsed.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "").replace(/\.$/, "");
    return hostname.includes(".") && !hostname.includes(" ") ? hostname : null;
  } catch {
    return null;
  }
}

export function normalizeProviderIdentifier(identifier: ProviderIdentity): string {
  const provider = text(identifier.providerId);
  const value = identifier.value.trim().normalize("NFKC");
  if (!provider || !value) throw new Error("Provider identifiers require provider and value");
  return `${provider}:${value}`;
}

export function normalizePhoneCandidate(
  value: string,
  metadata: Partial<Omit<PhoneIdentity, "value" | "e164" | "tollFree">> = {},
): PhoneIdentity {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const e164 = national.length === 10 ? `+1${national}` : null;
  const tollFree = e164 !== null && /^(800|833|844|855|866|877|888)/.test(national);
  return {
    value,
    e164,
    verified: metadata.verified ?? false,
    shared: metadata.shared ?? false,
    tollFree,
    callCenter: metadata.callCenter ?? false,
    multipleLocations: metadata.multipleLocations ?? false,
    associationCertain: metadata.associationCertain ?? false,
  };
}

export function normalizeAddress(address: AddressIdentity): string {
  const region = text(address.region);
  const country = address.countryCode.trim().toUpperCase();
  return [
    text(address.line1),
    text(address.line2 ?? ""),
    text(address.city),
    region,
    address.postalCode.replace(/\s+/g, "").toUpperCase(),
    country,
  ].filter(Boolean).join("|");
}

