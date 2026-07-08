# Causal-data contract — the worldcup-2026 pack

> The `worldcup-2026` pack feeds a **public causal-intelligence visual** at
> causari.ai/wc2026. That page is a causal *display engine*: for every match it can
> render **why it matters, what it changes, what it sets up, the pattern it repeats,
> and the history it echoes**. It only looks intelligent if the DATA is causal.
> This document is the quality bar every daily update must clear — and the reason a
> mechanical "here's the scoreline + who scored" feed makes the page *disprove* the
> product instead of proving it.
>
> **The page is bilingual (Vietnamese + English).** A Vietnamese reader who switches
> the page to VI must see the causal prose *in Vietnamese*, not English fallback. So
> every causal string the page renders ships in BOTH languages: English in the
> canonical field (`whyItMatters`, `nextWatchpoints`) and fluent Vietnamese in the
> `_vi` twin (`whyItMatters_vi`, `nextWatchpoints_vi`). See §2b.

This is the contract the daily process must satisfy. It is enforced in code by
`scripts/causal-quality.mjs` (a gate that FAILS on templated/broken causal data) and
should be pasted, in its "Daily process" form, into the scheduled updater.

---

## 0. What went wrong (read this first)

Two daily processes touch this repo, and they were fighting:

| Process | Writes | Effect |
|---------|--------|--------|
| `.github/workflows/ingest.yml` (cron 06:00 UTC → `ingest-openfootball.mjs`) | `packs/worldcup-2026/*.json` | **Used to fully OVERWRITE** the pack from openfootball: `whyItMatters="Scorers: …"`, one `accelerated 0.62` link per big win, 1 templated insight, no lineage, no watchpoints. |
| The recap agent (`Add/Update WC2026 recap …`) | `wc2026/history/*.json`, `wc2026/data/recaps.json` | Rich causal content — but for a *different* page (`causari.github.io/…/wc2026/`), never the pack. |

So the rich editorial the team already produced never reached the pack the causari.ai
page actually reads, and the mechanical cron clobbered anything curated into the pack.
A real data bug shipped live as a result: a link read **"Mexico's 0–3 win"** (Mexico won
**3–0** — the score was copied straight from the reversed title `Czech Republic 0–3 Mexico`).

