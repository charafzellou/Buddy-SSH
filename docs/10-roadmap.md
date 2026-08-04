# Phase 10 — Implementation Roadmap

**Document status:** Proposed
**Last updated:** 2026-07-26
**Scope:** Milestone plan from scaffold to release.

This roadmap breaks Phase 11 (implementation) into milestones M0-M9. Each
milestone has a scope, deliverables, exit criteria, and dependencies. The MVP
(per the locked decision) is **M0 + M1 + M2**: single SSH session with
password auth + multi-tab sessions.

> **Rule:** a milestone is not complete until its exit criteria are met and
> verified in CI. Do not start the next milestone until the current one is
> done (per `PROMPT.md` Phase 11).

---

## Milestone map

| Milestone | Title | Scope class |
|-----------|-------|-------------|
| M0 | Scaffold & tooling | MVP |
| M1 | Single SSH session (password) | MVP |
| M2 | Multi-tab sessions | MVP |
| M3 | SSH key + keyboard-interactive auth | P1 |
| M4 | Host-key TOFU + encrypted known-hosts | P1 |
| M5 | Connection profiles (IndexedDB) | P1 |
| M6 | Local key encryption (Argon2id + AES-GCM) | P1 |
| M7 | Hardening: CSP, Trusted Types, PWA, headers | P1 |
| M8 | Test suite: integration, E2E, a11y, perf | P1 |
| M9 | Docker polish + release workflow | Release |

---

## M0 — Scaffold & tooling (MVP)

**Goal:** a building, linting, CI-green monorepo with no product features.

### Deliverables

- Repo structure per [ADR-0001](./adr/0001-monorepo-structure.md):
  `apps/frontend`, `apps/backend`, `packages/shared`, `docs/`, `docker/`,
  `scripts/`, `.github/`.
- Root `package.json` (bun workspaces), `go.work`, `Makefile`
  ([ADR-0007](./adr/0007-tooling.md)).
- `apps/frontend`: Vite + Vue 3.5 + TS 7 + Pinia 3 + Tailwind skeleton; empty
  `WorkspaceView`.
- `apps/backend`: Go module, `cmd/buddy-ssh/main.go` serving `/healthz`.
- `packages/shared`: TS protocol types + Zod schemas + JSON Schema export;
  `scripts/gen-protocol.*` codegen to Go ([ADR-0001](./adr/0001-monorepo-structure.md),
  [ADR-0004](./adr/0004-websocket-encoding.md)).
- `docker/Dockerfile` (multi-stage, non-root), `docker-compose.yml` with
  healthcheck ([ADR-0009](./adr/0009-deployment.md)).
- `.github/workflows/ci.yml`: lint (biome, golangci-lint), typecheck
  (`tsc --noEmit`, `go vet`), test, `bun audit`, `govulncheck`, Docker build,
  generated-protocol freshness check.

### Exit criteria

- `make dev` starts frontend (5173) and backend (8443); `/healthz` returns 200.
- `make docker-up` serves `/healthz` from a non-root container.
- CI is green on a trivial commit.
- `make gen-protocol` produces no `git diff` after running.

### Dependencies

- None.

---

## M1 — Single SSH session, password auth (MVP)

**Goal:** connect to one host with a password and get a working terminal.

### Deliverables

- Backend: WebSocket gateway (`internal/websocket`), auth middleware
  (`internal/auth` — token + origin), SSH client (`internal/ssh` — password
  auth, permissive host-key callback for MVP), PTY + resize, keepalive,
  graceful shutdown ([`05-backend-design.md`](./05-backend-design.md)).
- Frontend: `QuickConnectDialog`, `TerminalPane` with xterm.js + Fit/WebGL
  addons, `useTerminal`, `useResize`, `transport.ts` (MessagePack),
  `useSessionStore` (single tab), `useSettingsStore` (theme/font).
- Protocol: INIT, AUTH, CONNECT, CONNECTED, DATA, STDERR, RESIZE, PING, PONG,
  KEEPALIVE, STATUS, ERROR, DISCONNECT
  ([`06-websocket-protocol.md`](./06-websocket-protocol.md)).
- Security headers middleware; structured logging with redaction filter
  ([`02-threat-model.md`](./02-threat-model.md) §5).

### Exit criteria

- Connect to a real SSH server with password; interactive shell works.
- Resize updates the remote PTY.
- Disconnect closes both WS and SSH cleanly.
- Unit tests for `auth`, `websocket` state machine, `ssh` client config,
  redaction filter.
- Integration test: WS → mock SSH server → byte round-trip.
- No secret substrings appear in logs (automated assertion).

### Dependencies

- M0.

### Known gap

