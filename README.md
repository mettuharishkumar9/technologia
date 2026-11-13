# databricks-pulse

A content-intelligence skill that scans Databricks-owned content (blog, release notes, community), ranks the top 3 items by engagement / recency / topic-match, drafts LinkedIn long-form + Instagram Reel scripts in a defined voice, picks a fitting visual template, renders 1080×1080 + 1080×1920 MP4s, and auto-posts to LinkedIn (and Instagram once Composio IG auth is reconnected).

Designed to run on either:
- **Local Windows**: scripts execute via Task Scheduler with the PowerShell wrapper
- **Linux VM** (e.g., AWS Lightsail Ubuntu): scripts execute via `cron` with the bash wrapper

## Layout

```
.
├── SKILL.md                          # Procedural instructions Claude follows when /databricks-pulse fires
├── README.md                         # this file
├── package.json                      # Node deps (Playwright)
├── .env.example                      # Template — copy to .env and fill
├── .gitignore                        # Excludes secrets, runs/, state/, logs/, node_modules/, bin/
├── config/
│   ├── taxonomy.json                 # Keyword list for topic-match scoring
│   ├── voice_linkedin.md             # LinkedIn voice spec (10–14 hashtags required)
│   ├── voice_instagram.md            # Reel voice spec (Hinglish, no emojis)
│   ├── author.json                   # Author byline ("Harish Mettu - Databricks Platform Engineer")
│   └── templates_catalog.json        # Visual template selection guide
├── scripts/
│   ├── community-fetch.mjs           # Khoros community scraper (browser User-Agent)
│   ├── now-ist.mjs                   # IST timestamp helper (works around broken tzdata)
│   ├── render-images.mjs             # Static whiteboard.png renderer (legacy fallback)
│   ├── render-video.mjs              # Playwright + ffmpeg → square.mp4, vertical.mp4, frames
│   ├── render-card.mjs               # card.html → post.png (+ post.gif/mp4 for animated cards) — the LinkedIn image
│   ├── pulse-post.mjs                # Auto-pick (freshness window) + publish to LinkedIn via Composio CLI
│   ├── post-notify.mjs               # Cron entry point: auto-pick post + status email (Gmail via Composio)
│   ├── pulse-delete.mjs              # Delete a previously published LinkedIn post by URN
│   ├── scheduled-scan.sh             # Linux wrapper for `claude -p /databricks-pulse`
│   └── scheduled-scan.ps1            # Windows equivalent
├── templates/cards/                  # 12 LinkedIn card templates (c01–c12) + _previews/ — see templates/cards/README.md
├── templates/visuals/                # 10 bundled HTML visual templates (Reel video)
├── state/                            # Persistent state (gitignored)
│   ├── seen.json                     # Items already scanned/drafted
│   └── published.json                # What was last posted
├── runs/                             # Per-scan output folders (gitignored)
└── logs/                             # Daily logs (gitignored)
```

## Setup (Linux VM)

```bash
# 1. Clone (skill must live at ~/.claude/skills/databricks-pulse for claude CLI to discover it)
mkdir -p ~/.claude/skills
git clone https://github.com/mettuharishkumar9/technologia.git ~/.claude/skills/databricks-pulse

# 2. Provision the VM (one-time)
sudo bash ~/.claude/skills/databricks-pulse/scripts/provision.sh

# 3. Copy env template + fill in real values
cd ~/.claude/skills/databricks-pulse
cp .env.example .env
nano .env   # fill: COMPOSIO_API_KEY, INSTAGRAM_UID, LINKEDIN_URN, ANTHROPIC_API_KEY, TEMPLATES_DIR

# 4. Install deps
npm install
npx playwright install --with-deps chromium

# 5. Install claude CLI
npm install -g @anthropic-ai/claude-code

# 6. Set up cron (system TZ should be Asia/Kolkata — provision.sh handles this)
crontab -e
```

Add these cron entries (one post per day, box TZ = Asia/Kolkata; each scan runs 33 min before its post):
```
# Mon 09:00 · Tue 10:00 · Wed 11:00 · Thu 09:30 · Fri 10:30 · Sat 11:30 · Sun 10:00 IST
27 8  * * 1 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
0  9  * * 1 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
27 9  * * 2 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
0  10 * * 2 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
27 10 * * 3 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
0  11 * * 3 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
57 8  * * 4 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
30 9  * * 4 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
57 9  * * 5 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
30 10 * * 5 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
57 10 * * 6 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
30 11 * * 6 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
27 9  * * 0 /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
0  10 * * 0 cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/post-notify.mjs >> logs/cron-post.log 2>&1
```

`post-notify.mjs` runs `pulse-post.mjs --auto-pick` and emails the result (✅ posted with link / ❌ failed with log tail / ⏸ paused) via Composio `GMAIL_SEND_EMAIL` to `email_to` in `state/notify.json`. Needs `composio link gmail` once. Test with `node scripts/post-notify.mjs --test-email`.

`--auto-pick` only considers runs younger than 36 hours (`--max-age-hours` to change). Older unposted runs are recorded as skipped in `state/published.json`, so an outage never turns into a backlog being drained one stale post at a time.

The Composio CLI login (`composio login`) is what authenticates posting. If `logs/post-*.log` shows `HTTP 401 Unauthorized`, re-run `composio upgrade`, `composio logout`, `composio login --no-browser` on the box, then `composio whoami`.

## Manual invocation

```bash
# Generate a fresh run (scan + draft + render)
claude -p "/databricks-pulse"

# Publish the newest unposted run
node scripts/pulse-post.mjs --auto-pick

# Publish a specific run folder
node scripts/pulse-post.mjs runs/2026-10-15-0832

# Dry run (parses caption, lists images, no publish, no state writes)
node scripts/pulse-post.mjs --auto-pick --dry-run

# Delete a posted item by URN
node scripts/pulse-delete.mjs urn:li:share:1234567890
```

## Costs

- AWS Lightsail (2 GB instance): $10/mo
- Anthropic API (2 scans/day, ~$0.10 each): ~$6/mo
- **Total**: ~$16/month for fully autonomous daily content generation + posting

## Open items

- Instagram Reels publishing was removed from `pulse-post.mjs` (LinkedIn-only). Reel scripts and MP4s are still generated for manual posting.