**The fix, now in place:**
1. `ingest-openfootball.mjs` now **MERGES, not overwrites** — it owns only the mechanical
   facts (title/scoreline/date/status) and PRESERVES every curated field
   (`whyItMatters`, `nextWatchpoints`, typed links, lineage, insights). Its
   backwards-scoreline bug is fixed (it now reports the winner's own margin).
2. `scripts/causal-quality.mjs` gates the causal layer semantically (see §4).
3. The daily editorial (§3) runs through `scripts/add-match-day.mjs`, which merges +
   validates + causal-quality-gates in memory and writes nothing on failure.

---

## 1. What every daily update MUST produce

For **each completed match** (a `status:"completed"` event):

| Field | Rule |
|-------|------|
| `title` | `"<TeamA> <a>–<b> <TeamB>"` — real, sourced scoreline. For a KO decided on penalties: `"A 1–1 B (4–2 pens)"`. The winner's score is the higher number in the *winner's* order. |
| `description` | 1–2 sentences: what happened, in context (not just the scoreline). |
| `whyItMatters` | **The stakes.** What this result *changes* and what it *sets up*. Never `"Scorers: …"`, never `"Full-time …"`. See §2. |
| `whyItMatters_vi` | **Fluent Vietnamese twin** of `whyItMatters` — same stakes, natural football-fan tone, not machine-literal. **Required whenever `whyItMatters` is present.** See §2b. |
| `nextWatchpoints` | **2–5** concrete things to watch next (the fixture it sets up, the GD race, a returning suspension, an echo to watch). |
| `nextWatchpoints_vi` | **Fluent Vietnamese twin** of `nextWatchpoints` — same array length, one VI string per EN watchpoint. **Required whenever `nextWatchpoints` is present.** See §2b. |
| `entities` | Both teams (names the UI resolves — see §5) + the group or round label + optionally the venue. |
| `sources` | **REQUIRED** — a real citation URL where the scoreline is verifiable. `add-match-day.mjs` rejects a completed result with no source. |
| `date` / `dateLabel` / `status` | ISO `YYYY-MM-DD` / `"June 24, 2026"` / `"completed"`. |
| `kickoff` (recommended) | ISO time `"2026-06-24T19:00:00-05:00"` so the page counts down to the exact minute and locks `scheduled→live` precisely. Date-only fixtures count to local midnight. |

For **each result**, add **2–5 typed causal links** with:

- **Varied relationships** — draw from `caused` / `enabled` / `accelerated` / `inspired` /
  `delayed` / `prevented`. **Include negative causation** where it's real (an injury that
  `prevented` a comeback; a red card that `delayed` a favourite's progress). A pack where
  every link is `accelerated` is a FAIL.
- **Honest, varied confidence** — `caused` 0.85–0.95 · `enabled` 0.70–0.85 ·
  `accelerated` 0.50–0.70 · `inspired` 0.40–0.70 · `delayed`/`prevented` 0.45–0.75. Not
  everything is 0.62.
- **Specific evidence** — one sentence naming the actual mechanism, not a reusable
  template. The same evidence string appearing twice is a FAIL.
- **`evidence_vi` (optional but encouraged)** — a fluent Vietnamese twin of the
  evidence sentence. Not gated (links are dense and secondary), but when cheap to
  author it lets the page render the causal-link tooltips in Vietnamese too.
- **event → event** endpoints that both exist in the pack. A "sets up the next fixture"
  link points at a real `scheduled` event.

Add **1–3 historical-resonance links** where a result genuinely echoes the lineage
(e.g. a host knocked out at home → `inspired`/`echoes` the `maracanazo-1950` lineage node).
These only work if the **160-year lineage is present** — never delete it.

**Preserve, never overwrite:**
- The **history-spine lineage** (folk football → 1863 codification → FIFA → expansion →
  2026). It gives every match a "history it echoes."
- The **curated insight patterns** (merge new links into existing `instances`; add a new
  pattern only for a genuinely new recurrence).

---

## 2. `whyItMatters` — the one line that makes or breaks the page

`whyItMatters` is the headline the drawer shows. It must answer **"why does this result
matter?"** in the language of stakes and consequences.

**Banned (mechanical — the gate FAILS these):**
- `"Scorers: Julián Quiñones, Raúl Jiménez."` ← who scored is not why it matters
- `"Full-time 0–0 at Houston."`
- `"Upcoming Group A match."`

**Required shape:** *stakes → what it changes → what it sets up.*

Worked examples from the **actual current matches** (rewrite the live templated lines):

| Match | Templated (live, WRONG) | Real `whyItMatters` (RIGHT) |
|-------|-------------------------|-----------------------------|
| Mexico 2–0 South Africa (opener) | `Scorers: Julián Quiñones, Raúl Jiménez.` | A clean home win on opening night puts co-host Mexico in control of Group A and gives the tournament a confident, on-script start at the Azteca. |
| Canada 6–0 Qatar | `Scorers: Cyle Larin, Jonathan David …` | Canada's first-ever men's World Cup win banks a commanding goal difference — often the tie-breaker in a group of four — turning a milestone into a real qualification platform. |
| Turkey 3–2 USA | `Scorers: Arda Güler, Baris Alper Yilmaz …` | A host stumbling on the final matchday — even while still topping the group — shifts round-of-32 seeding and cools a home crowd on a single ninety minutes. |
| Morocco 3–0 Canada (QF) | `Scorers: Azzedine Ounahi …` | Morocco reach a second straight World Cup quarter-final and confirm their counter-attacking model travels; Canada's dream host run ends at the last eight. |

---

## 2b. Bilingual causal prose — `_vi` is not optional

The page ships in **Vietnamese and English**. When a reader picks VI, the drawer reads
`whyItMatters_vi` / `nextWatchpoints_vi` and falls back to the English canonical field
only when the `_vi` twin is absent. A Vietnamese reader seeing English detail text is a
visible quality failure — the whole point of the causal layer is lost in translation.

**So every daily update emits BOTH languages:**

| EN field (canonical) | VI twin (required when EN present) | Type |
|----------------------|------------------------------------|------|
| `whyItMatters` | `whyItMatters_vi` | string |
| `nextWatchpoints` | `nextWatchpoints_vi` | string[] (same length) |
| `evidence` (on links) | `evidence_vi` (encouraged, not gated) | string |

**Translation quality bar — natural, not machine-literal:**

- Write Vietnamese a football fan would actually read — the register of a VnExpress /
  Bongdaplus match report, not Google-Translate word order.
- **Keep proper nouns sensible.** Team, player, competition, and venue names stay in
  their common Vietnamese sports-press form: countries use the familiar VI name
  (`Mexico → Mexico`, `South Africa → Nam Phi`, `Netherlands → Hà Lan`,
  `Ivory Coast → Bờ Biển Ngà`, `USA → Mỹ`, `South Korea → Hàn Quốc`), while player and
  city names stay as written. Do **not** transliterate team names into something the
  bracket can't recognise — the `_vi` text is prose, the `entities` stay canonical EN.
- **Preserve the causal tone.** `whyItMatters` is stakes → what it changes → what it
  sets up; the VI twin must carry the same causal arc, not a flat "đội A thắng đội B".
- **`nextWatchpoints_vi` is 1:1** — one VI string per EN watchpoint, same order, same
  count. The validator warns if the lengths differ.
- **Never a copy of the EN.** A `_vi` value byte-identical to its EN twin is treated as
  "not translated" and warned (see §4).
- **The EN canonical field is the source of truth and is never edited to fit the VI.**
  Fix a bad EN line in EN; the VI follows.

Worked VI examples (translating the §2 lines above — fluent, causal, fan-register):

| Match | `whyItMatters` (EN) | `whyItMatters_vi` (VI) |
|-------|---------------------|------------------------|
| Mexico 2–0 South Africa | A clean home win on opening night puts co-host Mexico in control of Group A and gives the tournament a confident, on-script start at the Azteca. | Chiến thắng sạch lưới ngay trận khai mạc trên sân nhà giúp đồng chủ nhà Mexico nắm quyền kiểm soát bảng A, mở màn giải đấu đúng kịch bản ngay tại Azteca. |
| Canada 6–0 Qatar | Canada's first-ever men's World Cup win banks a commanding goal difference — often the tie-breaker in a group of four — turning a milestone into a real qualification platform. | Chiến thắng đầu tiên trong lịch sử dự World Cup của tuyển nam Canada mang về hiệu số bàn thắng vượt trội — thứ thường phân định ngôi đầu ở bảng bốn đội — biến cột mốc lịch sử thành bàn đạp đi tiếp thực sự. |
| Morocco 3–0 Canada (QF) | Morocco reach a second straight World Cup quarter-final and confirm their counter-attacking model travels; Canada's dream host run ends at the last eight. | Morocco lần thứ hai liên tiếp vào tứ kết World Cup và chứng minh lối chơi phản công của họ phát huy hiệu quả ở mọi sân chơi; hành trình mơ mộng của chủ nhà Canada dừng lại ở vòng tám đội mạnh nhất. |

Worked `nextWatchpoints_vi` (1:1 with the EN array on Mexico 2–0 South Africa):

```
"nextWatchpoints": [
  "Whether Mexico can back up the win against South Korea",
  "South Africa's need to respond after an opening-day defeat",
  "Group A's clean-sheet and goal-difference race taking shape"
],
"nextWatchpoints_vi": [
  "Liệu Mexico có duy trì được phong độ trước Hàn Quốc",
  "Sức ép buộc Nam Phi phải đáp trả sau thất bại ngày ra quân",
  "Cuộc đua sạch lưới và hiệu số bàn thắng ở bảng A đang định hình"
]
```

---

## 3. Daily process (paste this into the scheduled updater)

```
You are the daily updater for the Causari "worldcup-2026" pack in causari/causari-data.
The pack feeds a PUBLIC causal-intelligence visual — a wrong or templated update is a
public credibility failure. Quality + honesty over completeness.

Each run:

1. Fetch yesterday's + today's FIFA World Cup 2026 fixtures and results from an
   authoritative source (FIFA match centre / a reputable results API). For every
   COMPLETED match capture: teams, score, group/round, date, and a citation URL.
   If you cannot verify a result against a real source, SKIP it — never guess a score.

2. Build scripts/match-day.json following scripts/match-day.example.json. For each
   completed result produce a REAL, non-templated:
     - title  "TeamA a–b TeamB"  (winner's order; penalties as "A 1–1 B (4–2 pens)")
     - whyItMatters  — stakes / what it changes / what it sets up (NEVER "Scorers: …")
     - whyItMatters_vi — the SAME line in fluent Vietnamese (fan register, causal tone,
       proper nouns sensible — see §2b). REQUIRED alongside whyItMatters.
     - nextWatchpoints — 2–5 concrete things to watch next
     - nextWatchpoints_vi — the SAME array in Vietnamese, one VI string per EN item,
       same order + length. REQUIRED alongside nextWatchpoints.
     - entities — both teams (UI-resolvable names) + group/round + optional venue
     - sources — REQUIRED citation URL
     - kickoff (recommended) — ISO datetime for the fixtures this sets up
   Then 2–5 typed links per result with VARIED relationships (caused/enabled/
   accelerated/inspired/delayed/prevented — include negative causation), honest
   VARIED confidence, and SPECIFIC evidence (never a reused template sentence).
   Add evidence_vi (fluent VI twin of the evidence) where cheap — encouraged, not gated.
   Where a result echoes World Cup history, add a link into the lineage spine.
   Attach new links to an existing insight pattern via insightInstances, or add a
   genuinely new pattern under newInsights.

3. Apply + validate (writes nothing on failure):
       node scripts/add-match-day.mjs scripts/match-day.json
       node scripts/validate-pack.mjs   worldcup-2026    # structure
       node scripts/causal-quality.mjs  worldcup-2026    # semantic causal gate
   If ANY command exits non-zero, fix the input and retry. Do NOT commit on failure.

4. Commit ONLY if all three passed, then delete scripts/match-day.json:
       git add packs/worldcup-2026
       git commit -m "data(worldcup): match-day update <YYYY-MM-DD>"
       git push

Stay strictly within packs/worldcup-2026/. NEVER touch data/, other packs, or the
history-spine lineage / curated insights except to ADD to them. A smaller correct,
sourced, causal update beats a large mechanical one.
```

---

## 4. What the gate enforces (`scripts/causal-quality.mjs`)

A push FAILS if any of these are true (this is what the live pack currently trips):

1. `whyItMatters` matches `/^Scorers:/`, `/^Full-time \d/`, or `/^Upcoming .* match/`.
2. One relationship type is **> 70 %** of all links, or fewer than **3 distinct** types.
3. Every link shares one **confidence** value.
4. The **same evidence sentence** is reused across links.
5. A **backwards scoreline** — evidence says "`<winner>`'s a–b win" with a < b.
6. A **completed** event whose title has no parseable "A n–m B" scoreline.
7. A **scheduled** event whose title carries a scoreline.
8. An **unrecognized round label** (one `canonRound()` in the bracket won't accept).
9. A knockout **team** that doesn't resolve to the UI's CODE/ISO2 maps or a known alias.
10. **Watchpoint coverage** below 50 % of completed matches (target ≥ 90 %).

Warnings (not fatal, but tracked): thin `whyItMatters`, missing lineage, < 2 insights,
under-calibrated confidence, watchpoint coverage 50–90 %.

**Bilingual coverage (warnings — VI is additive, so it degrades gracefully rather than
blocking a push):**

- An event has `whyItMatters` but no `whyItMatters_vi` (VI coverage gap).
- An event has `nextWatchpoints` but no `nextWatchpoints_vi`, or the two arrays differ
  in length (a watchpoint went untranslated).
- A `_vi` value is byte-identical to its EN twin (not actually translated).

These are warnings, not hard failures: a Vietnamese reader falls back to English when a
`_vi` is missing, so a coverage gap degrades the page rather than breaking it. The gate
prints the VI coverage percentage so a regression is visible in CI even while soft.

---

## 5. Team-name + round-label vocabulary (must resolve in the UI)

The bracket maps names → flag + 3-letter code. A name outside this set (and its aliases)
renders as a grey fallback pill. Use these canonical names, or an accepted alias:

- Canonical team names: the 48-team field (see `KNOWN_TEAMS` in `causal-quality.mjs`,
  kept in sync with `CODE`/`ISO2` in `apps/saas/public/embed/wc-bracket.html`).
- Accepted aliases include: `Türkiye→Turkey`, `Czechia→Czech Republic`,
  `Korea Republic→South Korea`, `Côte d'Ivoire→Ivory Coast`, `IR Iran→Iran`,
  `United States→USA`, `Bosnia and Herzegovina→Bosnia & Herzegovina`, `Cabo Verde→Cape Verde`.
- Round labels: `Round of 32`, `Round of 16`, `Quarter-final`, `Semi-final`,
  `Match for third place`, `Final` (case/spacing-tolerant; `R16`, `1/8`, `Last 16`, etc.
  all resolve). Group labels `Group A`…`Group L` are legal entities, not rounds.

---

## 6. The honesty rules (non-negotiable)

- **Real, sourced results only.** Never invent or recall a scoreline. Every `completed`
  result cites a source; the tooling rejects an uncited one.
- **A `scheduled` fixture has no result** — teams/date/venue only, never a predicted score.
- **Preserve human + other-process work.** The ingest merges; the editorial adds. Neither
  deletes the lineage or the curated insights.
