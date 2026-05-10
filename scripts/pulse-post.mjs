#!/usr/bin/env node
// Post a databricks-pulse run to Instagram + LinkedIn via Composio MCP.
// Auto-detects mode by reading the run folder:
//   - If media.spec.json exists → VIDEO mode (IG Reel + LinkedIn frame-as-image)
//   - Else → IMAGE mode (static whiteboard.png for both)
//
// Composio's LinkedIn integration does not support video posts (only images),
// so in video mode LinkedIn gets the frame extracted at 3s of square.mp4.
//
// Usage:
//   node pulse-post.mjs <run-folder> [--dry-run]

import https from "node:https";
import http from "node:http";
import { readFileSync, statSync, existsSync, readdirSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ── Config (read from .env at the skill root) ─────────────────────────────────
// Loads ~/.claude/skills/databricks-pulse/.env if present. Required env vars:
//   COMPOSIO_API_KEY  — Composio MCP key
//   INSTAGRAM_UID     — Instagram Business account user ID
//   LINKEDIN_URN      — LinkedIn person URN (e.g. "urn:li:person:XXXX")
// Optional:
//   COMPOSIO_MCP_HOST (default: connect.composio.dev)
//   COMPOSIO_MCP_PATH (default: /mcp)
{
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = path.join(skillRoot, ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
}
const COMPOSIO_KEY = process.env.COMPOSIO_API_KEY;
const MCP_HOST = process.env.COMPOSIO_MCP_HOST || "connect.composio.dev";
const MCP_PATH = process.env.COMPOSIO_MCP_PATH || "/mcp";
const INSTAGRAM_UID = process.env.INSTAGRAM_UID;
const LINKEDIN_URN = process.env.LINKEDIN_URN;
for (const [k, v] of Object.entries({ COMPOSIO_API_KEY: COMPOSIO_KEY, INSTAGRAM_UID, LINKEDIN_URN })) {
  if (!v) {
    console.error(`Missing required env var: ${k}. Set it in ~/.claude/skills/databricks-pulse/.env or export it before running.`);
    process.exit(2);
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.error("Usage: node pulse-post.mjs [<run-folder>] [--auto-pick] [--dry-run] [--linkedin-only]");
  console.error("  <run-folder>   explicit run to publish");
  console.error("  --auto-pick    find latest unposted run automatically (uses state/published.json)");
  console.error("  --dry-run      everything except the actual publish");
  console.error("  --linkedin-only  skip Instagram steps");
  process.exit(2);
}
const DRY_RUN = args.includes("--dry-run");
const LINKEDIN_ONLY = args.includes("--linkedin-only");
const AUTO_PICK = args.includes("--auto-pick");

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS_DIR = path.join(SKILL_ROOT, "runs");
const STATE_FILE = path.join(SKILL_ROOT, "state", "published.json");
const LOGS_DIR = path.join(SKILL_ROOT, "logs");

function readPublishedState() {
  if (!existsSync(STATE_FILE)) return { last_published_run: null, history: [] };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function writePublishedState(state) {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function findLatestUnpostedRun() {
  if (!existsSync(RUNS_DIR)) throw new Error(`No runs directory: ${RUNS_DIR}`);
  const state = readPublishedState();
  const postedSet = new Set(state.history.map((h) => h.run));
  const candidates = readdirSync(RUNS_DIR)
    .filter((n) => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(n))
    .filter((n) => !postedSet.has(n))
    .sort()
    .reverse();
  // Require either video assets OR static whiteboard.
  for (const name of candidates) {
    const folder = path.join(RUNS_DIR, name);
    const hasVideo = existsSync(path.join(folder, "vertical.mp4")) && existsSync(path.join(folder, "linkedin.png"));
    const hasImage = existsSync(path.join(folder, "whiteboard.png"));
    const hasText = existsSync(path.join(folder, "linkedin.md")) && existsSync(path.join(folder, "instagram_caption.md"));
    if (hasText && (hasVideo || hasImage)) return folder;
  }
  return null;
}

let runFolder;
const explicitArg = args.find((a) => !a.startsWith("--"));
if (AUTO_PICK) {
  if (explicitArg) {
    console.error("Error: --auto-pick and explicit run folder are mutually exclusive.");
    process.exit(2);
  }
  const found = findLatestUnpostedRun();
  if (!found) {
    const ts = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const line = `[${ts}] auto-pick: no unposted runs found in ${RUNS_DIR}. Exiting cleanly.`;
    console.log(line);
    // Also tee to daily log so Task Scheduler runs are visible.
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
      const today = new Date().toISOString().slice(0, 10);
      appendFileSync(path.join(LOGS_DIR, `post-${today}.log`), line + "\n");
    } catch {}
    process.exit(0);
  }
  runFolder = found;
} else if (explicitArg) {
  runFolder = path.resolve(explicitArg);
} else {
  console.error("Error: provide a run folder, or use --auto-pick.");
  process.exit(2);
}

// ── Logging ────────────────────────────────────────────────────────────────────
function log(m) {
  const ts = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const line = `[${ts}] ${m}`;
  console.log(line);
  // In auto-pick mode, also tee to daily log file (for headless / Task Scheduler runs).
  if (AUTO_PICK) {
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      appendFileSync(path.join(LOGS_DIR, `post-${today}.log`), line + "\n");
    } catch {}
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function markRunPublished(folder, modeLabel, postIds) {
  const state = readPublishedState();
  const runName = path.basename(folder);
  state.last_published_run = runName;
  state.history.push({
    run: runName,
    posted_at: new Date().toISOString(),
    mode: modeLabel,
    ig_media_id: postIds.igMediaId || null,
    linkedin_post_id: postIds.liPostId || null,
  });
  writePublishedState(state);
  log(`  state updated: ${runName} → published.json`);
}

// ── Markdown parsers ───────────────────────────────────────────────────────────
// Strip frontmatter (leading blank lines, `# heading`, `**metadata**`, `---` divider)
// and return the rest as-is. Works for drafts written in either:
//   (a) day02_lakebase format with `# heading` + `**metadata**` + `---` then body
//   (b) "just write the body straight away" format
// For both LinkedIn and IG, the body+hashtags are returned as one string —
// LinkedIn API takes that as `commentary`; IG takes it as `caption`.
function stripFrontmatter(md) {
  const lines = md.trim().split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    // Frontmatter: blank, H1 (`# Foo`, with space — NOT `#Hashtag`), bold metadata, or `---`
    if (t === "" || t === "---" || /^#\s/.test(t) || /^\*\*/.test(t)) {
      i++;
    } else {
      break;
    }
  }
  return lines.slice(i).join("\n").trim();
}
function parseInstagram(md) {
  return stripFrontmatter(md);
}
function parseLinkedIn(md) {
  return stripFrontmatter(md);
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────
function httpsPost(host, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    const opts = { hostname: host, path: urlPath, method: "POST", headers: { ...headers, "Content-Length": buf.length } };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

// ── Composio MCP ──────────────────────────────────────────────────────────────
async function mcpCall(toolName, mcpArgs) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: toolName, arguments: mcpArgs } });
  const res = await httpsPost(MCP_HOST, MCP_PATH, {
    "x-consumer-api-key": COMPOSIO_KEY,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  }, body);
  const lines = res.body.trim().split("\n");
  for (const line of lines) {
    if (line.startsWith("data:")) {
      const json = JSON.parse(line.slice(6));
      const text = json?.result?.content?.[0]?.text;
      if (text) return JSON.parse(text);
    }
  }
  throw new Error(`MCP call ${toolName} returned no data. Body: ${res.body.slice(0, 500)}`);
}

// ── Uploads ────────────────────────────────────────────────────────────────────
async function uploadToCatbox(filePath) {
  const fwdPath = filePath.replace(/\\/g, "/");
  log(`Uploading ${path.basename(filePath)} to catbox.moe...`);
  const result = spawnSync(
    "curl",
    ["-sF", "reqtype=fileupload", "-F", `fileToUpload=@${fwdPath}`, "https://catbox.moe/user/api.php"],
    { timeout: 60000, encoding: "utf8" }
  );
  const url = (result.stdout || "").toString().trim();
  if (!url.startsWith("http")) throw new Error(`catbox upload failed: ${url || result.stderr}`);
  log(`  → ${url}`);
  return url;
}

async function uploadToComposioS3(filePath) {
  log(`Uploading ${path.basename(filePath)} to Composio S3 (LinkedIn s3key)...`);
  const b64 = readFileSync(filePath).toString("base64");
  const remoteName = `/home/user/${path.basename(filePath)}`;
  const code = `
import base64
img = base64.b64decode("""${b64}""")
with open('${remoteName}', 'wb') as f:
    f.write(img)
result, error = upload_local_file('${remoteName}')
if error:
    print('ERROR:', error)
else:
    print('S3KEY:', result.get('s3key',''))
`;
  const res = await mcpCall("COMPOSIO_REMOTE_WORKBENCH", {
    code_to_execute: code,
    thought: "Upload media file to S3 for LinkedIn post",
    current_step: "UPLOADING_IMAGE",
  });
  const stdout = res?.data?.results?.stdout || res?.data?.stdout || "";
  const match = stdout.match(/S3KEY:\s*(.+)/);
  if (!match) throw new Error(`S3 upload failed. stdout: ${stdout}`);
  log(`  → s3key: ${match[1].trim()}`);
  return match[1].trim();
}

// ── Instagram (image) ──────────────────────────────────────────────────────────
async function postInstagramImage(imageUrl, caption) {
  log("IG: creating image media container...");
  const containerRes = await mcpCall("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: [{ tool_slug: "INSTAGRAM_POST_IG_USER_MEDIA", arguments: { ig_user_id: INSTAGRAM_UID, image_url: imageUrl, caption } }],
    sync_response_to_workbench: false,
    thought: "Create IG image container",
    current_step: "CREATING_CONTAINER",
  });
  const creationId = containerRes?.data?.results?.[0]?.response?.data?.id;
  if (!creationId) throw new Error(`IG container failed: ${JSON.stringify(containerRes)}`);
  log(`  container ID: ${creationId}`);

  log("IG: publishing...");
  const publishRes = await mcpCall("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: [{ tool_slug: "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", arguments: { ig_user_id: INSTAGRAM_UID, creation_id: creationId } }],
    sync_response_to_workbench: false,
    thought: "Publish IG image",
    current_step: "PUBLISHING",
  });
  const mediaId = publishRes?.data?.results?.[0]?.response?.data?.id;
  if (!mediaId) throw new Error(`IG publish failed: ${JSON.stringify(publishRes)}`);
  log(`  IG image published ✓  media_id=${mediaId}`);
  return mediaId;
}

