# ADR-0004 — WebSocket message encoding

- **ADR number:** 0004
- **Title:** MessagePack as the primary wire encoding, JSON for debug
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Architect, Lead Frontend, Lead Backend
- **Context trigger:** How are WebSocket messages encoded on the wire?

## Context

The protocol (`06-websocket-protocol.md`) carries typed messages: INIT, AUTH,
DATA, RESIZE, etc. Terminal DATA frames are high-frequency and may carry
binary bytes; control frames are low-frequency and structured. The encoding
must be (a) compact for throughput (NFR-P4 ≥ 5 MB/s), (b) schema-validatable
on both sides (threat model §2.3 type confusion), and (c) debuggable.

ADR-0001 establishes `packages/shared` TS types as the source of truth with Go
codegen. The encoding must round-trip through that pipeline.

## Decision Drivers

- Wire size (affects throughput and mobile data).
- Binary-safe (terminal bytes 0x00-0xFF must pass through unchanged).
- Schema validation on both sides.
- Debuggability during development.

## Considered Options

### Option A — Custom binary framing
Hand-rolled length-prefixed binary frames with a type byte.

- **Pros:** Smallest possible; full control.
- **Cons:** Must invent and maintain a format, schema, and validators on both
  sides; high implementation and review cost; no tooling.
- **Rejected because:** The effort and bug surface are disproportionate;
  MessagePack already gives compact binary framing.

### Option B — Compact JSON
UTF-8 JSON with short keys.

- **Pros:** Ubiquitous, human-readable, trivial to debug.
- **Cons:** Not binary-safe (terminal bytes must be base64-encoded, +33 %
  overhead); larger on the wire; slower parse for high-frequency DATA frames.
- **Rejected as primary**; **accepted as a debug fallback**.

### Option C — MessagePack ✅
`@msgpack/msgpack` on the frontend, `github.com/vmihailenco/msgpack/v5` on
the backend.

- **Pros:** Binary-safe (terminal bytes pass through); compact (no key
  overhead beyond short field names); schema-validatable via Zod (frontend)
  and generated Go structs (backend); fast encoders/decoders on both sides.
- **Cons:** Not human-readable on the wire (mitigated by JSON debug mode).
- **Accepted as primary.**

## Decision

Use **MessagePack** as the primary encoding for all WebSocket messages. The
backend additionally accepts JSON when the `Sec-WebSocket-Protocol` client
subprotocol is `buddy-ssh.json` (debug only); production uses
`buddy-ssh.msgpack`. The envelope and all message payloads are defined as Zod
schemas in `packages/shared` and generated as Go structs in
`apps/backend/internal/protocol` (ADR-0001).

## Rationale

MessagePack is binary-safe, which is essential for terminal DATA frames
containing arbitrary byte values (NFR-P4 throughput, FR-20 UTF-8/ANSI). It
remains schema-validatable through the shared-types pipeline, satisfying the
type-confusion mitigation. JSON is retained as a debug fallback so developers
can inspect traffic with browser devtools without a MessagePack decoder. This
combination gives the best tradeoff across size, safety, and debuggability.

## Consequences

- **Positive:** Compact, binary-safe wire format; single schema source;
  debug mode available.
- **Negative:** Devtools cannot read MessagePack directly; a small in-app
  inspector or the JSON debug mode is required for troubleshooting.
- **Neutral:** The `Sec-WebSocket-Protocol` negotiation selects the encoding
  per connection.

## Compliance

- `packages/shared` exports Zod schemas + a JSON Schema file for codegen.
- `apps/backend/internal/protocol` contains generated Go structs; CI verifies
  they are fresh (ADR-0001).
- Integration tests round-trip every message type in both encodings.
- Production deployment must not advertise `buddy-ssh.json` (CI/lint check on
  frontend config).

## References

- [ADR-0001](./0001-monorepo-structure.md) — shared types & codegen.
- [`06-websocket-protocol.md`](../06-websocket-protocol.md) — full protocol.
- [`02-threat-model.md`](../02-threat-model.md) §2.3 — protocol threats.
