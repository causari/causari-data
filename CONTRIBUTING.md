# Contributing to causari-data

We welcome contributions to the causal knowledge graph. Quality over quantity — every event needs a clear description, every link needs cited evidence.

## How to contribute

### Propose a new event

1. Open an issue with the `proposed-event` label
2. Include:
   - **title**: short name
   - **year**: when it happened
   - **description**: 2-4 sentences on what happened and why it matters
   - **domains**: which knowledge domains (technology, science, etc.)
   - **source**: at least one citation (Wikipedia, academic paper, authoritative source)
3. A maintainer reviews, assigns confidence/impact scores, and merges

### Propose a causal link

1. Open an issue with the `proposed-link` label
2. Include:
   - **from**: source event id
   - **to**: target event id
   - **relationship**: caused / enabled / accelerated / inspired / delayed / prevented
   - **evidence**: 1-2 sentences explaining WHY this causal relationship exists
   - **source**: citation supporting the claim
3. Maintainer assigns confidence score and merges

### Propose an insight pattern

1. Open an issue with the `proposed-pattern` label
2. Include:
   - **pattern name**: short descriptive name
   - **description**: explain the recurring pattern with 3+ historical examples
   - **instances**: which existing causal links demonstrate this pattern
   - **predictive value**: your estimate of how useful this is for forward prediction (0-1)

## Quality standards

- **Descriptions must explain WHY, not just WHAT.** "X happened in Y" is not enough. Explain the causal significance.
- **Evidence is required for all causal links.** "A caused B" without explanation is rejected.
- **Confidence scores must be honest.** If you're not sure, use a lower score. 0.5 is fine.
- **No original research.** Events and links should be based on established historical record.
- **Neutral tone.** Avoid politically charged framing. Stick to facts and widely-accepted causal claims.

## What we're looking for

### Priority verticals (accepting now)
- History of Computing & Software Engineering
- AI / Machine Learning history
- Internet & networking history

### Future verticals (accepting proposals, not merging yet)
- History of Science
- Economic history
- Geopolitical systems

### Not accepting
- Current events (< 2 years old) — too early to assess causal significance
- Highly speculative future forecasts (unless clearly marked)
- Events without verifiable sources

## Review process

1. Issue opened with proper label
2. Maintainer reviews within 7 days
3. If accepted: maintainer adds to dataset in next batch update
4. If needs changes: feedback posted on issue
5. Merged events get credited in the dataset (contributedBy field)

## Code of conduct

Be respectful, be honest, be curious. We're building a shared knowledge resource.
