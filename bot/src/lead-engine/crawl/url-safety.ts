import { isIP } from "node:net";

export const PRODUCTION_ALLOWED_PORTS = new Set([80, 443]);

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

export function assertSafeHostnameText(hostname: string): void {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const normalized = withoutBrackets.toLocaleLowerCase("en-US").replace(/\.$/, "");
  if (!normalized || normalized.length > 253) {
    throw new UrlSafetyError("hostname_rejected", "Hostname is missing or too long");
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
  options: { allowedPorts?: ReadonlySet<number> } = {},
): string {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new UrlSafetyError("invalid_url", "Malformed URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError("unsupported_scheme", "Only HTTP and HTTPS URLs are permitted");
  }
  if (url.username || url.password) {
    throw new UrlSafetyError("credentials_rejected", "URL credentials are not permitted");
  }
  assertSafeHostnameText(url.hostname);
  const port = effectivePort(url);
  if (!(options.allowedPorts ?? PRODUCTION_ALLOWED_PORTS).has(port)) {
    throw new UrlSafetyError("port_rejected", "Destination port is not permitted");
  }
  url.hash = "";
  if (!url.hostname.startsWith("[")) {
    url.hostname = url.hostname.toLocaleLowerCase("en-US").replace(/\.$/, "");
  }
  if ((url.protocol === "http:" && port === 80) || (url.protocol === "https:" && port === 443)) {
    url.port = "";
  }
  if (!url.pathname) url.pathname = "/";
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