// ── Instagram (Reel video) ─────────────────────────────────────────────────────
async function postInstagramReel(videoUrl, coverUrl, caption) {
  log("IG: creating REELS media container...");
  const containerRes = await mcpCall("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: [
      {
        tool_slug: "INSTAGRAM_POST_IG_USER_MEDIA",
        arguments: {
          ig_user_id: INSTAGRAM_UID,
          media_type: "REELS",
          video_url: videoUrl,
          cover_url: coverUrl,
          share_to_feed: true,
          caption,
        },
      },
    ],
    sync_response_to_workbench: false,
    thought: "Create IG Reel container",
    current_step: "CREATING_REEL_CONTAINER",
  });
  const creationId = containerRes?.data?.results?.[0]?.response?.data?.id;
  if (!creationId) throw new Error(`IG Reel container failed: ${JSON.stringify(containerRes)}`);
  log(`  container ID: ${creationId}`);

  // Reels need processing time before publish. 10s is conservative for an 8s/<1MB video.
  log("IG: waiting 10s for video processing...");
  await sleep(10000);

  log("IG: publishing Reel...");
  const publishRes = await mcpCall("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: [{ tool_slug: "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", arguments: { ig_user_id: INSTAGRAM_UID, creation_id: creationId } }],
    sync_response_to_workbench: false,
    thought: "Publish IG Reel",
    current_step: "PUBLISHING_REEL",
  });
  const mediaId = publishRes?.data?.results?.[0]?.response?.data?.id;
  if (!mediaId) throw new Error(`IG Reel publish failed (may need longer processing wait): ${JSON.stringify(publishRes)}`);
  log(`  IG Reel published ✓  media_id=${mediaId}`);
  return mediaId;
}

