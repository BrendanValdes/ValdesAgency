export const PHONE_ERROR_MESSAGE =
  "Enter a valid phone number so we can reach you about your appointment.";

const ALLOWED_PHONE_CHARACTERS = /^\+?[0-9().\-\s]+$/;

export function normalizeNanpPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40 || !ALLOWED_PHONE_CHARACTERS.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d{2}$/.test(areaCode) || !/^[2-9]\d{2}$/.test(exchange)) return null;
  if (/^\d11$/.test(areaCode) || /^\d11$/.test(exchange)) return null;
  if (/^(\d)\1{9}$/.test(digits)) return null;

  return `+1${digits}`;
}

export function isValidNanpPhone(value: string) {
  return normalizeNanpPhone(value) !== null;
}
