# Rocco Lead Engine V2 — Provider Matrix

Phase 0 activates no provider and makes no network request. Network access is disabled by default for every row. “Planned” describes architectural intent for a later approved phase, not current availability.

| Capability | Candidate source or adapter | Future role | Phase 0 state | Approval rule |
| --- | --- | --- | --- | --- |
| Business discovery | Overture Maps data | First discovery source for the pool-service niche | Planned, not integrated, disabled | A later phase must approve dataset access and enable network or an operator-supplied offline snapshot |
| Website evidence | Direct business website fetcher | Acquire pages needed for evidence | Not implemented, disabled | Explicit network enablement, crawl limits, and evidence-retention policy required |
| Search fallback | Search provider | Find missing official-site evidence only | Not selected, disabled | Separate provider review; any paid plan requires explicit cost approval |
| Contact enrichment | Enrichment provider | Candidate contact evidence | Not selected, disabled | Separate explicit approval for provider, credentials, fields, privacy basis, and spend |
| Claim verification | Verification provider or defined first-party procedure | Run a specific verification procedure | Not selected, disabled | Must define evidence and result semantics; provider presence alone cannot produce `verified` |
| CRM delivery | Local export schema only | Manual file handoff outside Git | Schema concept only; no adapter | No CRM reads or writes; any outbound adapter requires a new ADR and explicit approval |

## Provider rules

- Overture-first is the future default discovery strategy; it is not a live integration in Phase 0.
- Pool service is the only niche that may be initially enabled. New niches require reviewed configuration and test evidence on the same canonical pipeline.
- Paid providers are denied until separately and explicitly approved. Approval must name the provider, credentials boundary, spend ceiling, fields returned, retention policy, and allowed call scope.
- Raw provider responses and raw crawled pages remain outside Git.
- Provider-derived claims retain source provenance and do not inherit a `verified` label.
- No provider can trigger CRM, messaging, publishing, booking, Discord, email, SMS, or phone side effects.