// ── LinkedIn (image only — Composio doesn't support video) ────────────────────
async function postLinkedInImage(s3key, text) {
  log("LinkedIn: creating image post...");
  const res = await mcpCall("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: [
      {
        tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
        arguments: {
          author: LINKEDIN_URN,
          commentary: text,
          images: [{ name: "post_image.png", mimetype: "image/png", s3key }],
        },
      },
    ],
    sync_response_to_workbench: false,
    thought: "Create LinkedIn image post",
    current_step: "POSTING_LINKEDIN",
  });
  const result = res?.data?.results?.[0]?.response;
  if (!result?.successful) throw new Error(`LinkedIn post failed: ${JSON.stringify(res)}`);
  // Capture the post URN for future delete-ability.
  // Composio surfaces it as x_restli_id (LinkedIn's standard "x-restli-id" header field).
  const postId =
    result?.data?.x_restli_id ||
    result?.data?.id ||
    result?.data?.urn ||
    result?.data?.postUrn ||
    null;
  log(`  LinkedIn published ✓${postId ? `  post_urn=${postId}` : ""}`);
  if (!postId) log(`  (post URN not surfaced — full response: ${JSON.stringify(result?.data || {}).slice(0, 300)})`);
  return { result, postId };
}

// ── Mode dispatch ──────────────────────────────────────────────────────────────
async function runVideoMode() {
  log("MODE: video (IG Reel + LinkedIn frame)");
  const verticalMp4 = path.join(runFolder, "vertical.mp4");
  const coverJpg = path.join(runFolder, "cover.jpg");
  const linkedinPng = path.join(runFolder, "linkedin.png");
  for (const f of [verticalMp4, coverJpg, linkedinPng]) {
    if (!existsSync(f)) throw new Error(`Missing ${path.basename(f)} — run render-video.mjs first.`);
    log(`  ${path.basename(f)} (${Math.round(statSync(f).size / 1024)} KB)`);
  }

  const igCaption = parseInstagram(readFileSync(path.join(runFolder, "instagram_caption.md"), "utf8"));
  const liText = parseLinkedIn(readFileSync(path.join(runFolder, "linkedin.md"), "utf8"));
  log(`IG caption: ${igCaption.length} chars`);
  log(`LI body:    ${liText.length} chars`);

  if (DRY_RUN) {
    log("DRY-RUN: skipping uploads + publishes.");
    log("--- IG caption preview ---");
    console.log(igCaption.slice(0, 400));
    log("--- LI body preview ---");
    console.log(liText.slice(0, 400));
    return;
  }

  if (LINKEDIN_ONLY) {
    log("LINKEDIN-ONLY: skipping all Instagram steps.");
    const liS3key = await uploadToComposioS3(linkedinPng);
    const { postId: liPostId } = await postLinkedInImage(liS3key, liText);
    log("=== Pulse Post Complete (LinkedIn only) ===");
    markRunPublished(runFolder, "video-linkedin-only", { liPostId });
    return;
  }

  // Uploads in parallel (3 separate uploads).
  const [videoUrl, coverUrl, liS3key] = await Promise.all([
    uploadToCatbox(verticalMp4),
    uploadToCatbox(coverJpg),
    uploadToComposioS3(linkedinPng),
  ]);

  // Publish.
  const igMediaId = await postInstagramReel(videoUrl, coverUrl, igCaption);
  const { postId: liPostId } = await postLinkedInImage(liS3key, liText);

  log("=== Pulse Post Complete (video mode) ===");
  log(`  IG Reel media_id: ${igMediaId}`);
  log(`  LinkedIn:         published`);
  log(`  Reel video URL:   ${videoUrl}`);
  log(`  Reel cover URL:   ${coverUrl}`);
  markRunPublished(runFolder, "video", { igMediaId, liPostId });
}

