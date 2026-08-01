import { evidenceSupportsConfirmedPerson } from "./policies.js";
import {
  isClaimState,
  isProvenanceSourceClass,
  methodSupportsDimension,
} from "./provenance.js";
import type { Evidence } from "./types.js";

export type CreateEvidenceInput = Omit<
  Evidence,
  | "claimedValue"
  | "evidenceState"
  | "verificationState"
  | "decisionState"
  | "verificationMethod"
  | "verifiedAt"
  | "claimState"
  | "sourceConfirmationState"
  | "externalVerificationState"
  | "humanReviewState"
  | "verificationDimension"
  | "verifierId"
  | "verificationResult"
  | "expiresAt"
  | "normalizedValue"
  | "evidenceReference"
  | "humanReviewerId"
  | "humanReviewedAt"
> & {
  claimedValue: string | null;
  evidenceState?: Evidence["evidenceState"];
  verificationState?: Evidence["verificationState"];
  decisionState?: Evidence["decisionState"];
  verificationMethod?: Evidence["verificationMethod"];
  verifiedAt?: string | null;
  claimState?: Evidence["claimState"];
  sourceConfirmationState?: Evidence["sourceConfirmationState"];
  externalVerificationState?: Evidence["externalVerificationState"];
  humanReviewState?: Evidence["humanReviewState"];
  verificationDimension?: Evidence["verificationDimension"];
  verifierId?: string | null;
  verificationResult?: Evidence["verificationResult"];
  expiresAt?: string | null;
  normalizedValue?: string | null;
  evidenceReference?: string | null;
  humanReviewerId?: string | null;
  humanReviewedAt?: string | null;
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
    claimState: input.claimState ?? (claimedValue === null ? "unknown" : "observed"),
    sourceConfirmationState: input.sourceConfirmationState ?? "unassessed",
    externalVerificationState: input.externalVerificationState ?? "unassessed",
    humanReviewState: input.humanReviewState ?? "unreviewed",
    verificationDimension: input.verificationDimension ?? null,
    verifierId: input.verifierId?.trim() || null,
    verificationMethod: input.verificationMethod ?? null,
    verificationResult: input.verificationResult ?? null,
    verifiedAt: input.verifiedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    normalizedValue: input.normalizedValue?.trim() || null,
    evidenceReference: input.evidenceReference?.trim() || null,
    humanReviewerId: input.humanReviewerId?.trim() || null,
    humanReviewedAt: input.humanReviewedAt ?? null,
  };

  assertEvidenceSemantics(evidence);
  return evidence;
}

export function assertEvidenceSemantics(evidence: Evidence): void {
  if (!isProvenanceSourceClass(evidence.sourceClass)) {
    throw new Error("Evidence requires a supported explicit source class");
  }
  if (!isClaimState(evidence.claimState)) {
    throw new Error("Evidence requires a supported claim state");
  }
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
    evidence.claimState === "source_confirmed" &&
    (evidence.verificationState !== "source_confirmed" || evidence.sourceConfirmationState !== "confirmed")
  ) {
    throw new Error("Source-confirmed claims require an explicit confirmed source state");
  }
  if (evidence.verificationState === "source_confirmed" && evidence.claimState !== "source_confirmed") {
    throw new Error("Source-confirmed verification requires a source-confirmed claim");
  }
  if (
    (evidence.verificationState === "externally_verified" ||
      evidence.claimState === "externally_verified" ||
      evidence.externalVerificationState === "current") &&
    (
      evidence.sourceClass !== "external_verification_provider" ||
      !evidence.verificationDimension ||
      !evidence.verifierId ||
      !evidence.verificationMethod ||
      evidence.verificationResult !== "passed" ||
      !evidence.verifiedAt ||
      !evidence.expiresAt ||
      !evidence.normalizedValue ||
      !evidence.evidenceReference
    )
  ) {
    throw new Error("External verification requires complete compatible verifier evidence");
  }
  if (
    evidence.verificationMethod &&
    evidence.verificationDimension &&
    !methodSupportsDimension(evidence.verificationMethod, evidence.verificationDimension)
  ) {
    throw new Error("Verification method does not support the claimed dimension");
  }
  if (evidence.externalVerificationState === "current") {
    const verifiedAt = Date.parse(evidence.verifiedAt ?? "");
    const expiresAt = Date.parse(evidence.expiresAt ?? "");
    const updatedAt = Date.parse(evidence.updatedAt);
    if (
      !Number.isFinite(verifiedAt) ||
      !Number.isFinite(expiresAt) ||
      !Number.isFinite(updatedAt) ||
      verifiedAt > updatedAt ||
      expiresAt <= verifiedAt ||
      expiresAt <= updatedAt
    ) {
      throw new Error("Current external verification requires a fresh expiry after verification and the state transition");
    }
  }
  if (
    evidence.sourceClass === "synthetic_fixture" &&
    evidence.claimState === "externally_verified"
  ) {
    throw new Error("Synthetic fixture evidence cannot create production verification");
  }
  if (
    (evidence.sourceClass === "historical_manual_artifact" ||
      evidence.sourceClass === "legacy_unclassified") &&
    evidence.claimState === "externally_verified"
  ) {
    throw new Error("Historical or legacy evidence cannot create external verification");
  }
  if (
    evidence.sourceClass === "public_business_website" &&
    evidence.claimState === "externally_verified"
  ) {
    throw new Error("Website observations cannot directly create external verification");
  }
  if (evidence.claimState === "human_confirmed" && (
    evidence.sourceClass !== "human_review" ||
    evidence.humanReviewState !== "accepted" ||
    !evidence.verificationDimension ||
    !evidence.normalizedValue ||
    !evidence.humanReviewerId ||
    !evidence.humanReviewedAt ||
    !evidence.evidenceReference
  )) {
    throw new Error("Human-confirmed evidence requires an auditable accepted review");
  }
  if (evidence.claimState === "human_confirmed") {
    const reviewedAt = Date.parse(evidence.humanReviewedAt ?? "");
    const updatedAt = Date.parse(evidence.updatedAt);
    if (!Number.isFinite(reviewedAt) || !Number.isFinite(updatedAt) || reviewedAt > updatedAt) {
      throw new Error("Human-confirmed evidence requires a valid review timestamp at or before the state transition");
    }
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
