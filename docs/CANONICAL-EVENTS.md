# Canonical events and projections

Status: active contract (v1)

## Principle

Causari stores **events once** and projects them many ways.

```text
canonical event graph
├─ /app global projection
├─ packs / radars
├─ MCP / API
└─ future personal projections
```

The global timeline is **not** the union of every pack.

## Semantic layers

- **Event** — something that happened (or a clearly marked forecast) in the world.
- **Claim / evidence** — epistemic support about an event. These may remain pack-local when domain-specific.
- **Signal** — a derived interpretation over one or more events; never promoted as a factual event merely for visualization.
- **Pack** — a curated context over canonical event references plus optional pack-local events.
- **Lens / view** — a presentation or audience-specific projection.

## Event ownership

Canonical events live in `data/events.json` and have globally unique IDs.

A pack that reuses canonical events should declare:

```json
{
  "files": {
    "eventRefs": "event-refs.json"
  },
  "eventSource": {
    "mode": "canonical-refs",
    "canonicalEvents": "data/events.json",
    "refs": "event-refs.json"
  }
}
```

`event-refs.json` is an array of canonical event IDs.

During migration, a pack may retain `events.json` as a **deprecated compatibility mirror** for older consumers. New consumers must resolve canonical refs first and treat the mirror as fallback only.

## Promotion

Pack-local observations do not automatically become global events.

Suggested visibility states:

- `pack-only` — useful only inside a focused pack.
- `contextual` — canonical and queryable; appears on global views only at suitable LOD/filter.
- `major` — globally significant; eligible for zoomed-out global views.

`data/views/global-canvas.json` explicitly chooses which canonical events appear in the default Causari Canvas and assigns presentation hints such as LOD. This prevents a large live pack from flooding the global timeline.

## Consumer rule

Renderers should consume a composed graph endpoint and must not embed authoritative knowledge in UI code. A renderer may keep a legacy snapshot only as a temporary availability fallback during migration.

## Daily ingestion

```text
research
→ normalize
→ event? / claim? / signal?
→ canonical event when appropriate
→ pack references
→ global promotion decision
→ projections
```

Ingest once; project many times.
