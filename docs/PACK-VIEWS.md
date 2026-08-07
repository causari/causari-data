# Pack Manifests and Canvas Views

Causari packs contain a canonical causal graph and may optionally contain presentation metadata.

The separation is deliberate:

```text
canonical graph data
+ audience/view projection
= timeline, canvas, lesson, recap, or decision workflow
```

## Canonical files

Every pack continues to use:

```text
events.json
links.json
insights.json
```

These files must remain portable across the MCP server, Canvas, static imports, runtime fetches, and future consumers.

## Optional files

A pack may add:

```text
manifest.json
views.json
```

### `manifest.json`

The manifest describes the pack rather than changing graph semantics.

Recommended fields:

```json
{
  "id": "pack-id",
  "version": "0.1.0",
  "title": "Pack title",
  "description": "Purpose and scope",
  "language": "en",
  "defaultLocale": "vi",
  "jurisdiction": "VN",
  "temporalMode": "effective-date-timeline",
  "graphMode": "instrument-to-control-to-evidence",
  "updateCadence": "event-driven",
  "asOf": "2026-07-30",
  "files": {
    "events": "events.json",
    "links": "links.json",
    "insights": "insights.json",
    "views": "views.json"
  },
  "canvas": {
    "defaultView": "executive-impact",
    "recommendedLayout": "timeline-lanes",
    "laneField": "lane",
    "nodeTypeField": "nodeType"
  }
}
```

Consumers must treat unknown manifest fields as optional.

### `views.json`

A view is a projection over the graph. It may define:

- audience
- guiding question
- included or focused event ids
- lane definitions
- highlighted causal paths
- story steps
- teaching notes

A view must not duplicate canonical events or links.

Example:

```json
[
  {
    "id": "teaching-causal-chain",
    "title": "Teach the causal chain",
    "audiences": ["teacher", "student"],
    "projection": {
      "trigger": ["instrument", "effective-date"],
      "response": ["action"],
      "adaptation": ["control"],
      "observableOutcome": ["evidence"]
    }
  }
]
```

## Why views are generic

A compliance pack may use:

```text
law → implementation → control → evidence
```

A World War I lesson pack may use:

```text
structural cause → trigger → escalation → outcome → source evidence
```

A World Cup pack may use:

```text
match result → table implication → affected team → next watchpoint
```

The domains differ, but all are narrative projections over event-and-link data.

## Design rule: data is canonical, views are disposable

Do not encode a lecturer's slide order, an executive dashboard filter, or one UI layout into the causal graph itself.

Instead:

1. Curate events and links once.
2. Add provenance and honest confidence.
3. Create multiple views for different jobs.
4. Allow consumers to ignore view metadata entirely.

This avoids three common failures:

- duplicating nodes for each audience
- coupling data packs to one frontend
- weakening causal semantics to satisfy a presentation layout

## Suggested Canvas behavior

A Canvas consumer may:

1. Load `manifest.json` when present.
2. Load the canonical graph.
3. Offer the view list from `views.json`.
4. Filter or emphasize nodes according to the selected view.
5. Render lanes from event metadata such as `lane`.
6. Enter story mode using `highlightPaths` or `storySteps`.
7. Always preserve access to sources and confidence.

Views should degrade gracefully. A consumer that only understands `events.json`, `links.json`, and `insights.json` must still load the pack successfully.
