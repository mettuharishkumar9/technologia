# databricks-pulse

A content-intelligence skill that scans Databricks-owned content (blog, release notes, community), ranks the top 3 items by engagement / recency / topic-match, and turns the #1 into the daily **Insurance Lens** post: a real, documented insurance situation (named catastrophe, regulatory deadline, fraud study, public case study — with the regulator's numbers, every one linked) mapped onto the feature. Outputs a plain-English LinkedIn caption, a 13-slide "Front Page" carousel (rendered to PNGs and published as a LinkedIn multi-image post via the Composio CLI), an Instagram Reel script (feature-first Hinglish, unchanged by the lens), and 1080×1080 + 1080×1920 MP4s.

Content rules live in `config/voice_linkedin.md` and `config/industry_lens.md` (verified situation bank, research rules, `carousel.json` schema). Visual spec for the carousel: Style 25 "Front Page" in `databricks-linkedin-series/carousels/_catalog/STYLES.md`.

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
│   ├── voice_linkedin.md             # Insurance Lens caption rules (real situation → feature; ≤2,800 chars; 10–14 hashtags)
│   ├── industry_lens.md              # Verified situation bank + research rules + feature→workflow map + carousel.json schema
│   ├── voice_instagram.md            # Reel voice spec (Hinglish, no emojis) — unchanged by the lens
│   ├── author.json                   # Author byline ("Harish Mettu - Databricks Platform Engineer")
│   └── templates_catalog.json        # Visual template selection guide
├── scripts/
│   ├── community-fetch.mjs           # Khoros community scraper (browser User-Agent)
│   ├── now-ist.mjs                   # IST timestamp helper (works around broken tzdata)
│   ├── render-images.mjs             # Static whiteboard.png renderer (legacy fallback)
│   ├── render-video.mjs              # Playwright + ffmpeg → square.mp4, vertical.mp4, frames
│   ├── build-carousel.mjs            # carousel.json → carousel.html (fills the Style 25 template)
│   ├── render-carousel.mjs           # Playwright: carousel.html?slide=N → carousel/slide-NN.png + manifest.json
│   ├── pulse-post.mjs                # Auto-pick (freshness window) + publish to LinkedIn via Composio CLI (multi-image when a carousel exists)
│   ├── pulse-delete.mjs              # Delete a previously published LinkedIn post by URN
│   ├── scheduled-scan.sh             # Linux wrapper for `claude -p /databricks-pulse`
│   └── scheduled-scan.ps1            # Windows equivalent
├── templates/visuals/                # 10 bundled HTML visual templates (video whiteboard)
├── templates/carousel/               # Style 25 "Front Page" 13-slide carousel template (front-page.html)
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
5  9  * * * cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/pulse-post.mjs --auto-pick >> logs/cron-post.log 2>&1
32 20 * * * /home/ubuntu/.claude/skills/databricks-pulse/scripts/scheduled-scan.sh
5  21 * * * cd /home/ubuntu/.claude/skills/databricks-pulse && /usr/bin/node scripts/pulse-post.mjs --auto-pick >> logs/cron-post.log 2>&1
```

`--auto-pick` only considers runs younger than 36 hours (`--max-age-hours` to change). Older unposted runs are recorded as skipped in `state/published.json`, so an outage never turns into a backlog being drained one stale post at a time.

The Composio CLI login (`composio login`) is what authenticates posting. If `logs/post-*.log` shows `HTTP 401 Unauthorized`, re-run `composio upgrade`, `composio logout`, `composio login --no-browser` on the box, then `composio whoami`.

## Manual invocation

```bash
# Generate a fresh run (scan + research + draft + carousel + video)
claude -p "/databricks-pulse"

# Rebuild + re-render the carousel for a run after editing carousel.json
node scripts/build-carousel.mjs runs/2026-10-15-0832
node scripts/render-carousel.mjs runs/2026-10-15-0832

# Publish the newest unposted run (multi-image if carousel/manifest.json exists)
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
- A true PDF "document" carousel is not possible through Composio's LinkedIn toolkit (images and video only). The carousel is published as a multi-image post (2–20 images). Switching to PDF would need a LinkedIn developer app and the Documents API.
