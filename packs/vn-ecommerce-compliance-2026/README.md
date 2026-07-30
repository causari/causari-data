# Vietnam E-commerce Compliance 2026

> An evidence-first causal pack connecting legal change to operational control and proof of execution.

This pack is an initial research preview for Vietnamese e-commerce, social commerce, livestream selling, household-business tax operations, electronic invoices, and cybersecurity.

It does **not** try to summarize every law effective from July 1, 2026. It models a narrower, testable wedge:

```text
legal instrument
→ effective rule
→ role-owned action
→ operating control
→ evidence
```

## Why this pack exists

SMEs usually do not fail because they cannot download legal documents. They fail because they cannot quickly determine:

- whether a rule applies to their business model
- which team owns the response
- which product or operating process must change
- what evidence proves the control actually ran
- what changed after the last review

The pack turns those questions into a causal graph that can be used by humans, AI agents, and timeline/canvas interfaces.

## Scope

The initial version focuses on:

- E-Commerce Law No. 122/2025/QH15
- Decree No. 248/2026/NĐ-CP
- Tax Administration Law No. 108/2025/QH15
- Decree No. 252/2026/NĐ-CP
- Decree No. 254/2026/NĐ-CP on electronic invoices and documents
- Cybersecurity Law No. 116/2025/QH15
- derived operating controls for seller governance, livestream identity and product claims, transaction-to-invoice reconciliation, access and incident auditability, and evidence management

Out of scope for this first version:

- a complete inventory of all laws, decrees, and circulars effective in 2026
- organization-specific legal conclusions
- penalty calculations
- automated legal advice
- replacing review by qualified legal, tax, or accounting professionals

## Files

```text
packs/vn-ecommerce-compliance-2026/
├── README.md
├── manifest.json
├── views.json
├── events.json
├── links.json
└── insights.json
```

The three canonical graph files remain compatible with the existing Causari pack loader:

- `events.json`
- `links.json`
- `insights.json`

`manifest.json` and `views.json` are optional projection metadata for Canvas, teaching, role-based filtering, and story mode.

## Node model

Every node is still a Causari event, but optional fields describe how a consumer may project it:

| Field | Meaning |
|---|---|
| `nodeType` | `instrument`, `effective-date`, `action`, `control`, or `evidence` |
| `lane` | `law`, `implementation`, `operations`, or `evidence` |
| `normativeStatus` | `binding`, `derived-control`, or `recommended-practice` |
| `lifecycleStatus` | Current operating state for non-legal nodes, such as `active` |
| `audiences` | Roles that should see the node |
| `sources` | Provenance for factual or binding claims |

The distinction between `normativeStatus` values is essential:

- **binding**: directly represents an enacted legal instrument or effective provision
- **derived-control**: an operational interpretation grounded in an official summary
- **recommended-practice**: a Causari implementation recommendation, not a direct quotation of law

## Canvas timeline

The recommended Canvas layout uses four lanes:

```text
Law
  ↓
Implementation
  ↓
Operations
  ↓
Evidence
```

`views.json` provides reusable projections:

- executive impact
- tax and accounting operations
- e-commerce and livestream
- IT and security
- teaching causal chain

A consumer should load the canonical graph once, then apply a view without copying or rewriting the underlying data.

## Relation to teaching packs such as WWI

The same view abstraction can power a historical lesson:

```text
historical trigger
→ institutional response
→ military/political adaptation
→ observable outcome
→ primary-source evidence
```

For compliance, the equivalent is:

```text
legal trigger
→ implementation rule
→ organizational adaptation
→ operating evidence
```

This means `views.json` is not a legal-specific UI configuration. It is a generic narrative projection layer over a causal graph. A WWI pack might define views such as:

- long-term causes
- July Crisis escalation
- alliance propagation
- fronts and turning points
- consequences and counterfactuals

The data remains canonical; lecturers, executives, analysts, and AI agents see different paths through it.

## Intended users

### SME leaders

Understand which changes deserve budget, ownership, and sequencing.

### Tax, legal, and operations teams

Move from document reading to an executable backlog and evidence register.

### Software and platform teams

Translate regulation into identity, workflow, logging, reconciliation, and retention requirements.

### Lecturers and facilitators

Use story mode to explain how a trigger propagates through a system.

### AI agents

Answer questions such as:

- Which binding event led to this control?
- Is this node law, derived guidance, or a recommendation?
- Which roles are affected?
- What evidence should exist?
- Which source supports the claim?

## Quality and safety

- Binding events must use official government or ministry sources.
- Derived controls must never be presented as verbatim legal requirements.
- Every update must preserve an `asOf` date.
- Applicability must be evaluated for each organization.
- High-risk interpretations should be reviewed by qualified professionals.

> This pack is a research and operational-design aid, not legal or tax advice.
