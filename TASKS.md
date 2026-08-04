# TASKS.md — Buddy-SSH Implementation Tracker

> **Workflow:** Do one task → mark `[x]` → test it → mark `[✓]` → move to the next.
> Never start the next task until the current one is done **and** tested.
>
> **Status legend:**
> - `[ ]` — not started
> - `[~]` — in progress
> - `[x]` — done (implementation complete, not yet tested)
> - `[✓]` — done **and** tested
> - `[!]` — blocked / needs attention
>
> **References:** Design docs live in [`docs/`](./docs/README.md). Roadmap
> details in [`docs/10-roadmap.md`](./docs/10-roadmap.md).

---

## M0 — Scaffold & tooling (MVP)

> **Goal:** a building, linting, CI-green monorepo with no product features.
> **Exit criteria:** `make dev` starts frontend (5173) + backend (8443);
> `/healthz` returns 200; `make docker-up` works; CI green; codegen fresh.

### M0.1 — Repository structure

- [✓] **M0.1.1** Create monorepo directory tree per ADR-0001:
  `apps/frontend/`, `apps/backend/`, `packages/shared/`, `scripts/`,
  `docker/`, `.github/workflows/`.
  - **Test:** `ls apps/frontend apps/backend packages/shared scripts docker .github/workflows` succeeds.

- [✓] **M0.1.2** Create root `package.json` with bun workspaces
  (`apps/frontend`, `packages/shared`) and scripts (`dev`, `build`, `test`,
  `lint`, `gen-protocol`).
  - **Test:** `bun install` succeeds; `bun pm ls` lists both workspaces.

- [✓] **M0.1.3** Create root `go.work` including `./apps/backend`.
  - **Test:** `go work edit -json` lists `./apps/backend`; `cd apps/backend && go build ./...` succeeds.

- [✓] **M0.1.4** Create `Makefile` with targets: `dev`, `build`, `test`,
  `lint`, `gen-protocol`, `docker-build`, `docker-up`, `docker-down`.
  - **Test:** `make` (no target) prints help; each target runs without error (even if no-op for now).
  - **Note:** `make` not available on Windows dev machine; equivalent `bun`
    scripts added to root `package.json` for parity. Makefile is valid for
    Linux/CI/Docker per ADR-0007.

### M0.2 — Frontend skeleton

- [✓] **M0.2.1** Scaffold `apps/frontend` with Vite 8 + Vue 3.5 + TypeScript 7.
  - **Test:** `cd apps/frontend && bun run build` produces `dist/`.

- [✓] **M0.2.2** Add Pinia 3, Vue Router, TailwindCSS, VueUse, Zod,
  TanStack Query, `@msgpack/msgpack`, xterm.js + addons (Fit, Search,
  WebLinks, Serialize, Clipboard, WebGL), `hash-wasm`.
  - **Test:** `bun install` succeeds; `package.json` matches ADR-0002.

- [✓] **M0.2.3** Create `apps/frontend/src` module folders per
  [`04-frontend-design.md`](./docs/04-frontend-design.md) §1 (components/,
  views/, layouts/, stores/, services/, composables/, terminal/, crypto/,
  workers/, types/, utils/, router/).
  - **Test:** all folders exist; `tsc --noEmit` passes on an empty `App.vue`.

- [✓] **M0.2.4** Create minimal `App.vue` + `main.ts` (Pinia, Router,
  TanStack Query setup) + empty `WorkspaceView.vue`.
  - **Test:** `bun run dev` serves a blank page at `http://localhost:5173`.

- [✓] **M0.2.5** Configure Tailwind (`tailwind.config.ts`, dark mode,
  CSS variables) and biome (lint/format).
  - **Test:** `bun run lint` passes; dark mode class toggles on `<html>`.

### M0.3 — Backend skeleton

- [✓] **M0.3.1** Init `apps/backend/go.mod` (Go 1.26.5, module
  `github.com/charafzellou/buddy-ssh/apps/backend`).
  - **Test:** `go mod tidy` succeeds; `go build ./...` passes.

- [✓] **M0.3.2** Add deps: `golang.org/x/crypto/ssh`, `github.com/coder/websocket`,
  `github.com/creack/pty`, `github.com/vmihailenco/msgpack/v5`.
  - **Test:** `go mod tidy`; `go list -m all` shows all four.

