# Rocco Lead Engine V2 — Architecture Boundary

## Decision summary

Rocco Lead Engine V2 will have one canonical lead-engine pipeline implemented in a TypeScript modular monolith. Alternate niche-specific pipelines are not permitted. Niche behavior is configuration applied to the canonical stages, and pool service is the default and only initially enabled niche.

Phase 0 defines the boundary only; it does not implement or activate the pipeline.

## Future canonical pipeline

The single future flow is:

1. Discover candidate businesses.
2. Normalize identity and source records.
3. Apply deterministic niche and geography eligibility rules.
4. Acquire approved website evidence only when network access is explicitly enabled.
5. Extract claims without upgrading their verification state.
6. Validate material claims against their required evidence policy.
7. Score and rank accepted candidates.
8. Persist records, decisions, and evidence references in local storage outside Git.
9. Produce a manual export outside Git when an operator requests one.

Every stage uses shared domain types, evidence rules, and decision states. Providers are adapters behind the discovery or evidence-acquisition boundaries; they do not define separate pipelines.

## Required invariants

### Niche and labels

- `pool_service` is the default and only niche that may be initially enabled.
- No record or claim receives an unsupported `verified` label.
- `verified` means a specified verification procedure completed successfully. Discovery, extraction, provider presence, or model confidence alone never qualifies.

### Evidence

Every material accepted claim must reference evidence containing, at minimum:

- source identity and provider or page type;
- retrieval or dataset timestamp;
- source locator or immutable local evidence identifier;
- extraction method and decision step;
- the exact claim supported; and
- any limitation, conflict, or staleness signal.

Claims without the required evidence remain unknown, unverified, or rejected according to the future domain policy. Evidence blobs are local-only and remain outside Git.

### Owner identity and export fallback

Internal person fields such as `ownerName` and `ownerTitle` remain `null` when no real person is found. The business name is stored only as business identity.

A future, manually initiated CRM export may copy the business name into a required destination owner-label field. The export must also mark the value as `business_name_fallback`; it must not write that value back into internal owner fields or describe it as a discovered person.

### Side effects and network policy

- Network access is disabled by default and must require explicit operator enablement in a later approved phase.
- Paid providers require separate, explicit approval for the provider, credentials, expected spend, and call scope.
- No outbound adapters are part of the lead engine. There are no automatic CRM writes, CRM reads, messages, calls, bookings, publishing actions, or Discord actions.
- A future export is a local file handoff outside Git, not an outbound adapter.

### Storage and repository boundary

- Future operational storage uses SQLite WAL outside the repository, as described by ADR 0002.
- Real lead records, raw website pages, raw provider responses, databases and WAL files, generated exports, private benchmark datasets, evidence blobs, caches, logs, and temporary run artifacts remain outside Git.
- Git may contain only approved schemas, configuration examples, documentation without real contact values, and clearly synthetic or redacted fixtures.

## Legacy quarantine

Legacy USA2–USA5 pipelines and their artifacts remain unchanged and quarantined while V2 is developed. V2 must not import them as its runtime path, mutate them, relabel their output, or silently reconcile their data. Any later migration requires a separately reviewed plan with provenance and artifact controls.

## Module boundary for later phases

When approved, the modular monolith may contain domain, application, provider-adapter, persistence, evidence, scoring, and export modules under one lead-engine boundary. Phase 0 creates none of those runtime modules and activates no integration.
