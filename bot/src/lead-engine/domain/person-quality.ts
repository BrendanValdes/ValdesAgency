import { normalizeBusinessName } from "../identity/normalize.js";

export type PersonNameRejectionReason =
  | "placeholder_name"
  | "business_name_as_person"
  | "contact_value_as_person";

export interface PersonNameEvaluation {
  accepted: boolean;
  normalizedName: string | null;
  reason: PersonNameRejectionReason | null;
}

const PLACEHOLDERS = new Set([
  "unknown",
  "n/a",
  "n a",
  "na",
  "not available",
  "owner",
  "manager",
]);

function looksLikeContactValue(value: string): boolean {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && !/[\p{L}]/u.test(value);
}

export function evaluatePersonName(
  name: string | null | undefined,
  businessNames: ReadonlyArray<string>,
): PersonNameEvaluation {
  const trimmed = name?.normalize("NFKC").trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed) {
    return name === null || name === undefined
      ? { accepted: true, normalizedName: null, reason: null }
      : { accepted: false, normalizedName: null, reason: "placeholder_name" };
  }
  const normalized = normalizeBusinessName(trimmed);
  if (PLACEHOLDERS.has(normalized)) {
    return { accepted: false, normalizedName: null, reason: "placeholder_name" };
  }
  if (looksLikeContactValue(trimmed)) {
    return { accepted: false, normalizedName: null, reason: "contact_value_as_person" };
  }
  if (businessNames.some((businessName) => normalizeBusinessName(businessName) === normalized)) {
    return { accepted: false, normalizedName: null, reason: "business_name_as_person" };
  }
  return { accepted: true, normalizedName: trimmed, reason: null };
}

export function assertPersonNamePolicy(
  name: string | null | undefined,
  businessNames: ReadonlyArray<string>,
): void {
  const result = evaluatePersonName(name, businessNames);
  if (!result.accepted) throw new Error(`Person name rejected: ${result.reason}`);
}
