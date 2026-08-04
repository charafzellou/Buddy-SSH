# ADR Template

- **ADR number:** 0000
- **Title:** <short noun phrase>
- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Deciders:** <roles/people involved>
- **Context trigger:** <what question forced this decision>

## Context

Describe the forces at play — functional requirements, constraints, security
concerns, operational concerns, team familiarity, ecosystem state. Reference
the SRS (`01-srs.md`) and threat model (`02-threat-model.md`) where relevant.

## Decision Drivers

- <driver 1>
- <driver 2>

## Considered Options

### Option A — <name>
<description>

- **Pros:** ...
- **Cons:** ...
- **Rejected because:** ...

### Option B — <name>
<description>

- **Pros:** ...
- **Cons:** ...

## Decision

<which option was chosen, in one sentence>

## Rationale

<why this option wins against the others, given the drivers>

## Consequences

- **Positive:** ...
- **Negative:** ...
- **Neutral:** ...

## Compliance

How we verify the decision is honored in code/config (lint rules, tests, CI
checks, code review checklist).

## References

- Links to specs, ADRs, external docs, RFCs.
