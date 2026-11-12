---
name: databricks-pulse
description: Scan Databricks-owned content (blog, release notes, community) for what's new in the last 24 hours, rank top 3 by engagement/recency/topic-match, and draft a LinkedIn release-card post + card image + Instagram Reel script for the #1 pick in the user's voice. Use when the user invokes /databricks-pulse, asks "what's new in Databricks today," requests fresh content drafts based on Databricks news, or when a scheduled cron job fires this skill.
---

# Databricks Pulse

You are running a content-intelligence loop. Three sources → dedupe → rank → draft. Be decisive, not exhaustive.

## When to invoke

User says any of:
- `/databricks-pulse`
- "what's new in Databricks today"
- "scan Databricks for fresh content"
- a scheduled CronCreate job fires with the prompt `/databricks-pulse`

## Inputs to read first

Always read these in parallel before doing anything else:

1. `~/.claude/skills/databricks-pulse/config/taxonomy.json` — the keyword list for topic matching
2. `~/.claude/skills/databricks-pulse/config/voice_linkedin.md` — LinkedIn voice template (REQUIRES 10–14 hashtags at end)
3. `~/.claude/skills/databricks-pulse/config/voice_instagram.md` — Reel voice template
4. `~/.claude/skills/databricks-pulse/config/author.json` — author byline. NEVER invent a value — always pull it from `lower_name_full` in this file.
5. `~/.claude/skills/databricks-pulse/config/templates_catalog.json` — visual template guide for Step 6
6. `~/.claude/skills/databricks-pulse/state/seen.json` — items already processed
7. `~/.claude/skills/databricks-pulse/state/published.json` — what was last posted (for template variety check)

## The five steps

### Step 1 — Pull from 3 sources (parallel)

Issue these in a single message with three tool calls:

**Source A — Blog**
- WebFetch `https://www.databricks.com/feed`
- Prompt the fetch with: "Return every item as JSON with fields: title, link, pubDate (RFC 822 string), categories (array), description. Return up to 30 most recent items."

**Source B — Release Notes**
- Determine current month and previous month (e.g., today is 2026-05-09 → fetch May and April)
- WebFetch `https://docs.databricks.com/aws/en/release-notes/product/{YYYY}/{month-lowercase}.html` for current month
- Prompt: "Return every dated entry as JSON with fields: date (YYYY-MM-DD), title, status (GA, Public Preview, Private Preview, Beta, or none), summary (first 200 chars), link (relative anchor href if present)."
- If today is within the first 5 days of a month, also fetch previous month's page to catch late-month entries.

**Source C — Community**
- Run: `node ~/.claude/skills/databricks-pulse/scripts/community-fetch.mjs`
- This outputs JSON to stdout: array of recent threads with fields `{title, url, author, posted_time, reply_count, view_count}`.
- The script handles Khoros's bot detection that blocks bare WebFetch.

### Step 2 — Dedupe and bound the time window

For each item from all three sources:
1. Compute `id = sha256(canonical_url)` (just use the URL itself as a key — no need for actual hashing, the URL is unique enough)
2. Look up id in `state/seen.json`
3. If present AND `drafted_at != null` → drop the item entirely
4. If present but never drafted → keep, may rank up this run
5. If new → keep, will add to state at end

Apply recency cutoff: drop anything older than 24 hours from now.

**Empty fallback (one post per run is the goal — a slow day is the last resort):** If fewer than 3 in-scope items remain after dedupe + 24h cutoff, expand to 48h → 72h → **7 days → 14 days**. A feature that shipped 10 days ago and was never published is still fresh to the audience; prefer it over an empty day. Within a widened window, prefer items never drafted, then GA/Public Preview release notes about compute, networking, governance, pipelines, storage, SQL, DevOps, cost or observability. Only if **no in-scope, never-published item exists within 14 days** write `slow-day.md` and stop. A single in-scope survivor is enough to draft — a "narrow" release note (e.g., a system-tables fix) is a legitimate issue: explain the practical job it does (audit, chargeback, metering) and keep the post tight.

### Step 2b — Scope filter (hard rule, applied before scoring)

The posts are about **platform engineering, data engineering, solution engineering and infrastructure on Databricks**. Drop any item — regardless of score — that is:

- a **customer case study / customer story** ("How <Company> is building…", "<Company> achieves…", "powered by Databricks", customer spotlights, partner success stories, quotes-from-customers posts);
- a partner/marketplace announcement, event recap, webinar, awards, hiring, earnings, or leadership thought-piece without a concrete technical change;
- a pure business-outcome story whose only numbers are a customer's ROI/TCO claims.