- [✓] **M0.3.3** Create `cmd/buddy-ssh/main.go` serving `/healthz` →
  `200 {"status":"ok"}` on port 8443.
  - **Test:** `go run ./cmd/buddy-ssh` then `curl http://localhost:8443/healthz` returns 200.

- [✓] **M0.3.4** Create `internal/` package folders per
  [`05-backend-design.md`](./docs/05-backend-design.md) §1 (config, auth,
  websocket, ssh, middleware, logging, telemetry, server).
  - **Test:** each package has a `doc.go` or initial file; `go vet ./...` passes.

- [✓] **M0.3.5** Add golangci-lint config (`.golangci.yml`) aligned with
  NFR-M1.
  - **Test:** `golangci-lint run` passes (install if needed).

### M0.4 — Shared protocol package & codegen

- [✓] **M0.4.1** Create `packages/shared` with TS protocol types + Zod
  schemas for the envelope and all 13 message types per
  [`06-websocket-protocol.md`](./docs/06-websocket-protocol.md).
  - **Test:** `bun run --filter packages/shared build` succeeds; types export correctly.

- [✓] **M0.4.2** Export a JSON Schema file from `packages/shared` (for Go
  codegen).
  - **Test:** `packages/shared/dist/schema.json` exists and validates against
    a JSON Schema meta-schema.

- [✓] **M0.4.3** Create `scripts/gen-protocol.ts` (or `.go`) that reads the
  JSON Schema and emits Go structs into
  `apps/backend/internal/protocol/protocol_gen.go`.
  - **Test:** `make gen-protocol` runs; `git diff` is empty after running on
    a fresh checkout.

- [✓] **M0.4.4** Add MessagePack encode/decode helpers in
  `apps/backend/internal/protocol` (wrapping `vmihailenco/msgpack`) using
  generated types.
  - **Test:** unit test round-trips an INIT message through encode → decode.

### M0.5 — Docker

- [✓] **M0.5.1** Create `docker/Dockerfile` (multi-stage: build Go binary +
  Vite SPA → distroless non-root final stage).
  - **Test:** `docker build -f docker/Dockerfile -t buddy-ssh .` succeeds;
    `docker run --rm buddy-ssh /healthz` works (or container starts and
    healthcheck passes).

- [✓] **M0.5.2** Create `docker-compose.yml` with healthcheck hitting
  `/healthz`, env for `BUDDY_SSH_TOKEN`, port 8443.
  - **Test:** `docker compose up -d --build` → `curl http://localhost:8443/healthz` returns 200.

- [✓] **M0.5.3** Create `docker-compose.dev.yml` for parity testing (mounts
  source, hot reload).
  - **Test:** `docker compose -f docker-compose.dev.yml up` starts and serves `/healthz`.

### M0.6 — CI

- [✓] **M0.6.1** Create `.github/workflows/ci.yml` with jobs: lint (biome +
  golangci-lint), typecheck (`tsc --noEmit` + `go vet`), test, `bun audit`,
  `govulncheck`, Docker build, generated-protocol freshness check.
  - **Test:** push a trivial commit; CI is green on GitHub.
  - **Note:** locally validated with `actionlint`, repo lint/test/build,
    `bun audit`, `govulncheck`, Docker build, and protocol freshness checks.

- [✓] **M0.6.2** Add `.gitignore` (node_modules, dist, binaries, .env,
  coverage).
  - **Test:** `git status` is clean after a build.

---

## M1 — Single SSH session, password auth (MVP)

> **Goal:** connect to one host with a password and get a working terminal.
> **Exit criteria:** interactive shell works; resize updates PTY; disconnect
> cleans up; no secrets in logs; unit + integration tests pass.
> **Known gap:** permissive host-key callback (closed in M4).

### M1.1 — Backend config

- [✓] **M1.1.1** Implement `internal/config/config.go`: env-driven `Config`
  struct with all fields per [`05-backend-design.md`](./docs/05-backend-design.md)
  §6; `Load()` + `Validate()`; fail-fast if `BUDDY_SSH_TOKEN` empty.
  - **Test:** unit test asserts defaults, env override, and failure when token missing.

### M1.2 — Backend auth middleware

- [✓] **M1.2.1** Implement `internal/auth/token.go`: `Validate(token string)
  bool` using `subtle.ConstantTimeCompare`.
  - **Test:** unit test: correct token → true; wrong → false; empty → false;
    timing is constant (best-effort assertion).

