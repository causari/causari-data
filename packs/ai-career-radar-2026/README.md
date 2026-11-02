# AI Career Radar 2026

> Big think, start small: lean data, scalable lenses.

This pack is the first Causari vertical for AI × career intelligence.

## V0 goal

Turn AI/job-market news into:

```text
trusted source
→ structured event
→ evidence-backed claim
→ trend signal
→ persona lens
→ career decision
```

The initial wedge is **a developer in Viet Nam**. The same canonical data can later be projected through freelancer, CEO/manager, and citizen lenses without duplicating the event history.

## Quality rules

- Prefer official statistics, international organizations, academic research and primary AI-lab research.
- Keep observed data, forecasts, surveys and interpretations separate.
- Never turn exposure into displacement without evidence.
- Never turn a single company announcement into a market trend.
- Preserve source URLs and confidence.
- Daily updates should append or revise evidence; weekly/monthly views should synthesize rather than duplicate.

## V0 files

- `events.json`: significant labor/skill events.
- `claims.json`: atomic observed and inferred statements.
- `evidence.json`: source-backed support.
- `sources.json`: primary source registry.
- `views.json`: developer/freelancer/CEO/citizen projections.
- `links.json`: intentionally empty until defensible event-to-event causal links exist.
- `insights.json`: intentionally empty until patterns have multiple causal instances.
- `forecasts.json`: intentionally empty until resolvable forecasts are defined.

## Current product thesis

**Track the change in the value chain, not just whether an occupation exists.**

For software, the current evidence suggests pressure is stronger on routine implementation than on broader software development, while demand for AI skills and advanced ICT expertise remains strong in several datasets.

## Operating loop

Daily research now feeds an idempotent ingestion contract:

```text
research
→ evidence-first intake
→ canonical event / claim / signal classification
→ explicit global promotion decision
→ daily snapshot
→ Career Radar + Causari global projection
```

Run `scripts/ingest-career-radar.mjs` locally or dispatch the `career-radar-ingest` GitHub workflow. See [../../docs/CAREER-RADAR-INGEST.md](../../docs/CAREER-RADAR-INGEST.md).

Days with no material update still produce a no-change snapshot when the monitor dispatches a heartbeat; they do not create noisy events or signals.

## Next increments

1. Wire the existing AI/job-market scheduled watch to the ingest workflow.
2. Weekly/monthly aggregation over `snapshots.json`.
3. Trend chart generated from snapshot history + normalized signals.
4. Persona-aware alert thresholds and decision history.
5. Resolvable forecast layer only after enough historical observations exist.
