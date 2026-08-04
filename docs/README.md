# Buddy-SSH — Documentation

This folder contains the complete design documentation for Buddy-SSH, an
enterprise-grade WebSSH platform built with Vue 3 and Go.

> **Status:** Design phase (Phases 1-10 of `PROMPT.md`). Implementation
> (Phase 11) follows the roadmap in [`10-roadmap.md`](./10-roadmap.md).

## Reading order

The documents are organized to be read sequentially. Each builds on the
previous one.

| # | Document | Purpose |
|---|----------|---------|
| 1 | [Software Requirements Specification](./01-srs.md) | What the system must do and how well. |
| 2 | [Threat Model (STRIDE)](./02-threat-model.md) | What can go wrong and how we mitigate it. |
| 3 | [Architecture Decision Records](./adr/) | Why every major technical choice was made. |
| 4 | [Frontend Design](./04-frontend-design.md) | Vue 3 module map, components, state, terminal. |
| 5 | [Backend Design](./05-backend-design.md) | Go package layout, SSH, WebSocket gateway, PTY. |
| 6 | [WebSocket Protocol Specification](./06-websocket-protocol.md) | Versioned wire protocol and state machine. |
| 7 | [Browser Storage Specification](./07-storage-spec.md) | IndexedDB schema and storage comparison. |
| 8 | [Cryptography Specification](./08-crypto-spec.md) | Argon2id + AES-256-GCM key lifecycle. |
| 9 | [Sequence & State Diagrams](./09-diagrams.md) | Mermaid diagrams for every lifecycle. |
| 10 | [Implementation Roadmap](./10-roadmap.md) | Milestones M0-M9 with acceptance criteria. |

## Architecture Decision Records

ADRs capture irreversible or hard-to-reverse technical decisions. Each one
records context, options considered, the decision, and consequences.

| ADR | Title |
|-----|-------|
| [0001](./adr/0001-monorepo-structure.md) | Monorepo structure & shared types |
| [0002](./adr/0002-frontend-stack.md) | Frontend stack selection |
| [0003](./adr/0003-backend-stack.md) | Backend stack & WebSocket library |
| [0004](./adr/0004-websocket-encoding.md) | WebSocket message encoding |
| [0005](./adr/0005-stateless-backend.md) | Stateless backend & horizontal scaling |
| [0006](./adr/0006-frontend-state-management.md) | Frontend state management |
| [0007](./adr/0007-tooling.md) | Monorepo tooling (bun + Go workspaces) |
| [0008](./adr/0008-access-control.md) | Backend access control (shared static token) |
| [0009](./adr/0009-deployment.md) | Dual dev + Docker deployment |

Use [`0000-template.md`](./adr/0000-template.md) to start a new ADR.

## Conventions

- All diagrams use [Mermaid](https://mermaid.js.org/) and render in GitHub.
- All code blocks are typed (TypeScript or Go).
- Cross-references use relative Markdown links.
- Security-sensitive content is flagged with a 🔒 marker.
- MVP scope (per the locked decision) is **single SSH session with password
  auth + multi-tab sessions**. All other features are designed but deferred —
  see [`10-roadmap.md`](./10-roadmap.md).

## Glossary

| Term | Meaning |
|------|---------|
| TOFU | Trust On First Use — host-key pinning model used by OpenSSH. |
| PTY | Pseudo-terminal allocated on the remote host for an interactive shell. |
| WSS | WebSocket Secure (WebSocket over TLS). |
| KDF | Key Derivation Function — converts a password into a symmetric key. |
| AEGIS | Authenticated Encryption with Associated Data (here: AES-256-GCM). |
| MVP | Minimum Viable Product — see roadmap M0-M2. |