- Host-key verification is permissive (MVP). Documented in SRS §9.2; MVP is
  trusted-network only.

---

## M2 — Multi-tab sessions (MVP)

**Goal:** multiple concurrent SSH sessions with a tabbed UI.

### Deliverables

- `TabBar` + `TabItem` (label, activity dot, disconnected indicator, color
  label, pin, close).
- `useSessionStore`: `openTab`, `closeTab`, `renameTab`, `duplicateTab`,
  `pinTab`, `setActive`, `reorder`.
- Per-tab `TerminalPane` instances with independent transports.
- Keyboard shortcuts: new tab, close tab, switch tab (FR-143).
- Connection-state indicators per tab.

### Exit criteria

- Open ≥ 5 concurrent tabs to different hosts; all interactive.
- Closing a tab disconnects only that session.
- Tab state (active, label, pin) persists across tab reorders.
- Unit tests for `useSessionStore` actions.
- Memory per tab < 8 MB (NFR-P6, manual check).

### Dependencies

- M1.

---

## M3 — SSH key + keyboard-interactive auth (P1)

**Goal:** support private-key and keyboard-interactive authentication.

### Deliverables

- Frontend: `AuthPrompt` modal for key upload / passphrase / kbd-interactive
  challenges.
- Frontend: parse OpenSSH and PEM key formats (use a vetted parser; no custom
  crypto).
- Backend: `ssh.PublicKeysAuth` and `ssh.KeyboardInteractive` auth methods;
  kbd-interactive challenge relay via STATUS + AUTH.
- Protocol: kbd-interactive iteration (§4 of the protocol spec).
- Decrypted keys live in memory only for the AUTH send (FR-104).

### Exit criteria

- Connect with an unencrypted OpenSSH key.
- Connect with a passphrase-protected key.
- Connect via keyboard-interactive (e.g., 2FA-prompted host).
- Unit tests for key parsing and auth-method selection.
- Integration test for kbd-interactive flow.

### Dependencies

- M1.

---

## M4 — Host-key TOFU + encrypted known-hosts (P1)

**Goal:** close the MVP host-key gap; implement TOFU with client-side
encrypted pinning.

### Deliverables

- Frontend: `useKnownHostsStore` (encrypted IndexedDB).
- Frontend: first-use fingerprint prompt; mismatch warning with friction.
- Backend: `hostkey.go` honors `mode: 'pinned' | 'first-use'` from INIT;
  mismatch → `ERROR{HOST_KEY_MISMATCH}` (FR-80..85).
- Crypto: HKDF subkey for `knownHosts` (requires M6's crypto layer; if M6
  not yet done, use a temporary in-memory key derived from a one-time prompt
  and document the interim).

### Exit criteria

- First connect prompts to accept the fingerprint; accepting pins it.
- Second connect verifies silently.
- Changed key → connection aborted, prominent warning.
- No silent trust of changed keys (automated test).
- Known-hosts DB is encrypted at rest (inspection).

### Dependencies

- M1; M6 (for full encryption) or interim workaround.

---

## M5 — Connection profiles (IndexedDB) (P1)

**Goal:** save and reload host profiles (no secrets).

### Deliverables

- `useProfileStore` (IndexedDB-backed via `services/storage.ts`).
- `ProfileList`, `ProfileCard`, `ProfileEditor` in the sidebar.
- `ProfilesView` for full management.
- Import/export profiles (JSON, no secrets).
- Folders, tags, notes, colors.

### Exit criteria

- Save a profile from an active session; reload it later; connect with one
  click (credential still required).
- Export → import round-trips profiles with no secrets.
- IndexedDB schema matches [`07-storage-spec.md`](./07-storage-spec.md).
- Unit tests for `services/storage.ts` CRUD + indexes.

### Dependencies

- M2.

---

## M6 — Local key encryption (Argon2id + AES-GCM) (P1)

**Goal:** optionally persist encrypted private keys locally, unlocked by a
master password.

### Deliverables

- `crypto/` package: `kdf.ts` (Argon2id via `hash-wasm`, PBKDF2 fallback),
  `cipher.ts` (AES-256-GCM), `keys.ts` (HKDF subkeys), `zeroize.ts`.
- `useAuthStore`: `unlock`, `lock`, `rekey`, auto-lock on idle.
- `encryptedKeys` IndexedDB store with `CryptoMetadata` envelopes.
- Master-password setup flow; rekey flow.
- Web Worker offload for KDF (`workers/crypto.worker.ts`).

### Exit criteria

