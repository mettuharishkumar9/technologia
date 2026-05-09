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
│   ├── pulse-post.mjs                # Auto-pick + publish to LinkedIn (Composio MCP)
│   ├── pulse-delete.mjs              # Delete a previously published LinkedIn post by URN
│   ├── scheduled-scan.sh             # Linux wrapper for `claude -p /databricks-pulse`
│   └── scheduled-scan.ps1            # Windows equivalent
├── templates/visuals/                # 10 bundled HTML visual templates
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

Add these 4 cron entries:
```
32 8  * * * /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
5  9  * * * cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/pulse-post.mjs --auto-pick --linkedin-only
32 20 * * * /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
5  21 * * * cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/pulse-post.mjs --auto-pick --linkedin-only
```

## Manual invocation

```bash
# Generate a fresh run (scan + draft + render)
claude -p "/databricks-pulse"

# Publish the latest unposted run
node scripts/pulse-post.mjs --auto-pick --linkedin-only

# Publish a specific run folder
node scripts/pulse-post.mjs runs/2026-05-09-2057 --linkedin-only

# Dry run (uploads + parses but skips actual publish)
node scripts/pulse-post.mjs --auto-pick --linkedin-only --dry-run

# Delete a posted item by URN
node scripts/pulse-delete.mjs urn:li:share:1234567890
```

## Costs

- AWS Lightsail (2 GB instance): $10/mo
- Anthropic API (2 scans/day, ~$0.10 each): ~$6/mo
- **Total**: ~$16/month for fully autonomous daily content generation + posting

## Open items

- Instagram Reels publishing is gated on re-authenticating the Composio Instagram connection. Until then, all `pulse-post.mjs` invocations use `--linkedin-only`.
- After IG re-auth: edit the cron entries to remove `--linkedin-only` and the Reels will publish too.