- [✓] **M1.2.2** Implement `internal/auth/origin.go`: allowlist check
  against `Origin` header.
  - **Test:** unit test: allowed origin → true; disallowed → false; missing
    header → false (or localhost-only default).

### M1.3 — Backend logging

- [✓] **M1.3.1** Implement `internal/logging/logger.go`: `slog` JSON handler,
  level via env, redaction filter for `password|passphrase|key|token|secret|credential`.
  - **Test:** unit test feeds secret-shaped fields; asserts output contains
    `[REDACTED]` and no secret substring.

- [✓] **M1.3.2** Implement `internal/middleware/logging.go`: per-request ID
  generation, structured log on request, propagation to downstream handlers.
  - **Test:** unit test asserts `request_id` present in logs and unique per request.

- [✓] **M1.3.3** Implement `internal/middleware/headers.go`: security headers
  per [`02-threat-model.md`](./docs/02-threat-model.md) §5 (CSP, HSTS,
  X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, CORP,
  X-Content-Type-Options).
  - **Test:** unit test asserts all headers present with correct values on a sample response.

- [✓] **M1.3.4** Implement `internal/middleware/recovery.go`: panic recovery
  → log + generic 500.
  - **Test:** unit test triggers a panic in a test handler; asserts 500 and
    no process crash.

### M1.4 — Backend WebSocket gateway

- [✓] **M1.4.1** Implement `internal/websocket/gateway.go`: `http.Handler`
  for `/ws`; token + origin checks; `coder/websocket.Accept` with
  subprotocols `buddy-ssh.msgpack`, `buddy-ssh.json`; `SetReadLimit`.
  - **Test:** integration test: missing token → 401; wrong token → 401;
    cross-origin → 403; valid → 101.

- [✓] **M1.4.2** Implement `internal/websocket/conn.go`: per-connection
  state machine (INIT → AUTH → CONNECT → CONNECTED → DATA/RESIZE/PING →
  DISCONNECT); out-of-order → ERROR + close.
  - **Test:** unit test drives each valid transition; asserts ERROR on
    out-of-order (e.g., DATA before CONNECTED).

- [✓] **M1.4.3** Implement `internal/websocket/framing.go`: MessagePack +
  JSON encode/decode using generated types; schema validation on decode.
  - **Test:** unit test round-trips each message type in both encodings;
    malformed input → error.

### M1.5 — Backend SSH layer

- [✓] **M1.5.1** Implement `internal/ssh/client.go`: build
  `ssh.ClientConfig` from INIT/AUTH; restricted algorithms; 10s dial
  timeout; password auth method.
  - **Test:** unit test asserts config fields, algorithm allowlist, and
    auth method selection for password.

- [✓] **M1.5.2** Implement `internal/ssh/hostkey.go`: callback honoring
  `mode: 'first-use' | 'pinned'`; MVP first-use logs fingerprint and accepts;
  pinned compares SHA-256; mismatch → error.
  - **Test:** unit test: first-use accepts; pinned match accepts; pinned
    mismatch returns error.

- [✓] **M1.5.3** Implement `internal/ssh/pty.go`: `RequestPty` +
  `WindowChange`; `internal/ssh/session.go`: `Session` wrapper (Stdin,
  Stdout, Stderr, Close).
  - **Test:** unit test with an in-process `golang.org/x/crypto/ssh` server:
    PTY granted, window-change accepted.

- [✓] **M1.5.4** Implement keepalive: `SendRequest("keepalive@openssh.com")`
  every `config.Keepalive`; idle timeout → DISCONNECT.
  - **Test:** integration test with mock SSH server; idle timeout fires
    within test window.

- [✓] **M1.5.5** Implement credential zeroization: clear passphrase/password
  byte slices after `ssh.Dial` returns (best-effort, documented).
  - **Test:** unit test asserts buffers are zeroed after dial (where API
    exposes mutable buffers).

### M1.6 — Backend server wiring & shutdown

- [✓] **M1.6.1** Implement `internal/server/server.go`: wire middleware
  chain, `/healthz`, `/ws`, static SPA serving from `embed.FS`.
  - **Test:** integration test: `/healthz` 200; `/ws` upgrades; `/` serves
    index.html.

