import type { OfflineRunState } from "./types.js";

export const OFFLINE_RUN_TRANSITIONS: Readonly<Record<OfflineRunState, ReadonlySet<OfflineRunState>>> = {
  pending: new Set(["running", "cancelled", "failed_terminal", "manual_intervention"]),
  running: new Set([
    "waiting_retry", "recovering", "review_required", "completed",
    "cancelled", "failed_terminal", "manual_intervention",
  ]),
  waiting_retry: new Set([
    "running", "recovering", "cancelled", "failed_terminal", "manual_intervention",
  ]),
  recovering: new Set([
    "running", "waiting_retry", "review_required", "completed",
    "cancelled", "failed_terminal", "manual_intervention",
  ]),
  review_required: new Set(),
  completed: new Set(),
  cancelled: new Set(),
  failed_terminal: new Set(),
  manual_intervention: new Set(),
};

export function assertOfflineRunTransition(from: OfflineRunState, to: OfflineRunState): void {
  if (from === to || !OFFLINE_RUN_TRANSITIONS[from].has(to)) {
    throw new Error(`Invalid offline run state transition: ${from} -> ${to}`);
  }
}

export function legacyStatusFor(
  state: OfflineRunState,
  reasonCode: string | null = null,
): "running" | "completed" | "review_required" | "cancelled" | "budget_blocked" | "failed" {
  if (["pending", "running", "waiting_retry", "recovering"].includes(state)) return "running";
  if (state === "completed") return "completed";
  if (state === "review_required") return "review_required";
  if (state === "cancelled") return "cancelled";
  if (state === "failed_terminal" && reasonCode?.includes("budget")) return "budget_blocked";
  return "failed";
}
