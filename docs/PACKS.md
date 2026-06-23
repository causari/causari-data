# Event Packs

Causari event packs are optional, topic-specific causal datasets that sit beside the core long-horizon causal knowledge graph.

They are useful when a domain has a clear event stream, a focused audience, or a faster update cadence than the core dataset.

Examples:

- live tournaments and seasons
- product launches
- market cycles
- AI ecosystem timelines
- geopolitical or policy timelines
- company or technology histories

## Directory layout

```text
packs/{pack-id}/
├── README.md       # pack purpose, audience, curation notes
├── events.json     # CKGEvent-compatible events
├── links.json      # CausalLink-compatible relationships
└── insights.json   # recurring patterns found inside this pack
```

## Compatibility

Pack files should remain compatible with the existing Causari schemas:

- `events.json` follows `CKGEvent`
- `links.json` follows `CausalLink`
- `insights.json` follows `Insight`

For live or short-horizon timelines, packs may use the following optional event fields:

| Field | Type | Description |
|---|---|---|
| `date` | string | ISO date when the event happened or is scheduled |
| `dateLabel` | string | Human-readable date label |
| `status` | string | `completed`, `scheduled`, `live`, or `forecast` |
| `entities` | string[] | Teams, companies, people, or other actors affected by the event |
| `whyItMatters` | string | Short explanation of the event's causal importance |
| `nextWatchpoints` | string[] | Follow-up events or questions to monitor |

These optional fields let a pack model live event intelligence without changing the core schema.

## Pack quality bar

A pack should be accepted when it has:

1. A clear audience and use case.
2. Events that are significant enough to change downstream interpretation.
3. Links with explicit causal reasoning, not just chronological adjacency.
4. Honest confidence scores.
5. Enough citations or source notes for later verification.

## Relationship guidance for live timelines

Use relationship types conservatively:

- `caused`: direct result, such as a match win causing qualification.
- `enabled`: opened a path or condition for a later event.
- `accelerated`: increased momentum or made an outcome more likely sooner.
- `inspired`: tactical, narrative, or conceptual influence.
- `delayed`: slowed progress toward an outcome.
- `prevented`: blocked a path or eliminated a possibility.

When in doubt, prefer `enabled` or `accelerated` over `caused`.

## Suggested consumption pattern

AI agents and UIs can load packs independently:

```typescript
import events from '@causari/data/packs/worldcup-2026/events.json';
import links from '@causari/data/packs/worldcup-2026/links.json';
import insights from '@causari/data/packs/worldcup-2026/insights.json';
```

A visual explorer can then render:

```text
Event → causal link → affected entity → next watchpoint
```
