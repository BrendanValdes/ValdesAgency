import type { Business, Contact, Evidence } from "./types.js";

const CONTACT_LOG_KEY = /(?:contact|person|owner|email|phone|address|claimed.?value)/i;

function normalizedIdentity(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function assertContactIdentityPolicy(
  businessName: string,
  personName: string,
): void {
  if (
    normalizedIdentity(businessName) === normalizedIdentity(personName)
  ) {
    throw new Error("Contact identity violates the confirmed-person policy");
  }
}

export function isConfirmedPerson(
  businessRecord: Business,
  personRecord: Contact,
): boolean {
  if (personRecord.entityType !== "person") return false;
  if (personRecord.decisionState !== "accepted") return false;
  if (
    personRecord.verificationState !== "source_confirmed" &&
    personRecord.verificationState !== "externally_verified"
  ) {
    return false;
  }
  return (
    normalizedIdentity(businessRecord.canonicalName) !==
    normalizedIdentity(personRecord.personName)
  );
}

export function evidenceSupportsConfirmedPerson(evidence: Evidence): boolean {
  return (
    evidence.entityType === "person" &&
    evidence.conflictStatus !== "confirmed" &&
    evidence.decisionState === "accepted" &&
    (evidence.verificationState === "source_confirmed" ||
      evidence.verificationState === "externally_verified")
  );
}

export function sanitizeLogMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      CONTACT_LOG_KEY.test(key) ? "[redacted]" : value,
    ]),
  );
}
