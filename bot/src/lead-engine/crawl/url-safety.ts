import { isIP } from "node:net";
import { classifyIpAddress } from "./ip-safety.js";

export const PRODUCTION_ALLOWED_PORTS = new Set([80, 443]);
export const MAX_WEB_URL_LENGTH = 4_096;

const INTERNAL_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".corp",
  ".intranet",
];

export class UrlSafetyError extends Error {
  readonly code:
    | "invalid_url"
    | "unsupported_scheme"
    | "credentials_rejected"
    | "hostname_rejected"
    | "port_rejected";

  constructor(code: UrlSafetyError["code"], message: string) {
    super(message);
    this.name = "UrlSafetyError";
    this.code = code;
  }
}

function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function rawAuthority(value: string): string | null {
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.exec(value);
  const start = scheme ? scheme[0].length : value.startsWith("//") ? 2 : null;
  if (start === null) return null;
  const remainder = value.slice(start);
  const end = remainder.search(/[/?#]/);
  return end < 0 ? remainder : remainder.slice(0, end);
}

function authorityHostname(authority: string): string {
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end < 0 ? hostPort : hostPort.slice(1, end);
  }
  const colon = hostPort.lastIndexOf(":");
  return colon < 0 ? hostPort : hostPort.slice(0, colon);
}

function assertSafeRawUrl(value: string): void {
  if (!value || value.length > MAX_WEB_URL_LENGTH) {
    throw new UrlSafetyError("invalid_url", "URL is missing or too long");
  }
  if (/[\u0000-\u0020\u007f]/.test(value) || value.includes("\\")) {
    throw new UrlSafetyError("invalid_url", "URL contains whitespace, control characters, or backslashes");
  }
  if (/%(?![0-9a-f]{2})/i.test(value)) {
    throw new UrlSafetyError("invalid_url", "URL contains malformed percent encoding");
  }
  const authority = rawAuthority(value);
  if (authority) {
    if (authority.includes("@")) {
      throw new UrlSafetyError("credentials_rejected", "URL credentials are not permitted");
    }
    if (/[^\x00-\x7f]/.test(authority) || authority.includes("%")) {
      throw new UrlSafetyError("hostname_rejected", "Hostname must use an unambiguous ASCII representation");
    }
    if (authorityHostname(authority).endsWith(".")) {
      throw new UrlSafetyError("hostname_rejected", "Trailing-dot hostnames are not permitted");
    }
  }
}

export function assertSafeHostnameText(hostname: string): void {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const normalized = withoutBrackets.toLowerCase();
  if (!normalized || normalized.length > 253) {
    throw new UrlSafetyError("hostname_rejected", "Hostname is missing or too long");
  }
  if (normalized.endsWith(".")) {
    throw new UrlSafetyError("hostname_rejected", "Trailing-dot hostnames are not permitted");
  }
  if (normalized === "localhost" || INTERNAL_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    throw new UrlSafetyError("hostname_rejected", "Internal hostnames are not permitted");
  }
  if (normalized.includes("%") || /[\s/\\]/.test(normalized)) {
    throw new UrlSafetyError("hostname_rejected", "Malformed hostname");
  }
  if (isIP(normalized) === 0) {
    if (!normalized.includes(".")) {
      throw new UrlSafetyError("hostname_rejected", "Single-label hostnames are not permitted");
    }
    const labels = normalized.split(".");
    if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
      throw new UrlSafetyError("hostname_rejected", "Malformed hostname label");
    }
  }
}

export function normalizeWebUrl(
  input: string | URL,
  options: {
    allowedPorts?: ReadonlySet<number>;
    allowedIpAddresses?: ReadonlySet<string>;
    baseUrl?: string | URL;
  } = {},
): string {
  const raw = input instanceof URL ? input.href : input;
  assertSafeRawUrl(raw);
  let url: URL;
  try {
    url = input instanceof URL
      ? new URL(input.href)
      : options.baseUrl === undefined ? new URL(input) : new URL(input, options.baseUrl);
  } catch {
    throw new UrlSafetyError("invalid_url", "Malformed URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError("unsupported_scheme", "Only HTTP and HTTPS URLs are permitted");
  }
  if (rawAuthority(raw) === "") {
    throw new UrlSafetyError("hostname_rejected", "Hostname is missing");
  }
  if (url.username || url.password) {
    throw new UrlSafetyError("credentials_rejected", "URL credentials are not permitted");
  }
  if (!(input instanceof URL) && options.baseUrl === undefined && !/^https?:\/\//i.test(raw)) {
    throw new UrlSafetyError("invalid_url", "An absolute HTTP or HTTPS URL is required");
  }
  assertSafeHostnameText(url.hostname);
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  const sourceAuthority = rawAuthority(raw);
  if (isIP(hostname) === 4 && sourceAuthority && authorityHostname(sourceAuthority) !== hostname) {
    throw new UrlSafetyError("hostname_rejected", "Non-canonical IPv4 representations are not permitted");
  }
  if (isIP(hostname) !== 0) {
    const classification = classifyIpAddress(hostname);
    const explicitlyAllowed = classification.normalizedAddress !== null &&
      [...(options.allowedIpAddresses ?? [])].some((address) =>
        classifyIpAddress(address).normalizedAddress === classification.normalizedAddress
      );
    if (!classification.allowed && !explicitlyAllowed) {
      throw new UrlSafetyError("hostname_rejected", classification.reason);
    }
  }
  const port = effectivePort(url);
  if (!(options.allowedPorts ?? PRODUCTION_ALLOWED_PORTS).has(port)) {
    throw new UrlSafetyError("port_rejected", "Destination port is not permitted");
  }
  url.hash = "";
  if (!url.hostname.startsWith("[")) {
    url.hostname = url.hostname.toLowerCase();
  }
  if ((url.protocol === "http:" && port === 80) || (url.protocol === "https:" && port === 443)) {
    url.port = "";
  }
  if (!url.pathname) url.pathname = "/";
  if (url.href.length > MAX_WEB_URL_LENGTH) {
    throw new UrlSafetyError("invalid_url", "Normalized URL is too long");
  }
  return url.href;
}

export function sameSite(left: string | URL, right: string | URL): boolean {
  const leftUrl = new URL(normalizeWebUrl(left));
  const rightUrl = new URL(normalizeWebUrl(right));
  return leftUrl.protocol === rightUrl.protocol && leftUrl.host === rightUrl.host;
}

export function canonicalHomepage(input: string | URL): string {
  const url = new URL(normalizeWebUrl(input));
  url.pathname = "/";
  url.search = "";
  return url.href;
}
