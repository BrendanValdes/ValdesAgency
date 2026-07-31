import { evidenceSupportsConfirmedPerson } from "./policies.js";
import type { Evidence } from "./types.js";

export type CreateEvidenceInput = Omit<
  Evidence,
  | "claimedValue"
  | "evidenceState"
  | "verificationState"
  | "decisionState"
  | "verificationMethod"
  | "verifiedAt"
> & {
  claimedValue: string | null;
  evidenceState?: Evidence["evidenceState"];
  verificationState?: Evidence["verificationState"];
  decisionState?: Evidence["decisionState"];
  verificationMethod?: string | null;
  verifiedAt?: string | null;
};

export function createEvidence(input: CreateEvidenceInput): Evidence {
  const claimedValue = input.claimedValue?.trim() || null;
  const evidence: Evidence = {
    ...input,
    claimedValue,
    evidenceState:
      input.evidenceState ?? (claimedValue === null ? "unknown" : "found"),
    verificationState: input.verificationState ?? "not_checked",
    decisionState: input.decisionState ?? "unknown",
    verificationMethod: input.verificationMethod ?? null,
    verifiedAt: input.verifiedAt ?? null,
  };

  assertEvidenceSemantics(evidence);
  return evidence;
}

export function assertEvidenceSemantics(evidence: Evidence): void {
  if (!Number.isInteger(evidence.confidenceBasisPoints)) {
    throw new Error("Evidence confidence must use integer basis points");
  }
  if (evidence.confidenceBasisPoints < 0 || evidence.confidenceBasisPoints > 10_000) {
    throw new Error("Evidence confidence must be between 0 and 10000 basis points");
  }
  if (evidence.claimedValue === null && evidence.verificationState !== "not_checked") {
    throw new Error("Evidence without a claim cannot have a verification result");
  }
  if (
    evidence.verificationState === "externally_verified" &&
    (!evidence.verificationMethod || !evidence.verifiedAt)
  ) {
    throw new Error("External verification requires a method and timestamp");
  }
  if (
    evidence.evidenceState === "conflicting" &&
    evidence.conflictStatus === "none"
  ) {
    throw new Error("Conflicting evidence requires an explicit conflict status");
  }
  if (
    evidence.rawReferenceChecksum !== null &&
    !/^[a-f0-9]{64}$/i.test(evidence.rawReferenceChecksum)
  ) {
    throw new Error("Raw-reference checksum must be a SHA-256 hex digest");
  }
}

export { evidenceSupportsConfirmedPerson };
