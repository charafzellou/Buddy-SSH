# ADR-0009 — Dual dev + Docker deployment

- **ADR number:** 0009
- **Title:** Maintain both local `go run`/`bun dev` and Docker workflows
  from day one
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead DevOps, Lead Architect
- **Context trigger:** How do developers run Buddy-SSH locally, and how is it
  deployed in production?

## Context

The SRS (`01-srs.md` §5) and the user's locked decision require both a fast
local dev loop and a production-grade Docker path. NFR-C3 mandates a non-root
container. The threat model (§5) requires correct security headers and TLS in
production. ADR-0007 fixes bun + Go workspaces with a `Makefile` as the task
entrypoint.

## Decision Drivers

- Fast inner-loop dev (sub-second HMR).
- Production parity (same binary, same headers).
- Non-root, minimal container image.
- Simple self-host story (one `docker compose up`).

## Considered Options

### Option A — Dev only (`go run` + `bun dev`); Docker later
- **Pros:** Least effort now.
- **Cons:** Production path untested until late; risk of prod-only bugs.
- **Rejected.**

### Option B — Docker only
- **Pros:** One path.
- **Cons:** Slow inner loop; rebuild for every code change.
- **Rejected.**

### Option C — Both dev and Docker in parallel ✅
- **Pros:** Fast dev loop + production parity from day one; CI builds Docker
  image every commit, catching prod issues early.
- **Cons:** Two paths to maintain.
- **Accepted.**

## Decision

Maintain **both** workflows:

1. **Local dev** — `make dev` runs `bun dev` (Vite, port 5173) and
   `go run ./apps/backend` (port 8443) concurrently, with the frontend
   dev-server proxying `/ws` to the backend. TLS is optional in dev
   (self-signed or plaintext behind a local proxy).
2. **Docker** — a multi-stage `Dockerfile` (in `docker/`) builds the Go
   binary and the Vite SPA, then copies both into a non-root distroless
   image. `docker-compose.yml` runs the backend serving the SPA on 8443 with
   a healthcheck. A dev compose file (`docker-compose.dev.yml`) is provided
   for parity testing.

## Rationale

Parallel dev and Docker paths catch production-only issues early (header
serving, static asset paths, TLS) without sacrificing dev speed. The
multi-stage Docker build keeps the image small and non-root (NFR-C3), and the
healthcheck supports safe orchestration. The `Makefile` (ADR-0007) provides a
single entrypoint so contributors don't need to know both paths in detail.

## Consequences

- **Positive:** Production image tested in CI from M0; dev loop stays fast;
  self-host is one `docker compose up`.
- **Negative:** Two configs to keep in sync (dev proxy + prod static
  serving); mitigated by the backend serving the SPA in both.
- **Neutral:** TLS termination can be done by the backend (self-host) or a
  reverse proxy (enterprise); documented in the deployment guide.

## Compliance

- `docker/Dockerfile` is multi-stage, final stage `nonroot` distroless.
- `docker-compose.yml` defines a healthcheck hitting `/healthz`.
- CI builds the image on every PR and runs smoke tests.
- `make dev` and `make docker-up` both produce a working app at
  `https://localhost:8443` (or `http://localhost:5173` for the Vite dev
  server).

## References

- [ADR-0007](./0007-tooling.md) — tooling & `Makefile`.
- [ADR-0008](./0008-access-control.md) — token env var.
- [`05-backend-design.md`](../05-backend-design.md) — health endpoint.
- [`10-roadmap.md`](../10-roadmap.md) — M0 scaffold, M9 release.