Keep items whose substance is **engineering**: compute and serverless, networking and private connectivity, security and compliance, Unity Catalog and governance mechanics, Lakeflow / pipelines / streaming / CDC, Delta / Iceberg / storage and performance, Databricks SQL and warehousing internals, Workflows and Jobs, DevOps (Asset Bundles, Terraform, CI/CD, Git), cost / FinOps / system tables, observability and monitoring, ML/AI *platform* infrastructure (MLflow, Model Serving, AI Gateway, Vector Search), release notes of any of these, and community threads about real engineering problems. When a case study is the only vehicle for a genuinely new technical capability, use the **product docs or release note** for that capability as the source instead — never the case study.

Record dropped items with the reason `out_of_scope` in `ranked.json` so the choice is auditable.

### Step 3 — Score and rank

For each surviving item, compute three sub-scores in [0, 1]:

**Engagement (40%)** — by source:
- Blog: items don't expose comment counts in the feed → use 0.5 as default. Bump to 0.7 if title contains "GA", "now generally available", "launch", "announce". Bump to 0.8 if it's authored by a known leader (CEO, CTO, founder names visible in feed).
- Release note: GA → 1.0, Public Preview → 0.7, Beta → 0.5, Private Preview → 0.4, no label → 0.3
- Community: `min(1.0, (reply_count * 0.6 + view_count / 1000 * 0.4))` clamped to [0, 1]

**Recency (35%)** — bucketed:
- `< 12h` → 1.0
- `< 24h` → 0.85
- `< 48h` → 0.6
- `< 72h` → 0.4

**Topic match (25%)** — read taxonomy.json. Count how many distinct keywords/phrases from the list appear in the item's title + summary (case-insensitive substring match). Score = `min(1.0, match_count / 3)`.

**Final rank score** = `0.4 × engagement + 0.35 × recency + 0.25 × topic_match`

Sort descending. Take top 3.

### Step 4 — Fluff filter on the #1

Before drafting, sanity-check the #1 pick with this question (think it through, no separate tool call needed):

> Does this item contain a concrete technical claim — a new feature, an API change, a measurable improvement, or a GA/preview milestone? OR — is it a community thread that surfaces a real engineering problem readers are actually hitting?

If the answer is **no** (pure marketing fluff, hiring announcement, generic thought-leadership with no technical substance), demote the item: take the next highest-scoring item that passes the check. If none of the top 3 passes, write `slow-day.md` and stop.

Second question, also mandatory: **Is this an engineering/infra topic (Step 2b), not a customer story?** A case study never passes this gate, even if it mentions a product. Prefer a modest release note about compute, networking, governance, pipelines, storage, SQL, DevOps or cost over a glossy customer post every time.

### Step 5 — Draft top 1 (two parallel writes)

Draft LinkedIn and Instagram **independently from the source**, not derived from each other.

**LinkedIn release card** — follow `voice_linkedin.md` exactly (it has an approved reference post). Plain statement of what you can now do → official name + status + date → the gap it closes → 𝗪𝗵𝗮𝘁'𝘀 𝗶𝗻 𝘁𝗵𝗲 𝗯𝗼𝘅 → 𝗪𝗵𝗲𝗻 𝗜'𝗱 𝘂𝘀𝗲 𝗶𝘁 → 𝗔 𝗳𝗲𝘄 𝘁𝗵𝗶𝗻𝗴𝘀 𝘁𝗼 𝗻𝗼𝘁𝗲 → 𝗠𝘆 𝘁𝗮𝗸𝗲 → 7–10 hashtags. 140–230 words, English, no emojis, no link, no CTA question. To get the limits, formats and billing lines right, open the feature's **docs page** (linked from the release note) — the release-note line alone is rarely enough.

**Instagram Reel script** — follow `voice_instagram.md`. Brisk Hinglish, no emojis, hook + 3 beats + comment-trigger CTA. Hook ≤2 lines, speakable in <4 seconds, never starts with "Aaj main" or "Is video mein".

**Hallucination rule:** Every factual claim in either draft must trace to the source content. Don't add features, numbers, or capabilities the source doesn't state. When in doubt, write less.

### Step 6 — Write outputs (text + spec + visual)

Create folder `~/.claude/skills/databricks-pulse/runs/{YYYY-MM-DD-HHMM}/`.

**Get the IST timestamp via the helper, NOT bash `date`:**
```bash
node ~/.claude/skills/databricks-pulse/scripts/now-ist.mjs
# → 2026-05-09-1024  (use this as the run folder name)
node ~/.claude/skills/databricks-pulse/scripts/now-ist.mjs --iso
# → 2026-05-09T10:24:31+05:30  (use this for ISO timestamps in JSON files)
```

The MSYS/Git Bash on Windows has broken tzdata for `TZ='Asia/Kolkata'` — it returns UTC. Always use the Node helper.

**Text artifacts:**

