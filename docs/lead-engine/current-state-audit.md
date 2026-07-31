# Rocco Lead Engine V2 — Current-State Audit

## Audit boundary

Phase 0 is based on audited commit `615347fee50823ebdeb4af7cdb865b48f0ad1d1c` from the containment branch. The implementation worktree is isolated on `feature/rocco-lead-engine-v2`; the dirty containment worktree and its tracked and untracked lead, Ava, website, social, content, Discord, CRM, and containment work are not copied, altered, stashed, or cleaned.

This phase adds policy, documentation, and an artifact guard only. It does not add a runtime lead engine, activate a provider, create a database, or change any existing runtime behavior.

## Current state

- Existing USA2–USA5 lead pipelines and artifacts are legacy systems. They remain unchanged and quarantined during V2 development.
- There is no V2 canonical runtime pipeline yet. The future boundary and invariants are defined in `architecture.md`.
- Pool service is the default and only niche that may be initially enabled when a later, separately approved phase introduces runtime configuration.
- Network access is disabled by default. Phase 0 performs no provider, website, scraping, CRM, Discord, Anthropic, Composio, social, booking, email, SMS, or phone action.
- No paid provider is approved by this phase. Every paid provider requires separate, explicit approval before credentials, calls, or costs are introduced.
- Real lead data, SQLite databases and WAL files, generated exports, raw pages, raw provider responses, evidence blobs, logs, caches, temporary runs, and private benchmark datasets belong outside Git.

## Data-quality invariants

- The engine must not emit an unsupported `verified` label. A verification state may be asserted only when the defined verification procedure ran successfully and evidence identifies that procedure and its result.
- Every material accepted claim requires evidence that can be traced to its source, retrieval time, and extraction or decision step.
- Internal owner fields remain `null` when no real person is found. A business name is never stored internally as a person.
- A future manual CRM export may use the business name as a destination-system fallback when an owner label is required. That fallback must be marked as an export transformation and must not represent the business name as a discovered owner.

## Phase 0 controls

- Repository ignore rules cover local lead-engine data and generated artifacts.
- `bot/scripts/check-lead-artifacts.mjs` checks changed, untracked, and high-risk ignored paths for prohibited lead artifacts, contact values, raw material, databases, credentials, and exports.
- Clearly synthetic fixtures, redacted test data, documentation without real contact values, schemas, and configuration examples remain permitted.

## Explicit non-results

Phase 0 has not selected or integrated a live provider, made a network request, installed a dependency, written to a CRM, or begun Phase 1.
