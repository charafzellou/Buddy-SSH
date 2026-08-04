# ADR-0006 — Frontend state management

- **ADR number:** 0006
- **Title:** Pinia for UI state, TanStack Query for async, IndexedDB for
  persistence
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Frontend, Lead Architect
- **Context trigger:** Where does each kind of state live in the frontend?

## Context

The frontend holds several distinct categories of state: ephemeral UI state
(active tab, modal open), server-derived async state (none in the MVP, since
the backend is stateless — but connection status is analogous), persistent
local state (profiles, settings, known-hosts, encrypted keys), and
session-scoped state (terminal buffers, connection state per tab). Mixing
these leads to bugs and makes the threat model's "minimum lifetime for
secrets" requirement (FR-104) hard to enforce.

## Decision Drivers

- Clear separation of ephemeral vs persistent vs secret state.
- Secret state must have a short, controlled lifetime (FR-104, FR-105).
- Persistence must use IndexedDB (FR-64, [`07-storage-spec.md`](../07-storage-spec.md)).
- Minimal reactivity footguns.

## Considered Options

### Option A — One Pinia store for everything
A single store holds tabs, profiles, settings, and decrypted keys.

- **Pros:** Simple.
- **Cons:** Secrets mixed with UI state; hard to auto-lock; reactivity
  sprawl; violates separation of concerns.
- **Rejected.**

### Option B — Pinia + TanStack Query + IndexedDB, split by concern ✅
Distinct stores per concern, with persistence delegated to a storage service
backed by IndexedDB, and async/server-derived state managed by TanStack Query.

- **Pros:** Clear boundaries; secrets isolated in an `useAuthStore` with
  explicit lock/unlock; persistence is testable; TanStack Query handles
  caching/retries for any future server-derived data.
- **Cons:** More files; contributors must learn where each state belongs.
- **Accepted.**

### Option C — Pinia + custom persistence composables (no TanStack Query)
Drop TanStack Query; use Pinia + `useStorage`-style composables.

- **Pros:** One fewer dep.
- **Cons:** Reimplements caching/invalidation; future server-derived features
  (e.g., backend health, telemetry) would suffer.
- **Rejected.**

## Decision

Adopt **Option B** with the following store layout (detailed in
[`04-frontend-design.md`](../04-frontend-design.md)):

| Store | Responsibility | Persistence |
|-------|----------------|-------------|
| `useSessionStore` | Tabs, active tab, per-tab connection state, reconnect triggers | None (ephemeral) |
| `useProfileStore` | Connection profiles (no secrets) | IndexedDB (`profiles` store) |
| `useSettingsStore` | Theme, font, shortcuts, idle timeout | IndexedDB (`settings` store) |
| `useAuthStore` | Master password session, derived CryptoKey, lock state | None (memory only; never persisted) |
| `useKnownHostsStore` | Pinned host keys (encrypted) | IndexedDB (`knownHosts` store), encrypted via `useAuthStore` |

TanStack Query is used for any async server-derived data (e.g., backend health
checks in M7+); the MVP uses it lightly, but the pattern is established now.

## Rationale

Splitting state by concern makes the secret-handling invariants enforceable:
`useAuthStore` is the only place a derived key lives, and it can be
auto-locked (FR-105) without touching UI state. IndexedDB persistence is
centralized in a storage service so encryption is applied uniformly. TanStack
Query future-proofs the async layer without adding cost today.

## Consequences

- **Positive:** Secrets are isolated and auto-lockable; persistence is
  testable; clear ownership for each piece of state.
- **Negative:** Contributors must consult this ADR to know where new state
  belongs.
- **Neutral:** TanStack Query is a dependency even though the MVP uses it
  lightly.

## Compliance

- `apps/frontend/src/stores/` contains exactly the stores listed above.
- Lint rule: `useAuthStore` may not be imported outside `crypto/`,
  `services/`, or `stores/`.
- Unit tests assert `useAuthStore` clears its CryptoKey on `lock()`.

## References

- [`04-frontend-design.md`](../04-frontend-design.md) — store details.
- [`07-storage-spec.md`](../07-storage-spec.md) — IndexedDB schema.
- [`08-crypto-spec.md`](../08-crypto-spec.md) — key lifecycle.
- [ADR-0002](./0002-frontend-stack.md) — stack selection.
