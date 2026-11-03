# Agentic Monetization Strategy

## Status

Strategic note / candidate architecture. This is not a commitment to adopt any one payment rail yet.

## Source trigger

Cloudflare announced the Monetization Gateway on 2026-07-01: a planned edge-layer product for charging for web pages, datasets, APIs, and MCP tools through x402 / HTTP 402 Payment Required.

References:

- Cloudflare Blog: https://blog.cloudflare.com/monetization-gateway/
- x402 Foundation: https://x402.org/
- x402 repository: https://github.com/coinbase/x402

## Thesis

Causari should treat agentic monetization as a future adapter layer, not as the product core.

The core product remains:

```text
curated causal events
+ causal links
+ evidence / provenance
+ confidence scores
+ pack-level insights
+ MCP/API consumption surfaces
```

A payment rail is valuable only after Causari owns resources that agents repeatedly want to call. The right order is therefore:

```text
valuable resource → stable schema → API/MCP surface → policy/pricing adapter
```

not:

```text
payment protocol → product shape
```

## Expert review round

### Founder lens

The strategic signal is strong: the web is moving from human attention monetization toward machine-readable resource monetization. Causari is well positioned if it becomes a trusted source of structured causal intelligence rather than another recap/news UI.

Founder implication: the moat should be the quality of causal modeling, evidence trails, and pack curation discipline. Cloudflare/x402 can become distribution and payment infrastructure, but it should not define Causari's identity.

### Product owner lens

Users and agents will not pay for raw JSON alone. They will pay for compressed judgment:

- what happened
- why it mattered
- what it changed
- what to watch next
- how confident the system is
- which evidence supports the conclusion

This matches the existing event-pack framing in `docs/PACKS.md`. The next product milestone is to make every live pack expose a small number of high-value resource types.

Recommended resource types:

```text
GET /packs/{packId}/recap/latest
GET /packs/{packId}/events
GET /packs/{packId}/links
GET /packs/{packId}/insights
GET /packs/{packId}/watchpoints
GET /events/{eventId}/causal-chain
POST /analyze/article
POST /verify/claim
```

### Solution architect lens

Do not bake x402 into the data package. Keep causari-data as the canonical source of truth and expose monetization at the serving layer.

Proposed layers:

```text
causari-data repository
  ↓
pack build / validation
  ↓
resource server / MCP server
  ↓
policy engine
  ↓
monetization adapter
  ↓
Cloudflare Monetization Gateway / x402 / API key / enterprise contract
```

The policy engine should be rail-neutral:

```yaml
resources:
  - id: pack-latest-recap
    route: GET /packs/{packId}/recap/latest
    access:
      free_quota: 10/day
      require_auth: optional
    pricing:
      unit: request
      amount_usd: 0.01
    adapters:
      - free
      - api_key
      - x402
      - enterprise
```

### Security and trust lens

x402-style payments are promising, but they introduce new risks:

- replay or under-bound payment proofs
- paid-but-denied outcomes
- unpaid-service outcomes
- accidental leakage of request metadata to facilitators
- unclear compliance posture across jurisdictions
- agent overspending without a user-visible budget

Causari should not ask an agent to pay unless the paid resource has:

- deterministic resource identity
- explicit price quote
- bounded response shape
- evidence/provenance fields where relevant
- idempotency key for repeat calls
- clear refund/error semantics
- audit log entry

### Market lens

Cloudflare's move increases the chance that many small data/API/MCP providers can charge without building full billing systems. That is good for Causari, but it also lowers distribution barriers for competitors.

The defensible wedge is not charging. The defensible wedge is that Causari's resource answers are more trustworthy, structured, agent-friendly, and causally useful than generic search or generic summarization.

### User lens

Human users still need a frontend. Agents need stable resources. The same pack should support both:

```text
human view: recap, timeline, graph, narrative
agent view: compact JSON, causal chain, confidence, evidence, watchpoints
```

The frontend is not just marketing; it is the review surface that makes paid machine-readable resources legible and trustworthy.

## Recommended decision

Adopt a rail-neutral monetization architecture.

Causari should prepare for Cloudflare Monetization Gateway / x402 by defining resource contracts and pricing metadata, but avoid a hard dependency until the gateway is generally available and real agent buyers exist.

## Near-term implementation plan

### Phase 1 — Resource contracts

Define stable resource contracts for pack consumption:

```text
resource id
route or MCP tool name
input schema
output schema
cache policy
freshness expectation
evidence/provenance requirement
pricing metadata placeholder
```

Suggested first file:

```text
docs/RESOURCE-CONTRACTS.md
```

### Phase 2 — Pack metadata

Extend pack README guidance with optional monetization metadata:

```yaml
monetization:
  status: experimental
  recommended_unit: request
  free_surface: recap summary
  paid_surfaces:
    - causal-chain
    - verification-report
    - watchpoint-forecast
```

This should remain metadata only. The JSON data files should not require payment-specific fields.

### Phase 3 — Serving adapter

Implement in the resource server or MCP server, not in this data repo:

```text
free adapter
api-key adapter
x402/cloudflare adapter
enterprise-contract adapter
```

### Phase 4 — First paid experiments

Best candidates:

1. `verify/article` — validate a third-party article, extract claims, score evidence, produce a report.
2. `events/{id}/causal-chain` — return a compact causal chain with evidence and confidence.
3. `packs/{packId}/watchpoints` — return next events/questions to monitor.
4. `packs/ai-models/recap/latest` — daily structured AI model ecosystem recap.

## Design constraints

- Data remains portable and license-clear.
- Paid access must be enforced outside the canonical dataset.
- Every paid answer should include enough provenance to justify payment.
- Pricing must be configurable per resource, not hardcoded per pack.
- x402 is an adapter, not the domain model.
- Agents need spending budgets and retry-safe semantics.
- Human review surfaces remain first-class.

## Open questions

1. Should pack metadata live in each pack README, a `pack.yml`, or a registry file?
2. Should monetized resources be exposed first through MCP, REST, or both?
3. What is the minimum paid resource that feels worth paying for: recap, causal chain, verification report, or watchpoint forecast?
4. Should Causari support stablecoin-only payments, or wait for fiat/card facilitators to mature?
5. How should CC-BY-SA data licensing interact with paid API access and derivative reports?

## Non-goals for now

- Do not implement wallet handling in this repo.
- Do not require x402 fields in `events.json`, `links.json`, or `insights.json`.
- Do not replace human-facing recap with agent-only APIs.
- Do not optimize for monetization before resource quality.

## Working conclusion

Cloudflare's Monetization Gateway is a strong validation signal for Causari's data-pack and MCP direction. It suggests that causal intelligence can become a paid machine-readable resource. The immediate action is not to add payments; it is to make Causari resources precise enough that agents would rationally pay for them.
