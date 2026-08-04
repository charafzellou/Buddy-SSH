# ADR-0007 — Monorepo tooling (bun + Go workspaces)

- **ADR number:** 0007
- **Title:** bun for JS, Go workspaces for Go, no monorepo orchestrator
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead DevOps, Lead Architect
- **Context trigger:** What tooling manages the monorepo?

## Context

ADR-0001 establishes a monorepo with `apps/frontend`, `apps/backend`, and
`packages/shared`. The SRS (`01-srs.md` §5) fixes bun as the JS package
manager and Go 1.26.5 for the backend. The team is small; tooling overhead
must be minimal. The user's locked decision is "bun + Go modules, no monorepo
tooling."

## Decision Drivers

- Minimal tooling overhead.
- Fast installs and builds.
- No orchestrator tax (config files, caching semantics to learn).
- Cross-platform (Windows, macOS, Linux) for local dev.

## Considered Options

### Option A — pnpm + Go workspaces + Turborepo
- **Pros:** Caching, parallel CI.
- **Cons:** Orchestrator config; pnpm not chosen by user.
- **Rejected.**

### Option B — npm + Go workspaces
- **Pros:** Default.
- **Cons:** Slower; not the user's choice.
- **Rejected.**

### Option C — bun + Go workspaces, no orchestrator ✅
- **Pros:** bun workspaces handle `packages/shared`; `go.work` handles local
  Go modules; no extra config; very fast installs; `bun run` scripts suffice
  for task orchestration.
- **Cons:** No build caching across machines (acceptable; CI cache via
  GitHub Actions cache).
- **Accepted.**

## Decision

Use **bun workspaces** for JS package management and **Go workspaces**
(`go.work` at the repo root) for local Go development. No monorepo
orchestrator (Turborepo, Nx, Lerna). Task orchestration is via `bun run`
scripts in the root `package.json` and `make` targets in a `Makefile`.

## Rationale

The project has two apps and one shared package — well within the complexity
that plain workspaces handle. bun is the fastest JS runtime/package manager
and is the user's explicit choice. Go workspaces give local edits of
`packages/shared` (when it emits Go) without `replace` directives. An
orchestrator would add config and learning cost without proportional benefit
at this scale; CI caching covers the remote-build case.

## Consequences

- **Positive:** Minimal config; fast local dev; one less tool to learn.
- **Negative:** No remote build cache; contributors run tasks via `make` or
  `bun run` rather than a unified `turbo` command.
- **Neutral:** A `Makefile` provides the canonical task entrypoints so
  contributors don't need to memorize per-package scripts.

## Compliance

- Root `package.json` declares `workspaces: ["apps/frontend", "packages/shared"]`.
- Root `go.work` includes `./apps/backend`.
- `Makefile` targets: `dev`, `build`, `test`, `lint`, `gen-protocol`,
  `docker-build`, `docker-up`.
- CI uses the same `make` targets.

## References

- [ADR-0001](./0001-monorepo-structure.md) — repo structure.
- [ADR-0009](./0009-deployment.md) — dev + Docker workflows.
