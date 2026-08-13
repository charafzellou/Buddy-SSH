# ADR-0002 — Frontend stack selection

- **ADR number:** 0002
- **Title:** Vue 3.5 + TypeScript 7 + Vite 8 + Pinia 3 + xterm.js + Tailwind
- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Lead Frontend, Lead Architect
- **Context trigger:** `PROMPT.md` fixes the core stack; this ADR justifies
  each choice and the supporting libraries.

## Context

The SRS (`01-srs.md` §5) fixes Vue 3.5.40, TypeScript 7.0, Vite 8.1.5, and
Pinia 3.0.4. The remaining decisions are the terminal emulator, the CSS
approach, the validation library, the async-state library, and the
utility/composables library. Every addition must be justified against the
threat model (supply-chain risk, §3 #15) and the performance NFRs (§4.1).

## Decision Drivers

- First-class TypeScript support.
- Small, auditable dependency footprint.
- Excellent terminal rendering performance.
- Accessibility (WCAG AA, NFR-A1).
- Bundle size budget (< 350 kB gzipped, NFR-P5).

## Considered Options

### Terminal emulator

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **xterm.js** ✅ | De facto standard, mature, WebGL renderer, rich addon ecosystem, accessibility work | Larger bundle (~150 kB) | Accepted — best fit |
| `ttyd` frontend | Battle-tested | Tied to ttyd's protocol; not Vue-friendly | Rejected |
| Custom canvas renderer | Full control, tiny | Huge effort; reinvents ANSI parsing | Rejected |

### State management

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Pinia 3** ✅ | Official Vue store, TS-native, devtools | — | Accepted (fixed by SRS) |
| Vuex 5 | Familiar | Superseded by Pinia | Rejected |

### Async / server-derived state

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **TanStack Query** ✅ | Caching, retries, invalidation; framework-agnostic | Extra dep | Accepted — worth it for profile fetching & reconnect logic |
| Hand-rolled composables | No dep | Reimplements caching | Rejected |

### CSS

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **TailwindCSS** ✅ | Utility-first, tiny prod bundle via PurgeCSS, fast iteration | `unsafe-inline` style CSP concern (see threat model §5) | Accepted; M7 hardens CSP |
| Scoped CSS only | No dep | Slower for design system | Rejected |
| Component library (e.g., PrimeVue) | Fast UI | Large bundle, opinionated | Rejected |

### Validation

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Zod** ✅ | TS-native, runtime + static types, used by shared package | ~10 kB | Accepted |
| `class-validator` | Decorator-based | Less ergonomic with Vue | Rejected |
| Hand-written guards | No dep | Error-prone | Rejected |

### Utilities / composables

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **VueUse** ✅ | Tree-shakable, well-maintained, covers `useEventListener`, `useStorage`, `useDebounceFn` | — | Accepted |
| lodash-es | Broad | Larger; less Vue-idiomatic | Rejected |

### Routing

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Vue Router** ✅ | Official, TS support, lazy routes | — | Accepted |

## Decision

Adopt the stack as listed with ✅ above. The full dependency list is captured
in `apps/frontend/package.json` (to be created in M0). Every dependency must
appear in this ADR or a successor; ad-hoc additions are not permitted.

## Rationale

Each chosen library is either the official Vue recommendation (Pinia, Vue
Router), the de facto standard for its niche (xterm.js, TanStack Query, Zod),
or a minimal utility (VueUse, Tailwind). The combination keeps the gzipped
bundle under the 350 kB budget while satisfying the terminal, accessibility,
and security requirements. Rejected options either duplicate functionality or
introduce disproportionate supply-chain risk.

## Consequences

- **Positive:** Cohesive, TS-first, well-documented stack; fast HMR via Vite;
  strong terminal UX via xterm.js addons.
- **Negative:** Tailwind's runtime style injection forces a temporary
  `style-src 'unsafe-inline'` in CSP (threat model §5); M7 removes it.
- **Neutral:** xterm.js addons must be pinned and audited like any dep.

## Compliance

- `apps/frontend/package.json` must match this ADR's accepted list.
- CI runs `bun audit --severity high` and fails on high-severity findings.
- Bundle size check in CI asserts gzipped initial bundle < 350 kB (NFR-P5).

## Addendum (2026-08-13) — SSH private-key parser (M3.1.1)

M3 needs client-side validation of an uploaded SSH private key before it's
sent to the backend: rejecting garbage input immediately, and detecting
whether the key is passphrase-encrypted so `AuthPrompt.vue` knows whether to
show a passphrase field. This is a UX convenience only — the backend
re-parses and authenticates with the key authoritatively via
`golang.org/x/crypto/ssh`, so this parser is not a security boundary.

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `sshpk` | Parses OpenSSH's native `openssh-key-v1` format (the default `ssh-keygen` output, and the *only* format ed25519 keys can be stored in) with bcrypt-KDF passphrase decryption, plus PEM/PKCS1/PKCS8 | **Tried first and reverted.** `bun run build` succeeds (Rollup silently "externalizes" the Node built-ins it needs — `crypto`, `util`, `assert`, `stream`, `buffer` — into empty browser stubs instead of failing), which looked clean but is misleading: loading it in a real browser throws `ReferenceError: process is not defined` at module-eval time, in a component imported eagerly enough to crash Vue Router's initial navigation and blank the entire app. Patching this with `vite-plugin-node-polyfills` pulled in 226 additional packages — far outside "small, auditable dependency footprint" (this ADR's own decision driver) — with no guarantee it wouldn't just move the failure into an actual `crypto.randomBytes()`/`Buffer` call deeper in ECDSA code paths. **Lesson: a clean `vite build` does not prove browser runtime compatibility for a Node-oriented package — externalized-module warnings in the build log must be verified by actually loading the page, not just building it.** | Rejected |
| **node-forge** ✅ | Explicitly browser-targeted, no Node-builtin externalization warnings, verified working live (real browser, no console errors) parsing both an unencrypted ed25519 OpenSSH key and PEM RSA keys (encrypted + unencrypted) | No support for OpenSSH's `openssh-key-v1` container format — only traditional PEM/PKCS1/PKCS8, and can't verify a passphrase against that format | Accepted for PEM/PKCS1/PKCS8, combined with... |
| Hand-rolled `openssh-key-v1` structural reader (no library) | The public-key section of that format is always cleartext even when the private section is encrypted (RFC-defined layout: magic → cipherName → kdfName → kdfOptions → pubkey blob → encrypted-or-not private blob), so type + "is this encrypted" are readable via plain `Uint8Array` parsing and the browser's native `atob()` — no crypto operations, no dependency, no polyfill risk | Can't verify a given passphrase is correct for this format (no decrypt attempted) — `AuthPrompt.vue` accepts any non-empty passphrase once a key is flagged `encrypted` and defers correctness to the backend's authoritative `AUTH_FAILED` response | Accepted for `openssh-key-v1`, combined with node-forge above |

### Decision

Adopt `node-forge` (plus `@types/node-forge`) for PEM/PKCS1/PKCS8 keys, and
a small hand-rolled binary reader (no dependency) for OpenSSH-format keys,
in `apps/frontend/src/utils/sshKeyParser.ts`. Verified live in a real
browser (not just `bun run build` / `vitest`, which runs under Node and
would not have caught sshpk's failure either) — no console errors, no
externalized-module warnings, both key formats parse correctly.

## References

- [`04-frontend-design.md`](../04-frontend-design.md) — module map & components.
- [ADR-0006](./0006-frontend-state-management.md) — state management detail.
- [`02-threat-model.md`](../02-threat-model.md) §3 #15 — supply-chain risk.
