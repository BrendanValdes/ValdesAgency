const DEFAULT_CRM_API_BASE = "https://services.leadconnectorhq.com";
const DEFAULT_CRM_API_VERSION = "2021-07-28";

export class ValdesCrmError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(status: number, responseBody: string) {
    super(`Valdes Agency CRM request failed with status ${status}`);
    this.name = "ValdesCrmError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

interface ValdesCrmRequestOptions extends RequestInit {
  apiVersion?: string;
}

export async function valdesCrmRequest<T>(
  path: string,
  options: ValdesCrmRequestOptions = {}
): Promise<T> {
  const token = requireServerEnv("GHL_PRIVATE_TOKEN");

  const baseUrl =
    process.env.VALDES_CRM_API_BASE?.trim() || DEFAULT_CRM_API_BASE;

  const apiVersion =
    options.apiVersion?.trim() ||
    process.env.VALDES_CRM_API_VERSION?.trim() ||
    DEFAULT_CRM_API_VERSION;

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBase);

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  headers.set("Version", apiVersion);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new ValdesCrmError(
      response.status,
      responseText.slice(0, 2000)
    );
  }

  if (!responseText) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error("Valdes Agency CRM returned invalid JSON");
  }
}