- [✓] **M1.6.2** Implement graceful shutdown in `cmd/buddy-ssh/main.go`:
  SIGINT/SIGTERM → `server.Shutdown(ctx)` with `ShutdownTimeout`; drain
  active connections.
  - **Test:** integration test: start server, open a WS, send SIGTERM,
    assert connection closes and process exits within timeout.

### M1.7 — Frontend transport & protocol

- [✓] **M1.7.1** Implement `apps/frontend/src/services/protocol.ts`:
  MessagePack encode/decode + Zod validation for all message types (import
  from `packages/shared`).
  - **Test:** unit test round-trips each message type; invalid payload
    throws.

- [✓] **M1.7.2** Implement `apps/frontend/src/services/transport.ts`:
  WebSocket client class; connect with token + subprotocol; send/receive
  envelopes; expose `onData`, `onStatus`, `onError` callbacks; close.
  - **Test:** unit test with a mock WS server: connect, send INIT, receive
    CONNECTED, send DATA, receive DATA, close.

### M1.8 — Frontend stores

- [✓] **M1.8.1** Implement `useSessionStore` (single-tab MVP): `openTab`,
  `closeTab`, `setActive`, `state` per tab, `transport` ref.
  - **Test:** unit test: openTab creates a tab; closeTab removes it;
    setActive changes active id.

- [✓] **M1.8.2** Implement `useSettingsStore`: theme (dark/light + OS
  preference), fontFamily, fontSize, scrollback; persist to IndexedDB
  (deferred to M5 — use in-memory for now with a TODO).
  - **Test:** unit test: theme toggle updates state; `prefers-color-scheme`
    respected on init.

### M1.9 — Frontend terminal

- [✓] **M1.9.1** Implement `terminal/xtermFactory.ts`: create `Terminal`
  with options from settings; attach Fit, Search, WebLinks, Serialize,
  Clipboard (OSC 52 disabled), WebGL (canvas fallback) addons.
  - **Test:** unit test: factory returns a Terminal with addons attached;
    OSC 52 disabled flag set.

- [✓] **M1.9.2** Implement `terminal/sanitize.ts`: filter/block OSC 52
  clipboard writes unless opted in; truncate title sequences.
  - **Test:** unit test: OSC 52 sequence blocked by default; allowed when
    opt-in flag set.

- [✓] **M1.9.3** Implement `terminal/theme.ts`: build `ITheme` from CSS
  variables for dark/light.
  - **Test:** unit test: dark and light themes produce expected colors.

- [✓] **M1.9.4** Implement `composables/useTerminal.ts`: lifecycle (create
  → open → wire transport → dispose); wire `transport.onData` →
  `terminal.write` and `terminal.onData` → `transport.send(DATA)`.
  - **Test:** unit test with mock transport + fake DOM: keystroke sends
    DATA; received DATA writes to terminal.

- [✓] **M1.9.5** Implement `composables/useResize.ts`: ResizeObserver +
  50ms debounce → `transport.send(RESIZE)`.
  - **Test:** unit test: resize event fires; debounced; RESIZE sent with
    correct cols/rows.

### M1.10 — Frontend UI

- [✓] **M1.10.1** Implement `components/layout/AppShell.vue`: grid layout
  (sidebar + tab bar + pane + status bar placeholders).
  - **Test:** manual — renders without errors; layout regions visible.

- [✓] **M1.10.2** Implement `components/connect/QuickConnectDialog.vue`:
  parse `user@host:port`; collect password; call `useSessionStore.openTab`.
  - **Test:** unit test: valid input parses; invalid input shows error;
    submit calls openTab with correct params.

- [✓] **M1.10.3** Implement `components/terminal/TerminalPane.vue`: host
  xterm.js via `useTerminal`; mount/unmount lifecycle.
  - **Test:** manual — pane renders a terminal; typing echoes (against a
    running backend + real or mock SSH).

- [✓] **M1.10.4** Implement `components/layout/StatusBar.vue`: show
  connection state + latency (from PING/PONG).
  - **Test:** unit test: state changes reflect in UI; latency updates on PONG.

### M1.11 — Integration

