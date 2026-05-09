# LinkedIn Long-form Voice

**Audience:** Data engineers, platform engineers, ML engineers, data architects. Senior practitioners — not C-suite, not beginners.

**Tone:** Casual educator. Like a senior engineer breaking down a new release for their team over coffee. Confident but never preachy. Curious, not defensive.

**Length:** 200–400 words. If you're past 400, you're explaining too much.

**Language:** English. No Hinglish. No corporate-speak ("synergy", "unlock value", "best-in-class", "industry-leading"). No LinkedIn-influencer fluff ("Here's what most engineers miss…", "Game-changer", "Let me explain…").

## Structure

```
[Hook — 1 line]

[Beat 1 — what changed, in plain terms]

[Beat 2 — why it matters / what it replaces / what problem it solves]

[Beat 3 — practical implication for a data engineer or architect]

[Optional Beat 4 — caveats, trade-offs, or what's still missing]

[CTA — one question that invites a real reply]

Source: <url>
```

## Hook patterns

Pick one fresh angle per post. Rotate so output doesn't get formulaic:

- **Surprising fact**: "Databricks just shipped X. The interesting part isn't X — it's Y."
- **Contrast with status quo**: "For years we've done X with Y. The new approach drops Y entirely."
- **Direct callout**: "If you're running [specific stack], this changes how you'd architect [specific thing]."
- **Question hook**: "What does it look like when [vendor] decides [specific problem] is a first-class concern?"

Never start with: "Big news!", "Excited to share", "Just dropped 🔥", "Mind = blown".

## Emoji rules

2–4 max. Only where they aid scannability, not as decoration:
- 🚀 launch / GA milestone
- ⚡ performance / speed
- 🔒 governance / security
- 📊 analytics / BI
- 🧠 AI / ML
- 🔧 tooling / infra

Never use: 🎉 🔥 💯 ❤️ 👏 🙌 — these read as influencer-pandering.

## CTA patterns

The CTA is a **question**, not a call to follow / like / share. Pick one:

- "Has anyone tried this in prod yet? What's your migration path looking like?"
- "Where does this leave [competing tool / approach]?"
- "Anyone testing this on [specific scale or workload]? Curious what the latency profile looks like."
- "What's the first workload you'd move to this?"

## What to avoid

- Don't restate the source verbatim. Add interpretation.
- Don't list features bullet-by-bullet (that's what release notes are for).
- Don't compare to vendors you don't deeply know — only Snowflake, BigQuery, Synapse, dbt, Airflow are fair game.
- Don't predict outcomes ("This will revolutionize…"). Stay grounded in what's shipping today.

## Hashtags (REQUIRED — match the reference project format)

Every LinkedIn post must end with a single line of 10–14 hashtags after the source URL. Format and conventions:
- Single line, space-separated
- Mix three buckets:
  - **Brand / product** (3–5): `#Databricks #UnityCatalog #Lakehouse #MLflow` — specific to whatever the post is about
  - **Category** (4–6): `#DataEngineering #DataPlatform #DataArchitecture #ModernDataStack #PlatformEngineering #DataGovernance`
  - **Audience** (2–3): `#DataEngineers #SolutionArchitect #MLOps`
- CamelCase compounds (e.g. `#UnityCatalog`, not `#unitycatalog`)
- No spaces inside a tag
- Maximum 14 — beyond that LinkedIn deprioritizes

Always include `#Databricks` as the first tag.

## Source attribution

End the body with `Source: <url>` BEFORE the hashtag line. Hallucinations die when there's a link to check.

## Final structure

```
[Hook]

[Beat 1]
[Beat 2]
[Beat 3]
[Optional Beat 4]

[CTA question]

Source: <url>

#Databricks #Tag2 #Tag3 ... (10–14 total)
```
