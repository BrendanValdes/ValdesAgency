# ADR 0003: Overture-First Discovery

- Status: Accepted for future implementation
- Date: 2026-07-31
- Scope: Discovery strategy only; no Phase 0 provider access

## Context

V2 needs a reproducible first source for discovering candidate pool-service businesses without creating niche-specific pipelines or treating discovery presence as proof of later claims.

## Decision

Use Overture Maps data as the first discovery source for the future canonical pipeline. Pool service is the default and only initially enabled niche. Overture records create candidates and provenance only; they do not verify owner identity, contactability, service claims, or website claims.

Network access remains disabled by default. A later approved phase must define whether data is supplied as an operator-managed offline snapshot or acquired through explicitly enabled network access. Any fallback or paid provider requires separate explicit approval.

## Consequences

- Initial discovery has one named source and reproducible provenance.
- The pipeline must normalize and deduplicate candidates before qualification.
- Every material accepted claim still needs its own evidence.
- No provider-derived field receives an unsupported `verified` label.
- Raw source responses or snapshots containing lead material remain outside Git.

## Phase 0 note

This ADR activates no provider, performs no download, and makes no website or dataset request.