- [!] **M1.11.1** End-to-end manual test: `make dev` → quick connect to a
  real SSH server with password → interactive shell → resize → disconnect.
  - **Test:** manual checklist passes; no errors in console or backend logs.
  - **Note:** Live smoke now reaches `/healthz`, websocket connect, terminal mount,
    and connected/latency UI against a local SSH daemon, but the browser-driven
    interactive keystroke step still disconnects before a full shell echo can be
    verified. Automated WS→SSH byte round-trip coverage is in place under
    M1.11.2.

- [✓] **M1.11.2** Integration test: WS → in-process mock SSH server →
  byte round-trip (INIT/AUTH/CONNECT/DATA/RESIZE/DISCONNECT).
  - **Test:** automated test passes in CI.

- [✓] **M1.11.3** Log redaction test: connect with a password; grep backend
  logs; assert password substring absent.
  - **Test:** automated assertion passes.

---

## M2 — Multi-tab sessions (MVP)

> **Goal:** multiple concurrent SSH sessions with a tabbed UI.
> **Exit criteria:** ≥5 concurrent tabs; closing one disconnects only that
> session; tab state persists across reorders; memory < 8 MB/tab.

### M2.1 — Tab UI

- [ ] **M2.1.1** Implement `components/tabs/TabItem.vue`: label, activity
  dot, disconnected indicator, color label, pin button, close button.
  - **Test:** unit test: props render correctly; click events emit.

- [ ] **M2.1.2** Implement `components/tabs/TabBar.vue`: render tabs from
  `useSessionStore`; active tab highlighting; click to switch.
  - **Test:** unit test: renders N tabs; click switches active.

- [ ] **M2.1.3** Implement tab drag-and-drop reorder (VueUse
  `useDraggable` or a lightweight library).
  - **Test:** unit test: drag tab from index 0 to 2; `reorder` called with
    new order.

### M2.2 — Session store multi-tab

- [ ] **M2.2.1** Extend `useSessionStore`: `renameTab`, `duplicateTab`,
  `pinTab`, `reconnect`, `reconnectAll`, `reorder`.
  - **Test:** unit test: each action mutates state correctly; duplicate
    creates an independent tab.

- [ ] **M2.2.2** Ensure each tab owns an independent `transport` and
  `TerminalPane`; closing a tab disposes both.
  - **Test:** unit test: close tab → transport.close called; terminal
    disposed; no leak (weakref check or counter).

### M2.3 — Keyboard shortcuts

- [ ] **M2.3.1** Implement `composables/useKeyboardShortcuts.ts`: new tab
  (Cmd/Ctrl+T), close tab (Cmd/Ctrl+W), switch tab (Cmd/Ctrl+Tab / number
  keys), reconnect (Cmd/Ctrl+R).
  - **Test:** unit test: each shortcut triggers the expected store action.

### M2.4 — Multi-tab integration

- [ ] **M2.4.1** Open ≥5 concurrent tabs to different hosts; verify all
  interactive independently.
  - **Test:** manual checklist; memory per tab < 8 MB (DevTools snapshot).

---

## M3 — SSH key + keyboard-interactive auth (P1)

> **Goal:** support private-key and keyboard-interactive authentication.
> **Exit criteria:** connect with unencrypted key, passphrase-protected key,
> and kbd-interactive; unit + integration tests pass.

### M3.1 — Frontend key parsing

- [ ] **M3.1.1** Add a vetted SSH key parser dep (e.g., `sshpk` or
  `node-forge`); evaluate and pick in a mini-ADR or ADR-0002 addendum.
  - **Test:** parser loads OpenSSH and PEM formats; rejects invalid keys.

- [ ] **M3.1.2** Implement `components/connect/AuthPrompt.vue`: modal for
  key upload (file picker + textarea), passphrase input, kbd-interactive
  challenge rendering.
  - **Test:** unit test: file upload reads key; passphrase masked;
    kbd-interactive renders N prompts.

### M3.2 — Backend auth methods

- [ ] **M3.2.1** Extend `internal/ssh/client.go`: build `ssh.PublicKeysAuth`
  from parsed key + passphrase.
  - **Test:** unit test: valid key + correct passphrase → auth method;
    wrong passphrase → dial fails (mock server).

- [ ] **M3.2.2** Extend `internal/ssh/client.go`: build
  `ssh.KeyboardInteractive` auth method; relay challenges via STATUS +
  AUTH iteration.
  - **Test:** integration test with mock kbd-interactive server: challenge
    → response → success.

### M3.3 — Protocol & secret handling

