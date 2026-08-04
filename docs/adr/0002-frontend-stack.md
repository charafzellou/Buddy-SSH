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

## References

- [`04-frontend-design.md`](../04-frontend-design.md) — module map & components.
- [ADR-0006](./0006-frontend-state-management.md) — state management detail.
- [`02-threat-model.md`](../02-threat-model.md) §3 #15 — supply-chain risk.
