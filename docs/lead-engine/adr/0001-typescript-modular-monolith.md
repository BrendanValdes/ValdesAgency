# ADR 0001: TypeScript Modular Monolith

- Status: Accepted for future implementation
- Date: 2026-07-31
- Scope: Architecture decision only; no Phase 0 runtime code

## Context

The lead engine needs one auditable pipeline with shared domain rules, evidence semantics, provider boundaries, storage, scoring, and export behavior. Separate scripts per niche would duplicate policy and make provenance and verification states inconsistent.

## Decision

Implement the future Rocco Lead Engine V2 as a TypeScript modular monolith within the existing bot project. Use one canonical application pipeline. Keep domain, application, provider-adapter, persistence, evidence, scoring, and export concerns in explicit modules with dependency direction toward the domain.

Pool service is the default and only initially enabled niche. Niche differences are configuration and deterministic rules, not alternate execution paths.

## Consequences

- Existing TypeScript tooling can validate later runtime work without a second language or package boundary.
- Shared types make unsupported verification labels and owner-field fallbacks easier to prohibit centrally.
- Provider adapters remain replaceable and disabled by default.
- The monolith must retain module boundaries; cross-module shortcuts require review.
- Legacy USA2–USA5 pipelines remain unchanged and quarantined rather than becoming hidden alternate V2 paths.

## Phase 0 note

This ADR adds no TypeScript runtime symbol and no dependency.
