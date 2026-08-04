# ADR-0001 — Monorepo structure & shared types

- **ADR number:** 0001
- **Title:** Monorepo structure with a shared protocol-types package
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Architect, Lead Frontend, Lead Backend
- **Context trigger:** How do we keep the Vue frontend and Go backend in sync
  on the WebSocket wire format without drift?

## Context

Buddy-SSH has two independently built artifacts (a Vue SPA and a Go binary)
that must agree byte-for-byte on the WebSocket protocol defined in
[`06-websocket-protocol.md`](../06-websocket-protocol.md). Drift between the
two sides causes silent runtime failures that are expensive to debug. We also
need a home for shared documentation, Docker, scripts, and CI.

The SRS (`01-srs.md` §5) fixes the toolchain: Go 1.26.5, TypeScript 7.0, and
bun as the JS package manager. The threat model (`02-threat-model.md` §3)
requires schema validation on both sides to prevent type confusion.

## Decision Drivers

- Single source of truth for the wire protocol.
- Independent build/deploy of frontend and backend.
- Low tooling overhead (no monorepo orchestrator per ADR-0007).
- Clear boundaries for future extraction (e.g., a CLI client).

## Considered Options

### Option A — Single repo, no shared package
Frontend and backend each define their own protocol types.

- **Pros:** Simplest; no codegen.
- **Cons:** Drift inevitable; type confusion risk; double maintenance.
- **Rejected because:** Type safety across the wire is a security requirement
  (threat model §2.3).

### Option B — Monorepo with shared TS package, Go types hand-written
One repo, `packages/shared` holds TS types; backend re-implements them in Go
by hand.

- **Pros:** Shared TS source; backend stays idiomatic Go.
- **Cons:** Hand-written Go can still drift; no automated check.
- **Rejected because:** Manual sync defeats the purpose.

### Option C — Monorepo with shared TS package + Go codegen ✅
One repo, `packages/shared` holds TS types as the source of truth; a codegen
step emits Go structs from the TS schema (via a schema definition such as
JSON Schema or a Zod-to-Go transformer). Both sides import generated code.

- **Pros:** Single source of truth; both sides type-checked; CI can verify
  generated code is up to date.
- **Cons:** Codegen pipeline to maintain; Go output must be reviewed.
- **Accepted.**

### Option D — Polyrepo with a published shared package
Separate repos; `packages/shared` published to a registry.

- **Pros:** Clean versioning.
- **Cons:** Overhead for a single-team project; version skew risk.
- **Rejected because:** Premature for the current team size.

## Decision

Adopt **Option C**: a single Git repository (monorepo) with the following
top-level structure, and a `packages/shared` package whose TypeScript types
are the single source of truth for the WebSocket protocol, with Go types
generated into `apps/backend/internal/protocol`.

```
apps/
    frontend/          # Vue 3 SPA (bun, Vite)
    backend/           # Go binary (go modules)
packages/
    shared/            # TS protocol types + Zod schemas (source of truth)
docs/                  # this documentation
scripts/               # codegen, release helpers
docker/                # Dockerfiles, compose
.github/               # CI workflows
```

## Rationale

A monorepo keeps the frontend, backend, and shared protocol in lockstep. The
shared TS package is the source of truth because the frontend is the more
schema-heavy consumer (Zod runtime validation) and TS is the richer type
language for the protocol's discriminated unions. Generating Go structs from
the same schema gives the backend compile-time guarantees without forcing a
hand-sync. This directly mitigates the type-confusion threat
(`02-threat-model.md` §2.3).

## Consequences

- **Positive:** Wire-format drift is caught at build time; one PR can change
  the protocol on both sides; CI verifies generated Go is fresh.
- **Negative:** A codegen step must be maintained; contributors must run
  `scripts/gen-protocol.*` after editing `packages/shared`.
- **Neutral:** The Go module lives under `apps/backend/` and uses a Go
  workspace file at the repo root for local development.

## Compliance

- CI step `Check generated protocol` runs the codegen and fails if
  `git diff` is non-empty.
- `packages/shared` exports both TS types and a JSON Schema file consumed by
  the generator.
- ADR-0004 references this ADR for encoding decisions.

## References

- [ADR-0004](./0004-websocket-encoding.md) — encoding choice for the protocol.
- [ADR-0007](./0007-tooling.md) — bun + Go workspaces, no orchestrator.
- [`06-websocket-protocol.md`](../06-websocket-protocol.md) — the protocol.