async function runImageMode() {
  log("MODE: image (single whiteboard.png to both)");
  const pngFile = path.join(runFolder, "whiteboard.png");
  if (!existsSync(pngFile)) throw new Error(`Missing whiteboard.png — run render-images.mjs first.`);

  const igCaption = parseInstagram(readFileSync(path.join(runFolder, "instagram_caption.md"), "utf8"));
  const liText = parseLinkedIn(readFileSync(path.join(runFolder, "linkedin.md"), "utf8"));
  log(`IG caption: ${igCaption.length} chars`);
  log(`LI body:    ${liText.length} chars`);
  log(`Image:      ${pngFile} (${Math.round(statSync(pngFile).size / 1024)} KB)`);

  if (DRY_RUN) {
    log("DRY-RUN: skipping uploads + publishes.");
    log("--- IG caption preview ---");
    console.log(igCaption.slice(0, 400));
    log("--- LI body preview ---");
    console.log(liText.slice(0, 400));
    return;
  }

  const [imageUrl, s3key] = await Promise.all([uploadToCatbox(pngFile), uploadToComposioS3(pngFile)]);
  const igMediaId = await postInstagramImage(imageUrl, igCaption);
  const { postId: liPostId } = await postLinkedInImage(s3key, liText);

  log("=== Pulse Post Complete (image mode) ===");
  log(`  IG media_id: ${igMediaId}`);
  log(`  LinkedIn:    published`);
  markRunPublished(runFolder, "image", { igMediaId, liPostId });
}

async function main() {
  log(`=== Pulse Post Starting ===`);
  log(`Run folder: ${runFolder}`);
  if (DRY_RUN) log("DRY RUN: no actual publishes.");

  const isVideo = existsSync(path.join(runFolder, "media.spec.json"));
  if (isVideo) await runVideoMode();
  else await runImageMode();
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