- [ ] **M3.3.1** Extend `packages/shared` AUTH payload for `publickey` and
  `kbdInteractive`; regenerate Go types.
  - **Test:** codegen fresh; round-trip tests pass for new payload shapes.

- [ ] **M3.3.2** Ensure decrypted keys live in memory only for the AUTH
  send; zeroize after.
  - **Test:** unit test: plaintext key buffer zeroed after transport.send.

---

## M4 — Host-key TOFU + encrypted known-hosts (P1)

> **Goal:** close the MVP host-key gap; TOFU with client-side encrypted
> pinning.
> **Exit criteria:** first-use prompts; pinning works; mismatch aborts with
> warning; no silent trust.

### M4.1 — Frontend known-hosts store

- [ ] **M4.1.1** Implement `useKnownHostsStore`: IndexedDB `knownHosts`
  store; encrypted read/write (depends on M6 crypto — if M6 not done, use
  interim in-memory key with a documented TODO).
  - **Test:** unit test: pin → lookup → match; tampered record fails.

- [ ] **M4.1.2** Implement first-use fingerprint prompt UI: show algorithm
  + SHA-256 fingerprint; accept/reject buttons.
  - **Test:** unit test: accept pins; reject aborts connection.

- [ ] **M4.1.3** Implement mismatch warning UI: show old vs new fingerprint;
  require explicit friction (type hostname to confirm) to re-pin.
  - **Test:** unit test: mismatch shows warning; re-pin requires confirmation.

### M4.2 — Backend host-key callback

- [ ] **M4.2.1** Finalize `internal/ssh/hostkey.go`: honor `mode: 'pinned'`
  with SHA-256 compare; mismatch → `ERROR{HOST_KEY_MISMATCH}`; never persist.
  - **Test:** integration test: pinned match → CONNECTED; mismatch → ERROR
    + connection closed.

### M4.3 — Integration

- [ ] **M4.3.1** End-to-end: first connect → prompt → accept → pin; second
  connect → silent verify; simulate changed key → warning + abort.
  - **Test:** automated E2E test against a mock SSH server with two keys.

---

## M5 — Connection profiles (IndexedDB) (P1)

> **Goal:** save and reload host profiles (no secrets).
> **Exit criteria:** save profile from session; reload + connect; import/export
> round-trips; schema matches spec.

### M5.1 — Storage service

- [ ] **M5.1.1** Implement `services/storage.ts`: IndexedDB wrapper (use
  `idb` library); `profiles`, `settings`, `meta` stores; CRUD + indexes.
  - **Test:** unit test: CRUD on each store; index lookups; migration
    handler runs on version bump.

### M5.2 — Profile store & UI

- [ ] **M5.2.1** Implement `useProfileStore`: load on startup (TanStack
  Query); mutations write through to IndexedDB.
  - **Test:** unit test: save → list includes; delete → list excludes;
    invalidation refetches.

- [ ] **M5.2.2** Implement `components/profiles/ProfileList.vue`,
  `ProfileCard.vue`, `ProfileEditor.vue` in the sidebar.
  - **Test:** unit test: list renders; edit saves; card click opens connect.

- [ ] **M5.2.3** Implement `views/ProfilesView.vue` for full management;
  folders, tags, notes, colors.
  - **Test:** manual — create, edit, delete, folder-assign profiles.

### M5.3 — Import/export

- [ ] **M5.3.1** Implement profile import/export (JSON; no secrets ever
  included).
  - **Test:** unit test: export → import round-trips; exported JSON contains
    no `password`/`passphrase`/`key` fields.

---

## M6 — Local key encryption (Argon2id + AES-GCM) (P1)

> **Goal:** optionally persist encrypted private keys, unlocked by master
> password.
> **Exit criteria:** encrypt/store/decrypt/connect from UI; auto-lock fires;
> rekey works; tamper detected; Argon2id < 2s.

### M6.1 — Crypto primitives

- [ ] **M6.1.1** Implement `crypto/kdf.ts`: `deriveMasterKey(password,
  kdfMeta)` using `hash-wasm` Argon2id; PBKDF2 fallback via SubtleCrypto.
  - **Test:** unit test: deterministic output for fixed input; fallback
    path works when WASM mocked to fail.

