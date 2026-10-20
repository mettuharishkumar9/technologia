#!/usr/bin/env node
// Post a databricks-pulse run to LinkedIn via the Composio CLI.
// LinkedIn-only — Instagram posting removed.
//
// Media: if the run has an Insurance Lens carousel (carousel/manifest.json written by
// render-carousel.mjs, 2–20 PNGs) it is published as a LinkedIn multi-image post;
// otherwise the single linkedin.png / whiteboard.png is used.
//
// Usage:
//   node pulse-post.mjs [<run-folder>] [--auto-pick] [--dry-run] [--max-age-hours 36]
//     <run-folder>       explicit run to publish
//     --auto-pick        publish the newest unposted run that is younger than --max-age-hours;
//                        older unposted runs are recorded as skipped in state/published.json
//                        so a backlog is never drained one post at a time
//     --dry-run          everything except the actual publish (and no state writes)
//     --max-age-hours N  freshness window for --auto-pick (default 36)

import { readFileSync, statSync, existsSync, readdirSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ── Config (read from .env at the skill root) ─────────────────────────────────
{
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = path.join(skillRoot, ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
}
const LINKEDIN_URN = process.env.LINKEDIN_URN;
const COMPOSIO_BIN = process.env.COMPOSIO_BIN || path.join(os.homedir(), ".composio", "composio");
if (!LINKEDIN_URN) {
  console.error("Missing required env var: LINKEDIN_URN. Set it in ~/.claude/skills/databricks-pulse/.env");
  process.exit(2);
}
if (!existsSync(COMPOSIO_BIN)) {
  console.error(`Composio CLI not found at ${COMPOSIO_BIN}. Install via: curl -fsSL https://composio.dev/install | bash`);
  process.exit(2);
}

// ── CLI ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.error("Usage: node pulse-post.mjs [<run-folder>] [--auto-pick] [--dry-run] [--max-age-hours 36]");
  process.exit(2);
}
const DRY_RUN = args.includes("--dry-run");
const AUTO_PICK = args.includes("--auto-pick");
let MAX_AGE_HOURS = 36;
{
  const i = args.indexOf("--max-age-hours");
  if (i >= 0) {
    MAX_AGE_HOURS = parseFloat(args[i + 1]);
    if (!(MAX_AGE_HOURS > 0)) {
      console.error("Error: --max-age-hours needs a positive number.");
      process.exit(2);
    }
    args.splice(i, 2); // remove flag + value so it is not mistaken for the run folder
  }
}

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

// Run folders are named YYYY-MM-DD-HHMM in IST (see now-ist.mjs).
function runFolderTime(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(name);
  if (!m) return null;
  const [y, mo, d, hh, mm] = m.slice(1).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hh - 5, mm - 30)); // IST → UTC
}

function hasPostableMedia(folder) {
  return (
    existsSync(path.join(folder, "carousel", "manifest.json")) ||
    existsSync(path.join(folder, "linkedin.png")) ||
    existsSync(path.join(folder, "whiteboard.png"))
  );
}

// Newest unposted run within the freshness window. Older unposted runs are recorded as
// skipped (unless --dry-run) so they are never considered again.
function findLatestUnpostedRun() {
  if (!existsSync(RUNS_DIR)) throw new Error(`No runs directory: ${RUNS_DIR}`);
  const state = readPublishedState();
  const seen = new Set(state.history.map((h) => h.run).filter(Boolean));
  const candidates = readdirSync(RUNS_DIR)
    .filter((n) => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(n))
    .filter((n) => !seen.has(n))
    .sort()
    .reverse();
  const now = Date.now();
  const maxAgeMs = MAX_AGE_HOURS * 3600 * 1000;
  let pick = null;
  const stale = [];
  for (const name of candidates) {
    const t = runFolderTime(name);
    const ageMs = t ? now - t.getTime() : Infinity;
    if (ageMs > maxAgeMs) {
      stale.push(name);
      continue;
    }
    const folder = path.join(RUNS_DIR, name);
    if (!pick && existsSync(path.join(folder, "linkedin.md")) && hasPostableMedia(folder)) pick = folder;
  }
  if (stale.length && !DRY_RUN) {
    const ts = new Date().toISOString();
    for (const name of stale) {
      state.history.push({ run: name, skipped_at: ts, reason: `older than ${MAX_AGE_HOURS}h at auto-pick` });
    }
    writePublishedState(state);
  }
  return { pick, staleCount: stale.length };
}

