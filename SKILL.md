---
name: databricks-pulse
description: Scan Databricks-owned content (blog, release notes, community) for what's new in the last 24 hours, rank top 3 by engagement/recency/topic-match, and draft a LinkedIn long-form post + Instagram Reel script for the #1 pick in the user's voice. Use when the user invokes /databricks-pulse, asks "what's new in Databricks today," requests fresh content drafts based on Databricks news, or when a scheduled CronCreate job fires this skill.
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

**Empty fallback:** If fewer than 3 items remain after dedupe + 24h cutoff, expand to 48h. If still <3, expand to 72h. If still <3 after 72h, write `slow-day.md` to the run folder explaining the situation and **stop without drafting**.

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

### Step 5 — Draft top 1 (two parallel writes)

Draft LinkedIn and Instagram **independently from the source**, not derived from each other.

**LinkedIn long-form** — follow `voice_linkedin.md`. Audience: data engineers, platform engineers, architects. Length 200–400 words. Casual educator tone, 2–4 emojis max, English (not Hinglish).

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
3. `linkedin.md` — long-form post for #1 (MUST end with 10–14 hashtags per voice_linkedin.md)
4. `instagram.md` — Reel script for #1 (Hinglish, no emojis)
5. `instagram_caption.md` — STATIC IG caption for #1 (English+light Hinglish, emojis OK, 25–30 hashtags, this is what the auto-poster publishes — see Social_Media_Project/weeks/week01_may06/day02_lakebase/instagram.md as a reference format)
6. `alternatives.md` — one-line summary of #2 and #3 with their scores and URLs

**Visual rendering — pick template by signal type:**

7. Read `config/templates_catalog.json` → pick the template that best fits the source item's signal type (see `use_when` per template).
   - **Variety rule:** check the last few runs' template choices in `state/published.json` (or scan recent `runs/*/whiteboard.html` for the template they're based on). If your top pick was used in the last 2 runs, pick the second-best fit instead. Audience monotony kills engagement.
   - Common mappings: GA launch → `03_breaking_news`; AI/agents → `09_futuristic`; perf stats → `02_stat_card`; research/quote → `05_quote_card` or `06_paper_quote`; before/after → `04_before_after`; customer story → `10_newspaper`.
8. Read the chosen template HTML from `<SKILL_ROOT>/templates/visuals/<template_id>.html`. The skill bundles all 10 templates locally — no external dependency. (The legacy `Social_Media_Project/templates/visuals/` location was the original source; the bundled copy here is the canonical one going forward.)
9. Produce a fully filled `whiteboard.html` for the run folder by editing the template's text content in place. Replace placeholder strings (titles, stats, quotes, dates, source line) with values appropriate to the source item. **The byline area (lower-third in breaking_news, cyber-footer in futuristic, etc.) MUST contain the value from `config/author.json` (currently "Harish Mettu - Databricks Platform Engineer").** Don't break CSS or layout — only replace text content.
10. Write `media.spec.json` for the video render with: `duration_seconds: 16` (animations need a full cycle), `render_viewport: [1080, 1080]`, `inject_css` to hide template dev chrome (`.toolbar, .hint` plus any decorative elements that don't read as static — e.g., breaking_news's `.ticker-label` was hiding the scrolling text). Set `pad_color` for vertical to match the template's card background color.

**Render videos:**

11. Run `node ~/.claude/skills/databricks-pulse/scripts/render-video.mjs <run-folder>` — produces `square.mp4`, `vertical.mp4`, `linkedin.png` (frame at 3s), `cover.jpg` (frame at 1.5s).

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
- **Voice consistency.** LinkedIn = casual educator + emojis + English. Reel = brisk Hinglish + zero emojis. Never blend.