- Encrypt a key, store, reload, decrypt, connect — all from the UI.
- Auto-lock fires after idle timeout; locked state cannot decrypt.
- Rekey re-encrypts all records; old master password fails.
- Tampered ciphertext fails to decrypt (automated test).
- Argon2id derivation < 2 s on reference machine.
- Full crypto test suite ([`08-crypto-spec.md`](./08-crypto-spec.md) §10).

### Dependencies

- M3, M5.

---

## M7 — Hardening: CSP, Trusted Types, PWA, headers (P1)

**Goal:** production-grade browser security and offline shell.

### Deliverables

- Strict CSP (remove `unsafe-inline` for scripts via nonces/hashes; Tailwind
  hashed styles).
- Trusted Types enforcement; CSP report endpoint.
- `Permissions-Policy`, COOP, COEP, CORP, Referrer-Policy, HSTS guidance.
- PWA: service worker caching app shell only; never secrets.
- Backend health endpoint for SPA; backend serves SPA from `embed.FS`.

### Exit criteria

- CSP report-only then enforced; no violations in normal use.
- Trusted Types active in supported browsers.
- App loads offline (shell only); connection attempts fail gracefully.
- All headers from threat model §5 present (automated test).

### Dependencies

- M1, M2.

---

## M8 — Test suite: integration, E2E, a11y, perf (P1)

**Goal:** meet the testing NFRs (NFR-M2, NFR-A1, NFR-P1..P6).

### Deliverables

- Integration tests: WS → mock SSH server; reconnect; resize; auth flows.
- E2E tests (Playwright): quick connect, multi-tab, profiles, host-key prompt.
- Accessibility tests: axe-core in E2E; keyboard-only flows.
- Performance tests: keystroke latency, resize latency, throughput, bundle
  size (enforce NFR-P5 < 350 kB).
- Coverage gate: ≥ 70 % for `crypto/`, `services/`, `internal/ssh/`,
  `internal/websocket/`.

### Exit criteria

- All suites green in CI.
- Coverage gate enforced.
- Performance budgets enforced (CI fails on regression).

### Dependencies

- M1-M7.

---

## M9 — Docker polish + release workflow (Release)

**Goal:** ship a self-hostable release.

### Deliverables

- Final multi-stage Dockerfile (distroless, non-root, multi-arch
  linux/amd64 + linux/arm64).
- `docker-compose.yml` with TLS guidance, healthcheck, resource limits.
- GitHub Actions release workflow: tag → build → sign (cosign) → publish
  image + release artifacts.
- Deployment guide (`docs/deployment.md`): token generation, reverse proxy,
  TLS, LB config.
- Contribution guide (`docs/contributing.md`).
- Polished `README.md` with quickstart.

### Exit criteria

- `docker compose up` produces a working, secure app.
- Release workflow publishes a signed image on tag.
- Deployment guide reviewed by an operator.
- All prior milestones' exit criteria still green.

### Dependencies

- M0-M8.

---

## Verification matrix

| Requirement | Milestone | Verification |
|-------------|-----------|--------------|
| FR-1, FR-3 (connect, password) | M1 | Integration test |
| FR-6, FR-7 (disconnect, keepalive) | M1 | Integration test |
| FR-20, FR-21, FR-25 (terminal, resize, themes) | M1 | Manual + unit |
| FR-28 (escape sequence sanitization) | M1 | Unit test |
| FR-40..43 (multi-tab) | M2 | Unit + manual |
| FR-4, FR-5 (key, kbd-interactive) | M3 | Integration test |
| FR-80..85 (host-key TOFU) | M4 | Integration test |
| FR-60..64 (profiles) | M5 | Unit + E2E |
| FR-62, FR-104, FR-105 (local encryption) | M6 | Unit + E2E |
| NFR-S2, NFR-S3 (CSP, Trusted Types) | M7 | Automated header test |
| NFR-A1 (WCAG AA) | M8 | axe-core |
| NFR-P1..P6 (performance) | M8 | Perf tests |
| NFR-C3 (non-root container) | M0, M9 | Dockerfile inspection |
| FR-120..123 (backend access control) | M1 | Integration test |
| FR-101, FR-102 (secret handling) | M1 | Log assertion test |

---

## Risk register (implementation)

| Risk | Milestone | Mitigation |
|------|-----------|------------|
| Codegen pipeline complexity | M0 | Start with JSON Schema → Go; keep generator simple. |
| xterm.js bundle size | M1 | Lazy-load; WebGL addon only when supported. |
| Argon2id in browser blocking UI | M6 | Offload to Web Worker. |
| CSP `unsafe-inline` for Tailwind | M7 | Move to hashed styles; time-box. |
| E2E flakiness with real SSH | M8 | Use a containerized mock SSH server. |
| Multi-arch Docker build | M9 | Use `docker buildx` in CI. |
