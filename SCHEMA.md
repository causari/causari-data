# Schema Reference

Version: 1.0

## CKGEvent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Stable kebab-case identifier (e.g. `kubernetes`, `printing`) |
| `title` | string | yes | Short display name |
| `description` | string | yes | What happened and why it matters (2-4 sentences) |
| `yearNum` | number | yes | Numeric year. Negative = BCE. |
| `yearLabel` | string | yes | Human-readable year (e.g. `"1440"`, `"70k BCE"`, `"2017"`) |
| `precision` | enum | yes | One of: `millennium`, `century`, `decade`, `year`, `month`, `day` |
| `domains` | Domain[] | yes | Knowledge domains (see Domain enum below) |
| `impactScore` | number | yes | 0-1, curator-estimated significance |
| `tags` | string[] | yes | Free-form search tags |
| `wikidataId` | string | no | Wikidata Q-id for entity linking (e.g. `Q22661306`) |
| `forecastConfidence` | number | no | 0-1, only for future/speculative events |
| `forecastReasoning` | string | no | Explanation for forecast confidence |

## CausalLink

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Format: `{fromEvent}--{relationship}-->{toEvent}` |
| `fromEvent` | string | yes | Source event id |
| `toEvent` | string | yes | Target event id |
| `relationship` | CausalRelationship | yes | See relationship types below |
| `confidence` | number | yes | 0-1, curator-estimated strength of causal claim |
| `evidence` | string | yes | 1-2 sentences explaining WHY this link exists |

## Insight

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Format: `pattern--{kebab-name}` |
| `pattern` | string | yes | Short pattern name |
| `description` | string | yes | Longer description with historical examples |
| `instances` | string[] | yes | CausalLink ids that demonstrate this pattern |
| `predictiveValue` | number | yes | 0-1, how useful for forward prediction |
| `domains` | Domain[] | yes | Where this pattern applies |

## Domain enum

`technology` | `humanities` | `systems` | `science` | `economy` | `geopolitics` | `philosophy` | `environment` | `culture` | `health`

## CausalRelationship enum

| Value | Meaning |
|-------|---------|
| `caused` | A directly caused B (strong, confidence ≥ 0.85 typical) |
| `enabled` | A was a precondition for B (moderate, 0.6-0.85 typical) |
| `accelerated` | A sped up B's emergence |
| `inspired` | A was the conceptual seed for B |
| `delayed` | A slowed B's development |
| `prevented` | A blocked or reduced B |

## Confidence guidelines

| Score | Meaning |
|-------|---------|
| 0.9-1.0 | Near-certain, well-documented direct causation |
| 0.7-0.89 | Strong evidence, widely accepted by historians |
| 0.5-0.69 | Plausible, debated, or indirect link |
| 0.3-0.49 | Speculative but defensible |
| < 0.3 | Highly speculative |

## Impact score guidelines

| Score | Meaning |
|-------|---------|
| 0.9+ | Civilization-defining (Internet, Printing Press, Transistor) |
| 0.8-0.89 | Major watershed (Linux, TCP/IP, Von Neumann Architecture) |
| 0.7-0.79 | Significant (Docker, React, Python) |
| 0.6-0.69 | Notable (COBOL, WebSockets, OAuth) |
| < 0.6 | Niche or supporting event |
