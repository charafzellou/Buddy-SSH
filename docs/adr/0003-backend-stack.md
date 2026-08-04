# ADR-0003 — Backend stack & WebSocket library

- **ADR number:** 0003
- **Title:** Go 1.26.5 with `coder/websocket` and `golang.org/x/crypto/ssh`
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Backend, Lead Architect
- **Context trigger:** Which WebSocket library and SSH client should the
  stateless backend use?

## Context

The backend is a stateless SSH transport: it terminates a WebSocket, opens an
SSH session, allocates a PTY, and bridges bytes. The SRS (`01-srs.md` §5)
fixes Go 1.26.5. The threat model (`02-threat-model.md` §2.2) requires
origin allowlisting, token validation on upgrade, read limits, and graceful
shutdown. ADR-0005 mandates that each WebSocket owns exactly one SSH session
with no shared server-side state.

## Decision Drivers

- Context-native APIs (clean cancellation, timeouts).
- Active maintenance and security track record.
- Minimal dependencies.
- First-class support for WebSocket subprotocols and origin checks.

## Considered Options

### WebSocket library

#### Option A — `gorilla/websocket`
- **Pros:** Widely used, stable, lots of examples.
- **Cons:** Upgrader API is older; manual context plumbing; the project was
  archived then revived, creating uncertainty; per-conn read loops are more
  boilerplate.
- **Rejected because:** Context handling is clumsier and the maintenance
  situation is noisier than `coder/websocket`.

#### Option B — `coder/websocket` (nhooyr) ✅
- **Pros:** Context-native (`Accept`/`Read`/`Write` take `context.Context`);
  built-in origin check via `AcceptOptions.InsecureOrigin`/origin patterns;
  `SetReadLimit` for DoS mitigation; `Close` honors context; small API
  surface; actively maintained by Coder.
- **Cons:** Smaller community than gorilla; fewer Stack Overflow answers.
- **Accepted.**

#### Option C — `golang.org/x/net/websocket` (deprecated)
- **Pros:** In the Go sub-repo.
- **Cons:** Deprecated, RFC 6455 non-compliant in edge cases.
- **Rejected.**

### SSH client

#### Option A — `golang.org/x/crypto/ssh` ✅
- **Pros:** Go team maintained; supports password, public key,
  keyboard-interactive; host-key callbacks; PTY + window-change; the de facto
  Go SSH client.
- **Cons:** Lower-level than libraries like `pkg/sftp` (which builds on it).
- **Accepted.**

#### Option B — `melbahja/goph` or similar wrappers
- **Pros:** Nicer API.
- **Cons:** Extra abstraction; less control over host-key callbacks and
  auth flow.
- **Rejected.**

### PTY

#### Option A — `creack/pty` ✅
- **Pros:** Standard Go PTY library; supports `Start`/`StartWithSize`;
  cross-platform (Linux/macOS).
- **Cons:** No Windows target support (acceptable; see SRS §7.1).
- **Accepted.**

## Decision

Use **Go 1.26.5** with:

- `coder/websocket` for the WebSocket gateway.
- `golang.org/x/crypto/ssh` for the SSH client.
- `creack/pty` for PTY allocation on the target (when the backend itself
  shells out locally — note: for the remote-SSH path, PTY is allocated
  *remotely* via the SSH channel request, so `creack/pty` is only needed if
  the backend ever hosts a local shell; documented for completeness).

## Rationale

`coder/websocket`'s context-native API aligns with Go's idiomatic
cancellation model, which is essential for graceful shutdown (NFR-R1) and
per-connection timeouts (FR-10). Its built-in `SetReadLimit` and origin
checks directly implement threat-model mitigations §2.2 (DoS, CSWSH).
`golang.org/x/crypto/ssh` is the only credible choice for a Go SSH client and
gives us full control over host-key callbacks (FR-85) and auth methods.

## Consequences

- **Positive:** Clean cancellation propagation; small, audited dependency
  set; idiomatic Go.
- **Negative:** Contributors familiar only with `gorilla/websocket` need to
  learn the `coder/websocket` API.
- **Neutral:** The backend module lives at `apps/backend/`; a root `go.work`
  file enables local edits without `replace` directives.

## Compliance

- `apps/backend/go.mod` pins `coder/websocket`, `golang.org/x/crypto`,
  `creack/pty`.
- CI runs `govulncheck ./...` and fails on known vulnerabilities.
- Integration tests assert origin allowlist and read-limit behavior.

## References

- [`05-backend-design.md`](../05-backend-design.md) — package layout & flows.
- [ADR-0005](./0005-stateless-backend.md) — stateless model.
- [ADR-0008](./0008-access-control.md) — token auth on upgrade.
- [`02-threat-model.md`](../02-threat-model.md) §2.2 — backend threats.
