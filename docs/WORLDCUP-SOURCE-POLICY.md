# World Cup source and reconciliation policy

The World Cup pack is assembled by more than one process:

- a schedule/result feed updates mechanical match facts;
- a scheduled agent or human writes daily recap history;
- editors add causal interpretation, watchpoints and translations.

These producers are complementary, not interchangeable. An AI-written recap is an editorial surface and must never become the sole authority for a score.

## Stable identity

Use `matchNumber` as the stable identity whenever the competition feed provides it. Human-readable event ids may change when a placeholder such as `W91` resolves to `Norway`, so they cannot be used as the primary merge key.

Each numbered match also carries:

```json
{
  "matchNumber": 99,
  "matchKey": "wc2026-match-099",
  "sourceMatchId": "openfootball:worldcup-2026:99"
}
```

Legacy ids are retained in `legacyIds` only for traceability. Links are remapped to the canonical event during reconciliation.

## Field ownership

| Field class | Primary owner | Merge rule |
|---|---|---|
| Match identity, participants, date, venue, status | schedule/result feed | refresh by `matchNumber` |
| Regulation, extra-time and penalty scores | result feed | structured result; conflict blocks publish |
| Sources/citations | every producer | union and deduplicate; never overwrite |
| `whyItMatters`, watchpoints, translations | editorial layer | preserve unless still mechanical/template text |
| Causal links and insights | editorial/curation layer | preserve; mechanical links may only fill gaps |

## Score semantics

A completed match stores all available score stages:

```json
{
  "result": {
    "regulation": [1, 1],
    "extraTime": [1, 2],
    "final": [1, 2],
    "decidedBy": "extra_time"
  }
}
```

For a penalty shootout, `final` is the score after extra time and `penalties` stores the shootout separately. The event title displays the final match score and, when relevant, the shootout score.

## Conflict policy

Do not use last-write-wins for factual disagreements.

1. If two independently sourced records disagree on participants, score or winner, the workflow fails.
2. The conflicting records remain visible for manual review; one source is not silently discarded.
3. A reviewed correction submitted through `add-match-day.mjs` must include `factCorrection.reason`.
4. `validate-worldcup-consistency.mjs` compares the structured pack with every daily recap before publication.

This policy lets the project add FIFA, open data, Reuters/AP, manual curation or future adapters without coupling truth to one ChatGPT schedule or one upstream repository.
