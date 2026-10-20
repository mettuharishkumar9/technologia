# LinkedIn Voice — Insurance Lens (real situation → feature)

**What a post is:** a real, documented situation from the insurance world, the data problem it created, and exactly where today's Databricks feature would slot in. Not a fictional scene. Not a feature announcement. A true story with the feature mapped onto it.

**Audience:** Data engineers, platform engineers, ML engineers, architects — especially in or around insurance. Senior practitioners, but assume they don't know insurance jargon. Define terms inline the first time.

**Tone:** Plain conversational English. Short sentences. Like explaining to a colleague over coffee. No metaphors, no scene-setting adjectives, no drama. The real numbers carry the weight.

**Lens:** Insurance, always. Read `config/industry_lens.md` first — it has the verified situation bank, the feature→workflow mapping, the research rules, and the output format for the carousel.

**Two outputs share one story:** `linkedin.md` (the caption) and `carousel.json` (13 slides). Same beats, same numbers, same sources. Write the beats once, then render them into both.

## The beats (caption paragraphs = carousel slides)

| # | Beat | Caption | Slide |
|---|---|---|---|
| 1 | **Situation** — date, place, event, the regulator's or industry body's numbers | para 1 | 1 cover (giant number) + 2 what happened |
| 2 | **What it means for a data team** — the workload the situation creates | para 2 | 3 |
| 3 | **The catch** — where the data lives / what blocks the obvious fix | para 3 | 4 the catch + 5 before |
| 4 | **The feature** — what shipped, status, how it works, the key options. Facts ONLY from the Databricks source | para 4 | 6 feature + 7 how it works + 8 options |
| 5 | **After** — the situation replayed with the feature in place | para 5 | 9 after + 10 before-vs-after |
| 6 | **Beyond + caveats** — one or two other uses; what's still preview/missing | para 6 | 11 |
| 7 | **Question** — aimed at people who run insurance data platforms | last line | 12 takeaway + CTA |
| — | Sources + honesty note | one `Source:` line | 13 |

## Caption rules (`linkedin.md`)

- **Length:** 300–450 words in the body. **Hard cap 2,800 characters total** including the Source line and hashtags (LinkedIn truncates at 3,000).
- **Line 1** is the situation: a date, a place, an event — or the number. Never the feature, never "Databricks".
  - ✅ "On 28 September 2022, Hurricane Ian hit Florida. Within two weeks, insurers had logged about 449,000 claims."
  - ❌ "Databricks just launched…" · ❌ "Picture a claims team…" · ❌ "Big news!"
- **Numbers in prose are rounded** ("about 449,000", "$10.3 billion"); **exact figures go on the slides** and in `sources.md`.
- **Attribute every number inline** ("according to the Florida Office of Insurance Regulation") and add "as of <month year>" when it's a running total.
- **Explain, don't narrate.** "Here's the catch." "Think about what that means for a claims data team." Short connective sentences are fine; adjectives and metaphors are not.
- **Define jargon in one clause** on first use: "FNOL — the first notice of loss, the moment a claim is reported".
- **Emojis:** 0–2 in the whole caption, only 🔒 ⚡ 📊 🧠 🔧 🚀 where they aid scanning. Never 🎉 🔥 💯 ❤️ 👏 🙌.
- **End with:** the question → `Slides 👇 Sources on the last one.` → `Source: <Databricks URL>` → hashtag line.
- **Hashtags:** 10–14, single line, `#Databricks` first. Buckets: brand/product (3–4) · category (3–4: `#DataEngineering #DataPlatform #PlatformEngineering #DataGovernance`) · insurance (2–3: `#Insurtech #InsuranceData #ClaimsAnalytics #Underwriting #Actuarial #Reinsurance #CatastropheClaims`) · audience (1–2: `#DataEngineers #SolutionArchitect`). CamelCase, no spaces.

## Truth rules (non-negotiable)

1. **The situation is real.** Pick it from the verified bank in `industry_lens.md`, or research a new one with WebSearch during the run. A situation = a named event, deadline, case or public case study, with a date and a place.
2. **No number without a link.** Every figure must have a URL in `sources.md`, and the carousel's slide 13 lists the sources. Prefer regulators and industry bodies (state insurance regulators, IRDAI, GDV, ICA, TCIP, FLOIR, TDI) over news estimates; name the body in the text.
3. **Feature facts come only from the Databricks source** — status, clouds, modes, limits. Add nothing. If the source doesn't say it, the post doesn't say it.
4. **Never attribute a workflow or a constraint to a named company.** "The claims system (Guidewire, Duck Creek, or an in-house database) sits on the company's private network" describes how insurers generally work — it does not claim any Florida carrier had that problem. Say so in the honesty note.
5. **Named organisations only if** they are public institutions (regulators, catastrophe pools, industry associations) or the source names them (e.g., a Databricks customer story). **Never the author's employer.**
6. **Rotate.** Not the same situation type (catastrophe / regulatory deadline / fraud / market event / public case study) two days in a row; not the same event within 30 days; vary regions (US, India, Europe, UK, APAC, Middle East). Check the last five runs' `sources.md`.
7. **Honest fit.** If the feature has no truthful insurance mapping, choose a smaller true one (a chargeback report, a CI/CD step for a pricing model) rather than stretching a story.

## What to avoid

- Restating the Databricks blog. The post interprets the feature through the situation.
- Feature bullet lists in the caption. The comparison and the "after" carry the detail.
- Comparing to vendors you don't deeply know — only Snowflake, BigQuery, Synapse, dbt, Airflow are fair game.
- Predictions ("this will transform insurance"). Stay with what shipped and what happened.
- Disaster language. The numbers are serious enough on their own.

## Final caption shape

```
[Situation — dated, placed, numbered, attributed]

[What it means for a data team]

[The catch / before]

[The feature — status, how it works, key options] 🔒

[After — the situation replayed]

[Beyond + caveat]

[Question]

Slides 👇 Sources on the last one.

Source: <Databricks URL>

#Databricks #Tag2 … (10–14)
```
