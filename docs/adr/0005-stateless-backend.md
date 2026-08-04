# ADR-0005 — Stateless backend & horizontal scaling

- **ADR number:** 0005
- **Title:** The backend holds no per-session state beyond a single WebSocket
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Architect, Lead Backend, Lead DevOps
- **Context trigger:** How do we scale the backend and survive restarts
  without a session store?

## Context

The SRS (`01-srs.md` §5 constraint 5) mandates a stateless backend: each
WebSocket owns exactly one SSH session, and no server-side session map exists.
The threat model (`02-threat-model.md` §2.2) requires that a backend crash
must not corrupt user data and that credentials are never persisted. NFR-R3
requires the frontend to survive a backend restart by offering reconnection.

## Decision Drivers

- Horizontal scalability without sticky sessions.
- Zero secret persistence.
- Simple operations (no DB, no Redis, no session cleanup).
- Resilience to backend restarts.

## Considered Options

### Option A — Stateful backend with a session store
Backend keeps a map of session IDs to SSH connections; a store (Redis/SQLite)
tracks them.

- **Pros:** Could support resume-after-reconnect on the same backend.
- **Cons:** Requires a store; secrets-adjacent state on the backend; sticky
  sessions or a shared store; complex cleanup; violates SRS constraint 5.
- **Rejected.**

### Option B — Stateless backend, client-driven reconnect ✅
Each WebSocket owns one SSH session. On disconnect (client drop or backend
restart), the SSH session is torn down. The frontend preserves scrollback
client-side and re-establishes a fresh session (re-AUTH) via reconnection
logic.

- **Pros:** Trivial horizontal scaling (any instance serves any WS); no
  shared state; no secret persistence; simple ops.
- **Cons:** A backend restart kills active sessions (acceptable per NFR-R3;
  the terminal scrollback is preserved client-side).
- **Accepted.**

### Option C — Hybrid: stateless + external session resume service
A separate service holds resumable session tokens.

- **Pros:** Resume across restarts.
- **Cons:** Massive complexity; re-introduces server-side state; security
  review burden.
- **Rejected.**

## Decision

Adopt **Option B**: a fully stateless backend. Each WebSocket connection owns
exactly one SSH session; when the WebSocket closes for any reason, the SSH
session is closed and all in-memory credentials are released. The frontend
handles reconnection by opening a new WebSocket and re-authenticating.

## Rationale

Statelessness is the single most important architectural choice for meeting
the security constraints (no secret persistence) and the operability goals
(trivial scaling, no DB). The cost — losing the SSH session on backend
restart — is acceptable because (a) terminal scrollback is preserved
client-side, (b) reconnection is automated (FR-8), and (c) the operator
experience of a stateless backend is dramatically simpler. This aligns with
the project vision of a "secure SSH transport layer" rather than a session
manager.

## Consequences

- **Positive:** Any backend instance can serve any client; load balancing
  needs no stickiness; deploys/restarts are safe (no orphaned sessions);
  no database to operate or back up.
- **Negative:** No server-side session resume; a flapping network causes
  repeated re-AUTH (mitigated by exponential backoff, FR-8).
- **Neutral:** The frontend is the source of truth for all persistent state
  (profiles, known-hosts, encrypted keys).

## Compliance

- Backend code has no package-level mutable session map; lint rule forbids
  `map[...]session` at package scope.
- Integration test: kill the backend process, restart, and assert the
  frontend offers reconnection per tab.
- Code review checklist: no `os.WriteFile` of credential-shaped data.

## References

- [ADR-0003](./0003-backend-stack.md) — backend stack.
- [ADR-0008](./0008-access-control.md) — per-connection token auth.
- [`05-backend-design.md`](../05-backend-design.md) — connection lifecycle.
- [`09-diagrams.md`](../09-diagrams.md) — reconnect sequence.
