# Career Radar intake inbox

This directory is the low-coupling bridge between research agents and the deterministic Career Radar ingestion pipeline.

```text
agent / scheduler
      ↓
pending/<ingest-id>.json
      ↓  GitHub Actions
ingest-career-radar.mjs
      ↓
canonical graph + pack + snapshot
      ↓
processed/<checkedAt>/<ingest-id>.json

invalid payload
      ↓
rejected/<ingest-id>.json
```

## Rules

1. Agents may write only to `pending/`; they must not edit canonical data directly.
2. File content must follow `docs/CAREER-RADAR-INGEST.md`.
3. The filename should be the `ingestId` plus `.json`.
4. Each scheduled research run should submit exactly one intake:
   - substantive update → evidence/event/claim/signal payload;
   - no material change → empty heartbeat payload with `substantive=false`.
5. The GitHub workflow validates and archives payloads automatically.
6. Rejected inputs are quarantined and the workflow fails visibly; canonical data remains protected.

This inbox is an **audit boundary**, not a second data source. Canonical truth remains under `data/` and pack intelligence under `packs/ai-career-radar-2026/`.
