#!/usr/bin/env node
// Post a databricks-pulse run to LinkedIn via Composio MCP.
// LinkedIn-only — Instagram posting removed.
//
// Usage:
//   node pulse-post.mjs [<run-folder>] [--auto-pick] [--dry-run]
//     <run-folder>   explicit run to publish
//     --auto-pick    find latest unposted run automatically (uses state/published.json)
//     --dry-run      everything except the actual publish

import https from "node:https";
import { readFileSync, statSync, existsSync, readdirSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ── Config (read from .env at the skill root) ─────────────────────────────────
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
const LINKEDIN_URN = process.env.LINKEDIN_URN;
for (const [k, v] of Object.entries({ COMPOSIO_API_KEY: COMPOSIO_KEY, LINKEDIN_URN })) {
  if (!v) {
    console.error(`Missing required env var: ${k}. Set it in ~/.claude/skills/databricks-pulse/.env`);
    process.exit(2);
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.error("Usage: node pulse-post.mjs [<run-folder>] [--auto-pick] [--dry-run]");
  process.exit(2);
}
const DRY_RUN = args.includes("--dry-run");
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
  const postedSet = new Set(state.history.map((h) => h.run).filter(Boolean));
  const candidates = readdirSync(RUNS_DIR)
    .filter((n) => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(n))
    .filter((n) => !postedSet.has(n))
    .sort()
    .reverse();
  for (const name of candidates) {
    const folder = path.join(RUNS_DIR, name);
    const hasText = existsSync(path.join(folder, "linkedin.md"));
    const hasImage =
      existsSync(path.join(folder, "linkedin.png")) || existsSync(path.join(folder, "whiteboard.png"));
    if (hasText && hasImage) return folder;
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
  if (AUTO_PICK) {
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
      const today = new Date().toISOString().slice(0, 10);
      appendFileSync(path.join(LOGS_DIR, `post-${today}.log`), line + "\n");
    } catch {}
  }
}

function markRunPublished(folder, postIds) {
  const state = readPublishedState();
  const runName = path.basename(folder);
  state.last_published_run = runName;
  state.history.push({
    run: runName,
    posted_at: new Date().toISOString(),
    linkedin_post_id: postIds.liPostId || null,
  });
  writePublishedState(state);
  log(`  state updated: ${runName} → published.json`);
}

// ── Markdown parser (strips frontmatter, returns body+hashtags) ───────────────
function stripFrontmatter(md) {
  const lines = md.trim().split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "" || t === "---" || /^#\s/.test(t) || /^\*\*/.test(t)) i++;
    else break;
  }
  return lines.slice(i).join("\n").trim();
}

// ── HTTP + Composio MCP ───────────────────────────────────────────────────────
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

// ── Upload + Post ──────────────────────────────────────────────────────────────
async function uploadToComposioS3(filePath) {
  log(`Uploading ${path.basename(filePath)} to Composio S3...`);
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
    thought: "Upload image to S3 for LinkedIn post",
    current_step: "UPLOADING_IMAGE",
  });
  const stdout = res?.data?.results?.stdout || res?.data?.stdout || "";
  const match = stdout.match(/S3KEY:\s*(.+)/);
  if (!match) throw new Error(`S3 upload failed. stdout: ${stdout}`);
  log(`  → s3key: ${match[1].trim()}`);
  return match[1].trim();
}

async function postLinkedIn(s3key, text) {
  log("LinkedIn: creating post...");
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
    thought: "Create LinkedIn post with image",
    current_step: "POSTING_LINKEDIN",
  });
  const result = res?.data?.results?.[0]?.response;
  if (!result?.successful) throw new Error(`LinkedIn post failed: ${JSON.stringify(res)}`);
  const postId =
    result?.data?.x_restli_id ||
    result?.data?.id ||
    result?.data?.urn ||
    result?.data?.postUrn ||
    null;
  log(`  LinkedIn published ✓${postId ? `  post_urn=${postId}` : ""}`);
  if (!postId) log(`  (post URN not surfaced — full response: ${JSON.stringify(result?.data || {}).slice(0, 300)})`);
  return postId;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  log(`=== Pulse Post Starting ===`);
  log(`Run folder: ${runFolder}`);
  if (DRY_RUN) log("DRY RUN: no actual publish.");

  // Pick the LinkedIn image — prefer linkedin.png (frame from video), fall back to whiteboard.png.
  let imageFile = path.join(runFolder, "linkedin.png");
  if (!existsSync(imageFile)) imageFile = path.join(runFolder, "whiteboard.png");
  if (!existsSync(imageFile)) throw new Error(`No linkedin.png or whiteboard.png in ${runFolder}`);

  const liText = stripFrontmatter(readFileSync(path.join(runFolder, "linkedin.md"), "utf8"));
  log(`LI body: ${liText.length} chars`);
  log(`Image:   ${imageFile} (${Math.round(statSync(imageFile).size / 1024)} KB)`);

  if (DRY_RUN) {
    log("DRY-RUN preview (first 400 chars of body):");
    console.log(liText.slice(0, 400));
    return;
  }

  const s3key = await uploadToComposioS3(imageFile);
  const liPostId = await postLinkedIn(s3key, liText);

  log("=== Pulse Post Complete ===");
  markRunPublished(runFolder, { liPostId });
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
