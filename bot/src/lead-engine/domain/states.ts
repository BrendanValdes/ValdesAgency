export const LEAD_STATES = [
  "unknown",
  "found",
  "stale",
  "conflicting",
  "rejected",
  "human_review",
  "accepted",
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

export const EVIDENCE_STATES = [
  "unknown",
  "not_checked",
  "unavailable",
  "failed",
  "stale",
  "conflicting",
  "found",
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export const VERIFICATION_STATES = [
  "not_checked",
  "syntactically_valid",
  "source_confirmed",
  "externally_verified",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const DECISION_STATES = [
  "unknown",
  "rejected",
  "human_review",
  "accepted",
] as const;

export type DecisionState = (typeof DECISION_STATES)[number];

export const RUN_STATES = [
  "not_checked",
  "running",
  "failed",
  "human_review",
  "accepted",
  "rejected",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const TASK_STATES = [
  "not_checked",
  "running",
  "failed",
  "human_review",
  "accepted",
  "rejected",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const CONFLICT_STATUSES = [
  "none",
  "potential",
  "confirmed",
  "resolved",
] as const;

export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];
