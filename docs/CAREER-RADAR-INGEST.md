# AI Career Radar ingestion

Career Radar uses an **evidence-first, idempotent** ingestion contract.

```text
daily research
    ↓
intake payload
    ↓
ingest-career-radar.mjs
    ├─ canonical event upsert
    ├─ event refs
    ├─ claims / evidence / sources
    ├─ signals
    ├─ explicit global promotion
    ├─ daily snapshot
    └─ audit log
    ↓
validation
    ↓
commit
```

## Important semantics

- A **real event** can become canonical even when it is not shown on the default global timeline.
- A **signal** is derived intelligence and is never silently promoted as an event.
- `promotion.includeInGlobal` must be explicit. No pack automatically floods `/app`.
- A day with no meaningful change should use `quality.substantive=false` with empty data arrays. That records a trend heartbeat without generating noise.
- Reusing the same `ingestId` with the same payload is a no-op. Reusing it with different content is rejected.

## Intake contract

```json
{
  "ingestId": "2026-11-03-example-check",
  "checkedAt": "2026-11-03",
  "summary": "Short research summary.",
  "quality": {
    "substantive": true,
    "sourceReviewComplete": true,
    "observedVsForecastSeparated": true,
    "correlationCausalityReviewed": true
  },
  "sources": [],
  "events": [],
  "claims": [],
  "evidence": [],
  "signals": []
}
```

### No-update heartbeat

```json
{
  "ingestId": "2026-11-03-no-material-change",
  "checkedAt": "2026-11-03",
  "summary": "No material change after primary-source review.",
  "quality": {
    "substantive": false,
    "sourceReviewComplete": true,
    "observedVsForecastSeparated": true,
    "correlationCausalityReviewed": true
  },
  "sources": [],
  "events": [],
  "claims": [],
  "evidence": [],
  "signals": []
}
```

This still creates/refreshes the daily snapshot, but does not create an event, claim, evidence record, source, or signal.

## Event promotion

An incoming event may include an ingestion-only `promotion` block:

```json
{
  "id": "example-official-report-2026",
  "title": "Example official report",
  "description": "What happened.",
  "date": "2026-11-03",
  "dateLabel": "3 Nov 2026",
  "yearNum": 2026,
  "yearLabel": "3 Nov 2026",
  "precision": "day",
  "domains": ["technology", "economy"],
  "impactScore": 0.8,
  "tags": ["ai", "jobs"],
  "sourceIds": ["source-example"],
  "promotion": {
    "globalVisibility": "contextual",
    "includeInGlobal": false,
    "reason": "Keep canonical for cross-pack reuse; not important enough for default global Canvas.",
    "presentation": {
      "lod": 1,
      "tag": "AI-Career"
    }
  }
}
```

`promotion` and `sourceIds` are ingestion instructions; they are normalized into canonical provenance and are not copied verbatim into the canonical event.

## Running locally

```bash
node scripts/ingest-career-radar.mjs /tmp/intake.json --dry-run
node scripts/ingest-career-radar.mjs /tmp/intake.json
node scripts/validate-pack.mjs ai-career-radar-2026
node scripts/validate-global-projection.mjs
```

## Agent / scheduler entry point

The preferred bridge is the repository inbox:

```text
inbox/career-radar/pending/<ingestId>.json
```

A scheduled research agent creates exactly one pending JSON file per run. The **career-radar-ingest** workflow is triggered by that commit, applies the deterministic ingestion pipeline, validates the result, then moves the raw payload to:

- `processed/<checkedAt>/` when accepted;
- `rejected/` when invalid.

The workflow fails visibly on rejected payloads, while canonical data remains protected.

`workflow_dispatch` with `payload_json` remains available for manual/debug ingestion.

The research agent should:

1. Review primary/high-quality sources.
2. Decide whether the update is substantive.
3. Keep observed data, forecasts, surveys and interpretation distinct.
4. Review correlation vs causality.
5. Build exactly one intake payload.
6. Write only to `inbox/career-radar/pending/`; never edit canonical files directly.
7. Notify the user only when `substantive=true`; operational ingestion failures are also worth surfacing.

This separates **research judgement** from **deterministic data mutation**, while keeping every raw research decision auditable.
