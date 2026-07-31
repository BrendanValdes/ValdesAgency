# ADR 0002: SQLite With Write-Ahead Logging

- Status: Accepted for future implementation
- Date: 2026-07-31
- Scope: Storage decision only; no Phase 0 database

## Context

The future canonical pipeline needs durable local records, idempotent stage transitions, evidence references, and reproducible decisions without introducing a remote service. Operational data includes real lead material and therefore cannot live in Git.

## Decision

Use SQLite with write-ahead logging for future operational storage. The database, WAL, and shared-memory files must live in an operator-controlled data directory outside the repository. Schema migrations will be versioned as code, but database contents will not be versioned.

The future persistence layer must use bounded transactions, a single migration owner, busy-timeout handling, and explicit checkpoint and backup procedures. Evidence blobs remain external files referenced by immutable identifiers rather than being committed to Git.

## Consequences

- Local operation and transactional stage updates remain simple.
- Readers may coexist with the controlled writer, but WAL lifecycle and backups require operational care.
- Network filesystems and repository-relative database paths are unsupported.
- Real databases, WAL files, generated exports, private benchmarks, caches, logs, evidence, and temporary runs remain outside Git.

## Phase 0 note

Phase 0 creates no database, opens no SQLite connection, and adds no SQLite dependency.
