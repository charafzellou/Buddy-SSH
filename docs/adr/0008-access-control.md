# ADR-0008 — Backend access control (shared static token)

- **ADR number:** 0008
- **Title:** Shared static bearer token validated on every WebSocket upgrade
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Security, Lead Architect
- **Context trigger:** How is access to the backend WebSocket gateway
  controlled, given no user accounts?

## Context

The SRS (`01-srs.md` §5 constraint 3) forbids user accounts. The backend is
self-hosted and may be exposed beyond localhost, so it needs an access-control
layer beyond network isolation. The threat model (`02-threat-model.md` §2.2)
identifies CSWSH, brute force, and timing attacks as relevant vectors. The
user's locked decision is "shared static token."

## Decision Drivers

- No user accounts (SRS constraint).
- Simple to configure and operate.
- Resist CSWSH, brute force, timing attacks.
- Composable with network-layer controls (VPN, IP allowlist).

## Considered Options

### Option A — Open backend (network-only)
Rely on localhost binding / VPN / reverse proxy.

- **Pros:** Simplest.
- **Cons:** No defense in depth; a misconfigured proxy exposes an open SSH
  relay.
- **Rejected.**

### Option B — Shared static bearer token ✅
A single random token configured via `BUDDY_SSH_TOKEN`; required on every WS
upgrade; constant-time compared; origin allowlist enforced alongside.

- **Pros:** Simple; defense in depth; works behind any proxy.
- **Cons:** Shared secret (no per-user attribution); rotation is manual.
- **Accepted.**

### Option C — Per-session ephemeral token minted by frontend
Frontend mints a short-lived token; backend validates via a shared HMAC key.

- **Pros:** Per-session scoping; expiry.
- **Cons:** Adds complexity; the frontend has no server-side identity to
  anchor the mint; doesn't materially improve security over Option B given
  no user accounts.
- **Rejected.**

### Option D — mTLS
Client certificates for backend access.

- **Pros:** Strong.
- **Cons:** Heavyweight for a self-hosted tool; cert distribution burden.
- **Rejected** (could be revisited for enterprise deployments).

## Decision

Adopt **Option B**: a shared static bearer token. The backend reads
`BUDDY_SSH_TOKEN` from the environment at startup and **fails to start** if it
is unset or empty. Every WebSocket upgrade must present the token (in the
`Sec-WebSocket-Protocol` subprotocol or an `Authorization: Bearer` header);
comparison uses `crypto/subtle.ConstantTimeCompare`. An origin allowlist
(`BUDDY_SSH_ALLOWED_ORIGINS`) is enforced in parallel to mitigate CSWSH.

## Rationale

A shared static token is the simplest control that provides defense in depth
beyond network isolation, satisfies the no-accounts constraint, and resists
the relevant threats when combined with an origin allowlist and constant-time
comparison. Per-session tokens (Option C) add complexity without real benefit
absent user identity. mTLS (Option D) is disproportionate for the typical
self-hosted deployment but remains a future option for enterprise.

## Consequences

- **Positive:** Simple, effective access control; clear failure mode
  (backend won't start without a token).
- **Negative:** No per-user attribution in logs; token rotation is a manual
  ops task (documented in deployment guide).
- **Neutral:** Operators are expected to combine the token with network-layer
  controls (VPN, IP allowlist) for production exposure.

## Compliance

- Backend startup asserts `BUDDY_SSH_TOKEN` is non-empty (FR-121).
- Upgrade handler uses `subtle.ConstantTimeCompare` (FR-122).
- Origin allowlist enforced (FR-123).
- Integration tests: missing/wrong token → 401; cross-origin → 403.
- Deployment guide documents token generation (`openssl rand -hex 32`).

## References

- [`05-backend-design.md`](../05-backend-design.md) — auth middleware.
- [`02-threat-model.md`](../02-threat-model.md) §2.2 — backend threats.
- [ADR-0005](./0005-stateless-backend.md) — stateless model.
- [ADR-0009](./0009-deployment.md) — deployment guidance.
