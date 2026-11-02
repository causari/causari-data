# Canonical quality baseline

Causari's original core graph contains valuable historical structure, but much of it was seeded during the prototype phase. This directory makes that debt explicit and prevents it from silently growing.

## Policy

```text
legacy debt
   ↓
explicit baseline
   ↓
CI may stay equal or improve
   ↓
new data must meet the stronger contract
```

The baseline is **not a quality target**. It is a ceiling.

Current gated debt includes:

- canonical causal links whose only provenance is `demo-seed`;
- high-confidence demo-seed causal links;
- links whose source event occurs after the target event;
- the finite set of old forecast scenarios still marked `legacy-demo`.

New forecast nodes must not use `legacy-demo`. They require non-demo provenance, explicit confidence, reasoning, and forecast-quality metadata.

The default global Canvas additionally suppresses known weak causal edges in `data/views/global-canvas.json`. Suppression keeps canonical history auditable while preventing weak legacy claims from being presented as first-class causation.

Run:

```bash
node scripts/audit-canonical-quality.mjs
```

When legacy debt is genuinely removed or upgraded, lower the corresponding ceiling in `canonical-baseline.json`; never raise a ceiling to make CI pass.


## Rejected canonical links

Links that are clearly invalid should not remain in `data/links.json` merely for historical traceability.

Move them to `rejected-links.json` with:

- the original link payload;
- `rejectedAt`;
- `rejectedFrom`;
- `rejectionType`;
- a specific human-readable `reason`.

Git history remains the ultimate audit trail; the rejected archive makes removals visible to tooling and reviewers without polluting the active causal graph.

A rejected link must never simultaneously exist in active canonical links.