- [ ] **M6.1.2** Implement `crypto/cipher.ts`: `encrypt`/`decrypt` using
  AES-256-GCM via SubtleCrypto; random 96-bit nonce per call.
  - **Test:** unit test: round-trip; tamper ciphertext → throws; tamper
    nonce → throws; wrong key → throws.

- [ ] **M6.1.3** Implement `crypto/keys.ts`: `deriveSubkey(master, info)`
  via HKDF-SHA-256.
  - **Test:** unit test: distinct `info` labels produce distinct keys.

- [ ] **M6.1.4** Implement `crypto/zeroize.ts`: `zeroize(buf)` fills with
  zeros.
  - **Test:** unit test: buffer all zeros after call.

### M6.2 — Auth store & UI

- [ ] **M6.2.1** Implement `useAuthStore`: `unlock`, `lock`, `rekey`;
  hold non-extractable CryptoKey; auto-lock on idle (default 15 min).
  - **Test:** unit test: unlock derives key; lock clears key; rekey
    re-encrypts; auto-lock fires after timeout.

- [ ] **M6.2.2** Implement master-password setup flow (first run) and
  unlock prompt (subsequent runs).
  - **Test:** manual — set master password, lock, unlock, rekey.

### M6.3 — Encrypted key storage

- [ ] **M6.3.1** Implement `encryptedKeys` IndexedDB store with
  `CryptoMetadata` envelopes; encrypt on save, decrypt on load.
  - **Test:** unit test: save encrypted key → read → decrypt → matches
    original; tampered ciphertext fails.

- [ ] **M6.3.2** Wire `ProfileEditor` to optionally attach an encrypted key
  to a profile (opt-in only, FR-62).
  - **Test:** manual — attach key to profile; connect using stored key
    after unlock.

### M6.4 — Worker offload

- [ ] **M6.4.1** Implement `workers/crypto.worker.ts`: offload Argon2id +
  decrypt to a Web Worker; `useAuthStore` communicates via `postMessage`.
  - **Test:** unit test: unlock via worker produces same key as sync path;
    UI does not block during derivation.

### M6.5 — Crypto tests

- [ ] **M6.5.1** Full crypto test suite per [`08-crypto-spec.md`](./docs/08-crypto-spec.md)
  §10 (KDF, cipher, subkeys, zeroize, rekey, fallback, perf sanity).
  - **Test:** all tests pass in CI.

---

## M7 — Hardening: CSP, Trusted Types, PWA, headers (P1)

> **Goal:** production-grade browser security and offline shell.
> **Exit criteria:** CSP enforced (no violations); Trusted Types active; PWA
  loads offline; all headers present.

### M7.1 — CSP & Trusted Types

- [ ] **M7.1.1** Move Tailwind to hashed/nonce-based styles; remove
  `style-src 'unsafe-inline'` from CSP.
  - **Test:** CSP enforced; no violations in browser console during normal use.

- [ ] **M7.1.2** Enforce Trusted Types; add a policy named `buddy-ssh`
  for allowed DOM sinks.
  - **Test:** `require-trusted-types-for 'script'` in CSP; no violations;
    app still functions.

### M7.2 — Headers & PWA

- [ ] **M7.2.1** Verify all security headers from
  [`02-threat-model.md`](./docs/02-threat-model.md) §5 are served by the
  backend (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy,
  COOP, COEP, CORP, X-Content-Type-Options).
  - **Test:** automated test asserts all headers present with correct values.

- [ ] **M7.2.2** Add PWA: `vite-plugin-pwa`; service worker caches app
  shell only; manifest.webmanifest; never cache secrets.
  - **Test:** offline load succeeds (shell only); connection attempts fail
    gracefully with "backend unreachable".

### M7.3 — SPA serving

- [ ] **M7.3.1** Backend serves SPA from `embed.FS` in production; correct
  MIME types; SPA fallback route (serve index.html for unknown paths).
  - **Test:** `curl /unknown-path` returns index.html with 200; assets have
    correct Content-Type.

---

## M8 — Test suite: integration, E2E, a11y, perf (P1)

> **Goal:** meet testing NFRs (NFR-M2, NFR-A1, NFR-P1..P6).
> **Exit criteria:** all suites green; coverage ≥70% on key packages; perf
  budgets enforced.

### M8.1 — Integration tests

- [ ] **M8.1.1** WS → mock SSH server: full session lifecycle
  (connect, auth, data, resize, disconnect, reconnect).
  - **Test:** automated; passes in CI.

