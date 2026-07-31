# ADR 0004: No Outbound Adapters

- Status: Accepted
- Date: 2026-07-31
- Scope: Permanent safety boundary unless replaced by a separately approved ADR

## Context

Discovery and evidence processing do not require the authority to mutate external systems or contact people. Combining lead generation with outbound actions would expand risk, obscure operator intent, and weaken containment.

## Decision

The lead engine has no outbound adapters and performs no automatic CRM writes. It also performs no CRM reads, Discord actions, social publishing, bookings, email, SMS, or phone actions.

A future operator-requested CRM export may write a local file outside Git using an approved schema. If the destination schema requires an owner label and no real person was found, the export may use the business name as an explicitly marked `business_name_fallback`. Internal owner fields remain `null`, and the fallback must never be represented as a discovered owner.

Introducing any outbound adapter requires a new ADR, explicit approval, an authorization model, dry-run behavior, audit logging, and dedicated safety validation. It is not implied by approval of discovery, evidence acquisition, or export schemas.

## Consequences

- The canonical pipeline ends at local persistence or a manual local export.
- Operators retain control over any downstream import or contact action.
- Generated exports and their real lead contents remain outside Git.
- Provider integrations cannot transitively gain outbound authority.

## Phase 0 note

Phase 0 adds no CRM integration and performs no external action.
