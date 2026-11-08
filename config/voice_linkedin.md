# LinkedIn Post Voice — "release card" format (set 2026-11-08)

**Audience:** Data engineers, platform engineers, solution architects, Databricks MVPs. Practitioners who want the facts fast.

**Tone:** A senior platform engineer telling peers exactly what shipped, what it can do, where it fits and where it bites. Plain, confident, specific. No hype, no storytelling, no industry scenes.

**Length:** 140–230 words before the hashtags. Short lines. Every line earns its place.

**Language:** English. No Hinglish. No emojis in the post body (the → and • markers do the scanning work). No corporate-speak ("unlock", "game-changer", "best-in-class"). No influencer openers ("Here's what most engineers miss…", "Big news!").

## Exact structure

```
<Line 1 — one plain sentence: "<Product/feature> can now <do X>, <in context Y>." Says what you can now do, not that something "launched".>

<Line 2 — official feature name + status + date: "<Exact name from the release note> moved to Public Preview on 2 Nov 2026." / "… is now Generally Available (5 Nov 2026)." / "… is in Beta as of …">
<Line 3–4 — the problem it closes, in two or three short sentences. What lived where before, what this connects.>

𝗪𝗵𝗮𝘁'𝘀 𝗶𝗻 𝘁𝗵𝗲 𝗯𝗼𝘅
→ <concrete capability or limit with a number>
→ <supported formats / sources / targets>
→ <how it works or stays in sync — one line>

𝗪𝗵𝗲𝗻 𝗜'𝗱 𝘂𝘀𝗲 𝗶𝘁
→ <a real workload type with two concrete examples, joined by a colon>
→ <optional second use case>

𝗔 𝗳𝗲𝘄 𝘁𝗵𝗶𝗻𝗴𝘀 𝘁𝗼 𝗻𝗼𝘁𝗲
• <design implication — what to plan for>
• <hard limit / what's skipped / what's unsupported>
• <billing or prerequisite (workspace setting, preview enablement, compute type)>

𝗠𝘆 𝘁𝗮𝗸𝗲: <one or two sentences of genuine opinion — what changes for the people building on it. Ends on a practical consequence, not a question.>

#Databricks #<Product> #<Feature> #<Category> #<Category> #<Audience> #DataEngineering
```

Copy the four bold headings exactly as above (they are Unicode bold, which survives LinkedIn's plain-text editor). Blank line between sections; no blank line between line 2 and line 3.

## Reference post (approved by Harish — match this)

```
Databricks Genie Agents can now answer questions from your PDFs, Word files and slide decks in Unity Catalog volumes, in the same conversation as your tables.

Analyze files in volumes with a Genie Agent moved to Public Preview on 2 Nov 2026.
The numbers live in tables. The reasons behind them live in documents: policy PDFs, escalations, call notes. A Genie Agent can now read both.

𝗪𝗵𝗮𝘁'𝘀 𝗶𝗻 𝘁𝗵𝗲 𝗯𝗼𝘅
→ Up to 10 volumes per agent, 10,000 files per volume
→ PDF, Word, PowerPoint, images, Markdown and text
→ Content search indexes the files and stays in sync

𝗪𝗵𝗲𝗻 𝗜'𝗱 𝘂𝘀𝗲 𝗶𝘁
→ Domain agents where the "why" sits in documents: support SLAs with escalation notes, pipeline stages with call logs

𝗔 𝗳𝗲𝘄 𝘁𝗵𝗶𝗻𝗴𝘀 𝘁𝗼 𝗻𝗼𝘁𝗲
• The whole volume is indexed, so plan one volume per domain
• Files over 100 MB or 500 pages are skipped
• Parsing is billed as AI Functions, answers as standard Genie usage

𝗠𝘆 𝘁𝗮𝗸𝗲: a Genie Agent that can open the policy PDF explains the number instead of only reporting it. Your volume description now matters as much as your table metadata.

#Databricks #GenieAgents #UnityCatalog #GenAI #AIAgents #DataEngineering #PlatformEngineering
```

## Rules

- **Facts only from the Databricks source** (release note, docs page, blog). Every number, limit, date, format and billing line must be in the source. If the source has no limits or billing info, drop that bullet — don't guess. 2–3 bullets per section is the norm; a section with nothing factual to say is removed entirely (except "My take").
- **No inferred mechanics, costs or performance.** Don't explain *why* the old way was slow/expensive, don't predict spend or speed changes, don't describe edge-case behaviour (what happens on later edits, via API, etc.) unless the source says it. This applies to the gap paragraph and to "My take" too. (First live draft, 9 Nov 2026, invented "one cold-start wait, one line on the bill" and "spend will drift down" — both cut.)
- **Status words are literal.** Only write "Generally Available", "Public Preview" or "Beta" when the source uses that label for this item. A default/behaviour change with no label is "per the release note dated <date>", not GA.
- **Date** in line 2 is the release-note date in `D Mon YYYY` form.
- **"When I'd use it"** names workload types and concrete examples, never a named company or employer.
- **"My take"** is opinion, clearly the author's; it may not introduce new facts.
- **No link in the post body** (LinkedIn suppresses reach on external links). The source URL lives in `ranked.json` / `alternatives.md`, not in `linkedin.md`.
- **No CTA question, no "follow for more"** — the post ends on My take + hashtags.
- The card image and the post must agree: same numbers, same status, same date.

## Hashtags (REQUIRED)

One line at the very end, 7–10 tags, space-separated, CamelCase, `#Databricks` first.
- Product/feature (2–4): `#GenieAgents #UnityCatalog #LakeflowJobs #DeltaLake`
- Category (2–4): `#GenAI #AIAgents #DataGovernance #DataPlatform #DevOps`
- Audience (1–2): `#DataEngineering #PlatformEngineering #SolutionArchitect`
Don't use `#DatabricksMVP` (it reads as a title claim).
