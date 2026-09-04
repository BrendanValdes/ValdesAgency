export const EMAIL_ERROR_MESSAGE =
  "Enter a valid email address so we can send your appointment details.";

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "discard.email",
  "dispostable.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "yopmail.com",
]);

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /[\s\u0000-\u001f\u007f]/.test(email)) return false;

  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63)) return false;
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return false;
  const topLevelDomain = labels.at(-1) ?? "";
  if (!/^[a-z]{2,63}$/i.test(topLevelDomain)) return false;

  return !DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export function emailDomain(value: string) {
  return normalizeEmail(value).split("@")[1] ?? "";
}
