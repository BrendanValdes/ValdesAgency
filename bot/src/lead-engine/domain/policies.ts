import type { Business, Contact, Evidence } from "./types.js";
import { assertPersonNamePolicy } from "./person-quality.js";
import { isCurrentExternalVerification } from "./provenance.js";

const CONTACT_LOG_KEY = /(?:contact|person|owner|email|phone|address|claimed.?value)/i;

function normalizedIdentity(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function assertContactIdentityPolicy(
  businessName: string,
  personName: string | null,
): void {
  assertPersonNamePolicy(personName, [businessName]);
  if (personName === null) return;
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
  if (!personRecord.personName) return false;
  if (personRecord.decisionState !== "accepted") return false;
  if (!personRecord.relationshipEvidenceId) return false;
  if (personRecord.claimState !== "human_confirmed" && personRecord.claimState !== "externally_verified") {
    return false;
  }
  if (
    personRecord.claimState === "externally_verified" &&
    personRecord.verificationState !== "externally_verified"
  ) {
    return false;
  }
  if (
    personRecord.claimState === "human_confirmed" &&
    personRecord.verificationState === "externally_verified"
  ) {
    return false;
  }
  return (
    normalizedIdentity(businessRecord.canonicalName) !==
    normalizedIdentity(personRecord.personName)
  );
}

export function assertContactClaimSemantics(
  contact: Contact,
  relationshipEvidence: Evidence | null,
): void {
  if (contact.claimState !== "externally_verified" && contact.claimState !== "human_confirmed") {
    if (contact.verificationState === "externally_verified") {
      throw new Error("Contact external verification requires an externally verified claim");
    }
    return;
  }
  if (!relationshipEvidence || contact.relationshipEvidenceId !== relationshipEvidence.id) {
    throw new Error("Confirmed person relationship requires cited evidence");
  }
  if (relationshipEvidence.entityType !== "person" || relationshipEvidence.entityId !== contact.id) {
    throw new Error("Person relationship evidence must belong to the contact");
  }
  const requiredDimension = contact.role === "owner"
    ? "person_owner_relationship"
    : contact.role === "manager"
      ? "person_decision_authority"
      : "person_current_employment";
  if (relationshipEvidence.verificationDimension !== requiredDimension) {
    throw new Error("Person relationship evidence does not prove the claimed role");
  }
  if (contact.claimState === "externally_verified") {
    if (
      contact.verificationState !== "externally_verified" ||
      !isCurrentExternalVerification(relationshipEvidence, requiredDimension, contact.updatedAt)
    ) {
      throw new Error("Externally verified person relationship requires current complete verifier evidence");
    }
  } else if (
    relationshipEvidence.claimState !== "human_confirmed" ||
    relationshipEvidence.humanReviewState !== "accepted" ||
    relationshipEvidence.sourceClass !== "human_review" ||
    contact.verificationState === "externally_verified"
  ) {
    throw new Error("Human-confirmed person relationship requires an accepted human review");
  }
}

export function evidenceSupportsConfirmedPerson(
  evidence: Evidence,
  currentAt: string = new Date().toISOString(),
): boolean {
  if (
    evidence.entityType === "person" &&
    evidence.conflictStatus !== "confirmed" &&
    evidence.decisionState === "accepted"
  ) {
    if (evidence.claimState === "human_confirmed") {
      return evidence.sourceClass === "human_review" &&
        evidence.humanReviewState === "accepted" &&
        Boolean(evidence.humanReviewerId && evidence.humanReviewedAt && evidence.normalizedValue && evidence.evidenceReference);
    }
    const dimension = evidence.verificationDimension;
    if (!dimension || !dimension.startsWith("person_")) return false;
    return isCurrentExternalVerification(evidence, dimension, currentAt);
  }
  return false;
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