1. `sources.json` — raw items pulled from all three surfaces (full data, not just top 3)
2. `ranked.json` — top 3 with full score breakdown
3. `linkedin.md` — release-card post for #1 (structure and hashtag rules in voice_linkedin.md; no Source URL in the body)
4. `instagram.md` — Reel script for #1 (Hinglish, no emojis)
5. `instagram_caption.md` — STATIC IG caption for #1 (English+light Hinglish, emojis OK, 25–30 hashtags, this is what the auto-poster publishes — see Social_Media_Project/weeks/week01_may06/day02_lakebase/instagram.md as a reference format)
6. `alternatives.md` — one-line summary of #2 and #3 with their scores and URLs

**LinkedIn image — one pool of 22 templates, pick the best fit:**

7. Read `config/templates_catalog.json`. The LinkedIn image can come from **either** pool — `cards` (c01–c12, static/animated infographics) or `templates` (01–10, the original whiteboard visuals: breaking news, stat card, before/after, quote, paper, tweet, top secret, futuristic, newspaper, tutorial). Judge all 22 against the item's content shape and pick the single best fit (e.g. a big benchmark number → `02_stat_card`; a strong opinion/quote → `05_quote_card`; a code feature → `c07_code_card`; a GA API → `c04_ga_announcement`). **Variety rule:** don't reuse the template used by either of the last 2 runs (check `runs/*/card.json`). Write `<run>/card.json` = `{"template": "<id>", "pool": "cards" | "templates"}`.
8. **If the pick is a card (`c0N_…`):** copy `templates/cards/<id>.html` to `<run>/card.html` and replace the sample content with today's facts, following the fill guide comment at the top of the template (slot limits, repeatable blocks, optional parts). Same numbers, status and date as `linkedin.md`. Byline from `config/author.json`. For `c01_annotated_screenshot`, download a real screenshot from the docs page into `<run>/screenshot.png` and Read it to place the highlight boxes; if there is no real screenshot, pick another template. Then run `node ~/.claude/skills/databricks-pulse/scripts/render-card.mjs <run-folder>` (Bash timeout 600000 — animated cards take ~2 min) → `post.png` (+ `post.gif`/`post.mp4`). If it prints `OVERFLOW`, shorten the text and re-run — never ship clipped text. Read `post.png` once and fix anything that looks broken.
9. **If the pick is an original whiteboard template (`0N_…`):** it becomes both the LinkedIn image and the Reel video — fill it in step 10 and do **not** create `card.html`/`post.png` (the poster then uses `linkedin.png`).

**Whiteboard + Reel video (every run):**

10. Fill a template from `templates` into `<run>/whiteboard.html` — the one picked in step 7 if it came from that pool, otherwise the best-fitting whiteboard template for the Reel (variety rule as above). Byline from `config/author.json`; replace text only, don't break CSS. Write `media.spec.json` with `duration_seconds: 16`, `render_viewport: [1080, 1080]`, `inject_css` hiding `.toolbar, .hint` and any non-static decoration, and `pad_color` matching the card background.
11. Run `node ~/.claude/skills/databricks-pulse/scripts/render-video.mjs <run-folder>` — produces `square.mp4`, `vertical.mp4`, `linkedin.png` (frame at 3s), `cover.jpg`. When a whiteboard template was the LinkedIn pick, Read `linkedin.png` once to check the frame looks complete. `pulse-post.mjs` publishes `post.png` if it exists, else `linkedin.png`.

### Step 7 — Update state

Append all newly-seen items to `state/seen.json`. For the #1 (and only #1), set `drafted_at` to current timestamp and `rank_when_drafted: 1`. Items #2 and #3 stay `drafted_at: null` so they can rank up next run if still relevant.

Schema:
```json
{
  "items": {
    "<url>": {
      "url": "...",
      "title": "...",
      "first_seen": "2026-05-09T08:30:00+05:30",
      "drafted_at": "2026-05-09T08:32:14+05:30" | null,
      "rank_when_drafted": 1 | null
    }
  }
}
```

### Step 8 — Report to user

Output a concise summary:
- How many items pulled per source
- Top 3 with scores and URLs (markdown links)
- Path to the run folder so the user can review drafts
- If `slow-day.md` was written, say so and stop

## Critical rules

- **No fabrication.** Every claim in drafts must come from the source. If unsure, omit.
- **Independent dual-format gen.** Don't write LinkedIn first then condense to Reel. Write each fresh from the source.
- **Empty days are fine.** If 72h yields nothing of substance, say so. Don't manufacture content.
- **State is authoritative.** Always update `seen.json` after a run. An item drafted once never gets drafted again.
- **Voice consistency.** LinkedIn = release-card format from voice_linkedin.md (facts, arrows, bold headings, My take, no emojis). Reel = brisk Hinglish + zero emojis. Never blend.
