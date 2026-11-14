#!/usr/bin/env node
// "Post when news breaks" — cheap freshness check, no Claude call unless there's news.
//
//   node scripts/fresh-check.mjs [--dry-run] [--seed]
//
// Cron runs this every 2 hours, 08:00–20:00 IST. Each run:
//   1. Fetches the Databricks release notes (current month, plus last month in the first 5 days)
//      and parses every entry (anchor URL, title, date, status label). No LLM.
//   2. New = not seen by this checker before and not already drafted (state/seen.json).
//   3. Trigger = a new entry labelled GA / Public Preview / Beta (or "now available").
//   4. On a trigger, and only if fewer than MAX_POSTS_PER_DAY posts went out today (IST):
//      runs scripts/scheduled-scan.sh (full /databricks-pulse draft) and then
//      scripts/post-notify.mjs (auto-pick post + status email) when the scan produced a new run.
//   5. Fallback: at the 20:00 check, if nothing was posted today, it scans anyway (the scan's
//      7/14-day window picks the freshest unposted item) and always emails the outcome.
// --seed marks everything currently listed as seen without scanning (used once at install).
// --dry-run reports what it would do; no scan, no post, no state writes.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE = path.join(SKILL_ROOT, "state");
const CHECK_STATE = path.join(STATE, "fresh-check.json");
const LOCK = path.join(STATE, "fresh-check.lock");
const MAX_POSTS_PER_DAY = 2;
const FALLBACK_HOUR = 20; // IST
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SEED = args.includes("--seed");

const ist = (d = new Date()) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const istDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const log = (m) => console.log(`[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] ${m}`);
const readJson = (p, fb) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function monthPages() {
  const now = ist();
  const pages = [[now.getFullYear(), now.getMonth()]];
  if (now.getDate() <= 5) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    pages.push([prev.getFullYear(), prev.getMonth()]);
  }
  return pages.map(([y, m]) => `https://docs.databricks.com/aws/en/release-notes/product/${y}/${MONTHS[m]}.html`);
}

const strip = (h) =>
  h.replace(/<!--.*?-->/g, "").replace(/<a [^>]*class=hash-link[\s\S]*?<\/a>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

function statusOf(text) {
  if (/generally available|\bGA\b/i.test(text)) return "GA";
  if (/public preview/i.test(text)) return "Public Preview";
  if (/\bbeta\b/i.test(text)) return "Beta";
  if (/private preview/i.test(text)) return "Private Preview";
  if (/now available|is available/i.test(text)) return "available";
  return "none";
}

async function fetchEntries() {
  const entries = [];
  for (const url of monthPages()) {
    const res = await fetch(url, { headers: { "user-agent": "databricks-pulse-fresh-check/1.0" } });
    if (!res.ok) {
      log(`fetch ${url}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const re = /<h2[^>]*\sid="?([a-z0-9-]+)"?[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*\sid=|<\/article>|$)/g;
    let m;
    while ((m = re.exec(html))) {
      const [, anchor, titleHtml, bodyHtml] = m;
      const title = strip(titleHtml);
      const body = strip(bodyHtml).slice(0, 600);
      const date = (body.match(/^([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1];
      if (!date) continue; // not a dated entry (page intro etc.)
      entries.push({ url: `${url}#${anchor}`, title, date, status: statusOf(`${title} ${body.slice(0, 200)}`) });
    }
  }
  return entries;
}

function postsToday() {
  const pub = readJson(path.join(STATE, "published.json"), {});
  const list = pub.history || Object.values(pub).find(Array.isArray) || [];
  const today = istDate();
  return list.filter((r) => r.posted_at && r.linkedin_post_id && istDate(new Date(r.posted_at)) === today).length;
}

function newestRun() {
  const dir = path.join(SKILL_ROOT, "runs");
  if (!existsSync(dir)) return null;
  return readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(d)).sort().pop() || null;
}

function run(cmd, argv, timeoutMin) {
  const r = spawnSync(cmd, argv, { cwd: SKILL_ROOT, encoding: "utf8", timeout: timeoutMin * 60 * 1000 });
  process.stdout.write(`${r.stdout || ""}${r.stderr || ""}`);
  return r.status;
}

// ── main ──
if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < 90 * 60 * 1000) {
  log("another check/scan is still running — skipping");
  process.exit(0);
}

const state = readJson(CHECK_STATE, { seen: {} });
const drafted = readJson(path.join(STATE, "seen.json"), { items: {} }).items || {};
let entries;
try {
  entries = await fetchEntries();
} catch (e) {
  log(`fetch failed: ${e.message}`);
  entries = [];
}
const fresh = entries.filter((e) => !state.seen[e.url] && !drafted[e.url]?.drafted_at);
const triggers = fresh.filter((e) => ["GA", "Public Preview", "Beta", "available"].includes(e.status));
const posted = postsToday();
const hour = ist().getHours();
const fallback = hour >= FALLBACK_HOUR && posted === 0;

log(`release-note entries: ${entries.length}, new: ${fresh.length}, triggers: ${triggers.length}, posted today: ${posted}/${MAX_POSTS_PER_DAY}${fallback ? ", end-of-day fallback" : ""}`);
for (const t of triggers) log(`  trigger: [${t.status}] ${t.title} (${t.date})`);

const markSeen = (list) => {
  const now = new Date().toISOString();
  for (const e of list) state.seen[e.url] = { title: e.title, date: e.date, status: e.status, first_seen: now };
  if (!DRY_RUN) {
    mkdirSync(STATE, { recursive: true });
    writeFileSync(CHECK_STATE, JSON.stringify(state, null, 2));
  }
};

if (SEED) {
  markSeen(entries);
  log(`seeded ${entries.length} entries as seen`);
  process.exit(0);
}

if (posted >= MAX_POSTS_PER_DAY) {
  log("daily cap reached — leaving new items for tomorrow");
  process.exit(0);
}

if (!triggers.length && !fallback) {
  markSeen(fresh.filter((e) => !triggers.includes(e))); // unlabelled entries never trigger later
  log("nothing new worth a post");
  process.exit(0);
}

if (DRY_RUN) {
  log(`DRY RUN: would scan${fallback && !triggers.length ? " (fallback)" : ""} and post`);
  process.exit(0);
}

writeFileSync(LOCK, String(process.pid));
try {
  markSeen(fresh);
  const before = newestRun();
  log(`running full scan (${triggers.length ? "news" : "fallback"})...`);
  const scanExit = run("bash", [path.join(SKILL_ROOT, "scripts", "scheduled-scan.sh")], 45);
  const after = newestRun();
  log(`scan finished (exit ${scanExit}), newest run ${after}${after === before ? " (no new draft)" : ""}`);
  if (after !== before || fallback) {
    run(process.execPath, [path.join(SKILL_ROOT, "scripts", "post-notify.mjs")], 15);
  } else {
    log("no new draft (out of scope / slow day) — nothing to post, no email");
  }
} finally {
  try {
    unlinkSync(LOCK);
  } catch {}
}