- [ ] **M8.1.2** Reconnect test: kill backend, restart, assert frontend
  offers reconnection per tab.
  - **Test:** automated; passes in CI.

### M8.2 — E2E tests (Playwright)

- [ ] **M8.2.1** E2E: quick connect, interactive shell, resize, disconnect.
  - **Test:** automated; passes in CI.

- [ ] **M8.2.2** E2E: multi-tab open/close/switch; profiles save/connect;
  host-key prompt accept.
  - **Test:** automated; passes in CI.

### M8.3 — Accessibility

- [ ] **M8.3.1** Add axe-core to E2E; assert no violations on all views.
  - **Test:** automated; passes in CI.

- [ ] **M8.3.2** Keyboard-only flow tests: navigate UI, open tab, connect,
  switch tabs, close — all without mouse.
  - **Test:** automated; passes in CI.

### M8.4 — Performance

- [ ] **M8.4.1** Keystroke-to-echo latency test (< 50ms p95, NFR-P2).
  - **Test:** automated benchmark; CI enforces budget.

- [ ] **M8.4.2** Resize latency test (< 100ms p95, NFR-P3).
  - **Test:** automated benchmark; CI enforces budget.

- [ ] **M8.4.3** WebSocket throughput test (≥ 5 MB/s, NFR-P4).
  - **Test:** automated benchmark; CI enforces budget.

- [ ] **M8.4.4** Bundle size check (gzipped initial < 350 kB, NFR-P5).
  - **Test:** CI step fails if budget exceeded.

### M8.5 — Coverage

- [ ] **M8.5.1** Coverage gate: ≥70% for `crypto/`, `services/`,
  `internal/ssh/`, `internal/websocket/`.
  - **Test:** CI step fails if below threshold.

---

## M9 — Docker polish + release workflow (Release)

> **Goal:** ship a self-hostable release.
> **Exit criteria:** `docker compose up` works; release workflow publishes
  signed image; deployment guide reviewed.

### M9.1 — Docker

- [ ] **M9.1.1** Finalize multi-stage Dockerfile: distroless, non-root,
  multi-arch (linux/amd64 + linux/arm64) via `docker buildx`.
  - **Test:** `docker buildx build --platform linux/amd64,linux/arm64` succeeds.

- [ ] **M9.1.2** Finalize `docker-compose.yml`: TLS guidance, healthcheck,
  resource limits, env for `BUDDY_SSH_TOKEN` + `BUDDY_SSH_ALLOWED_ORIGINS`.
  - **Test:** `docker compose up` → working secure app at
    `https://localhost:8443`.

### M9.2 — Release workflow

- [ ] **M9.2.1** GitHub Actions release workflow: on tag → build → sign
  (cosign) → publish image to GHCR + release artifacts.
  - **Test:** tag a release; workflow publishes signed image; `cosign
    verify` succeeds.

### M9.3 — Documentation

- [ ] **M9.3.1** Write `docs/deployment.md`: token generation, reverse
  proxy (Caddy/Nginx), TLS, LB config, resource limits.
  - **Test:** operator review; follow guide end-to-end on a fresh VM.

- [ ] **M9.3.2** Write `docs/contributing.md`: dev setup, codegen, testing,
  ADR process, PR checklist.
  - **Test:** new contributor follows guide and makes a trivial PR.

- [ ] **M9.3.3** Polish `README.md` quickstart; verify all doc links.
  - **Test:** `markdown-link-check` passes; quickstart works.

### M9.4 — Final verification

- [ ] **M9.4.1** Full regression: all M0-M8 exit criteria still green.
  - **Test:** CI green end-to-end; manual smoke test passes.

---

## Summary counters

| Milestone | Tasks | Done | Tested |
|-----------|-------|------|--------|
| M0 | 23 | 23 | 23 |
| M1 | 33 | 32 | 32 |
| M2 | 7 | 0 | 0 |
| M3 | 6 | 0 | 0 |
| M4 | 5 | 0 | 0 |
| M5 | 5 | 0 | 0 |
| M6 | 10 | 0 | 0 |
| M7 | 5 | 0 | 0 |
| M8 | 11 | 0 | 0 |
| M9 | 7 | 0 | 0 |
| **Total** | **112** | **55** | **55** |

> Update these counters as tasks complete.
