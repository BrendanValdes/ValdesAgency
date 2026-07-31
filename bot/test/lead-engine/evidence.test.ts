import { describe, expect, it } from "vitest";
import {
  createEvidence,
  evidenceSupportsConfirmedPerson,
} from "../../src/lead-engine/domain/evidence.js";
import {
  assertContactIdentityPolicy,
  isConfirmedPerson,
  sanitizeLogMetadata,
} from "../../src/lead-engine/domain/policies.js";
import {
  EVIDENCE_STATES,
  VERIFICATION_STATES,
} from "../../src/lead-engine/domain/states.js";
import {
  SYNTHETIC_TIMESTAMP,
  makeSyntheticEvidence,
  syntheticBusiness,
  syntheticContact,
  syntheticContactValues,
} from "./fixtures/synthetic.js";

describe("evidence-first semantics", () => {
  it("keeps availability and verification states explicit and separate", () => {
    expect(EVIDENCE_STATES).toEqual([
      "unknown",
      "not_checked",
      "unavailable",
      "failed",
      "stale",
      "conflicting",
      "found",
    ]);
    expect(VERIFICATION_STATES).toEqual([
      "not_checked",
      "syntactically_valid",
      "source_confirmed",
      "externally_verified",
    ]);
  });

  it("does not silently verify a nonblank value", () => {
    const evidence = makeSyntheticEvidence({ claimedValue: "Nonblank synthetic claim" });
    expect(evidence.evidenceState).toBe("found");
    expect(evidence.verificationState).toBe("not_checked");
    expect(evidence.decisionState).toBe("unknown");
  });

  it("requires an explicit method and timestamp for external verification", () => {
    expect(() =>
      makeSyntheticEvidence({ verificationState: "externally_verified" }),
    ).toThrow("method and timestamp");

    const evidence = makeSyntheticEvidence({
      verificationState: "externally_verified",
      verificationMethod: "synthetic_test_procedure",
      verifiedAt: SYNTHETIC_TIMESTAMP,
    });
    expect(evidence.verificationState).toBe("externally_verified");
  });

  it("never lets business evidence satisfy confirmed-person policy", () => {
    const businessEvidence = makeSyntheticEvidence({
      verificationState: "source_confirmed",
      decisionState: "accepted",
    });
    expect(evidenceSupportsConfirmedPerson(businessEvidence)).toBe(false);

    const personEvidence = createEvidence({
      ...businessEvidence,
      id: "evidence-person-synthetic",
      entityType: "person",
      entityId: syntheticContact.id,
      fieldName: "person_name",
    });
    expect(evidenceSupportsConfirmedPerson(personEvidence)).toBe(true);
  });

  it("keeps business names from becoming confirmed person identities", () => {
    expect(() =>
      assertContactIdentityPolicy(
        syntheticBusiness.canonicalName,
        syntheticBusiness.canonicalName,
      ),
    ).toThrow("confirmed-person policy");
    expect(
      isConfirmedPerson(syntheticBusiness, {
        ...syntheticContact,
        verificationState: "source_confirmed",
        decisionState: "accepted",
      }),
    ).toBe(true);
    expect(
      isConfirmedPerson(syntheticBusiness, {
        ...syntheticContact,
        personName: syntheticBusiness.canonicalName,
        verificationState: "source_confirmed",
        decisionState: "accepted",
      }),
    ).toBe(false);
  });

  it("redacts contact values from safe log metadata and policy errors", () => {
    const metadata = sanitizeLogMetadata({
      runId: "run-synthetic-001",
      email: syntheticContactValues.email,
      phone: syntheticContactValues.phone,
      personName: syntheticContact.personName,
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain(syntheticContactValues.email);
    expect(serialized).not.toContain(syntheticContactValues.phone);
    expect(serialized).not.toContain(syntheticContact.personName);

    let message = "";
    try {
      assertContactIdentityPolicy(
        syntheticBusiness.canonicalName,
        syntheticBusiness.canonicalName,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(syntheticBusiness.canonicalName);
  });
});