let runFolder;
const explicitArg = args.find((a) => !a.startsWith("--"));
if (AUTO_PICK) {
  if (explicitArg) {
    console.error("Error: --auto-pick and explicit run folder are mutually exclusive.");
    process.exit(2);
  }
  const { pick: found, staleCount } = findLatestUnpostedRun();
  if (staleCount) {
    console.log(`auto-pick: ${staleCount} unposted run(s) older than ${MAX_AGE_HOURS}h ${DRY_RUN ? "would be" : "were"} marked skipped in published.json`);
  }
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

// ── Composio CLI shell-out ────────────────────────────────────────────────────
function composioExecute(slug, data) {
  const proc = spawnSync(COMPOSIO_BIN, ["execute", slug, "-d", JSON.stringify(data)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(`composio execute ${slug} failed (exit ${proc.status}): ${proc.stderr || proc.stdout}`);
  }
  const jsonStart = proc.stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`composio execute ${slug}: no JSON in stdout: ${proc.stdout.slice(0, 400)}`);
  return JSON.parse(proc.stdout.slice(jsonStart));
}

// ── Image selection ───────────────────────────────────────────────────────────
// Prefer the Insurance Lens carousel (carousel/manifest.json from render-carousel.mjs →
// LinkedIn multi-image post, 2–20 images). Fall back to the single linkedin.png / whiteboard.png.
function pickImages(folder) {
  const manifestPath = path.join(folder, "carousel", "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const files = (manifest.slides || []).map((rel) => path.join(folder, rel)).filter((f) => existsSync(f));
    if (files.length > 20) throw new Error(`carousel has ${files.length} slides; LinkedIn allows at most 20 images per post`);
    if (files.length >= 2) return files;
    log(`  carousel manifest found but only ${files.length} usable PNG(s) — falling back to a single image`);
  }
  for (const name of ["linkedin.png", "whiteboard.png"]) {
    const f = path.join(folder, name);
    if (existsSync(f)) return [f];
  }
  throw new Error(`No carousel/manifest.json, linkedin.png or whiteboard.png in ${folder}`);
}

async function postLinkedIn(imageFiles, text) {
  log(`LinkedIn: creating ${imageFiles.length > 1 ? `multi-image post (${imageFiles.length} images)` : "post"}...`);
  const res = composioExecute("LINKEDIN_CREATE_LINKED_IN_POST", {
    author: LINKEDIN_URN,
    commentary: text,
    images: imageFiles,
  });
  if (!res?.successful) throw new Error(`LinkedIn post failed: ${JSON.stringify(res).slice(0, 500)}`);
  const postId =
    res?.data?.x_restli_id ||
    res?.data?.id ||
    res?.data?.urn ||
    res?.data?.postUrn ||
    null;
  log(`  LinkedIn published ✓${postId ? `  post_urn=${postId}` : ""}`);
  if (!postId) log(`  (post URN not surfaced — full response: ${JSON.stringify(res?.data || {}).slice(0, 300)})`);
  return postId;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  log(`=== Pulse Post Starting ===`);
  log(`Run folder: ${runFolder}`);
  if (DRY_RUN) log("DRY RUN: no actual publish.");

  const imageFiles = pickImages(runFolder);

  const liText = stripFrontmatter(readFileSync(path.join(runFolder, "linkedin.md"), "utf8"));
  if (liText.length > 3000) {
    throw new Error(`LinkedIn caption is ${liText.length} chars; the limit is 3,000. Shorten linkedin.md.`);
  }
  log(`LI body: ${liText.length} chars`);
  const totalKb = Math.round(imageFiles.reduce((s, f) => s + statSync(f).size, 0) / 1024);
  log(`Images:  ${imageFiles.length} file(s), ${totalKb} KB — ${imageFiles.map((f) => path.basename(f)).join(", ")}`);

  if (DRY_RUN) {
    log("DRY-RUN preview (first 400 chars of body):");
    console.log(liText.slice(0, 400));
    return;
  }

  const liPostId = await postLinkedIn(imageFiles, liText);

  log("=== Pulse Post Complete ===");
  markRunPublished(runFolder, { liPostId });
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
