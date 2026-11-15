#!/usr/bin/env node
// 2-hourly ranked check — same ranking as the /databricks-pulse scan, without a Claude call.
//
//   node scripts/fresh-check.mjs [--dry-run]
//
// Cron runs this every 2 hours, 08:00–20:00 IST. Each run:
//   1. Pulls the same three sources as SKILL.md Step 1: blog RSS, release notes (this month and,
//      in the first 14 days, last month) and community threads (community-fetch.mjs).
//   2. Same dedupe + window as Steps 2/2b: drops anything already drafted (state/seen.json),
//      anything older than 14 days, and out-of-scope items (taxonomy.json negative_signals).
//   3. Same score as Step 3: 0.4 × engagement + 0.35 × recency + 0.25 × topic match
//      (recency buckets extended to 0.25 < 7 d and 0.15 < 14 d for the widened window).
//   4. Posts the #1 if: score ≥ MIN_SCORE, fewer than MAX_POSTS_PER_DAY posts today (IST) and
//      at least MIN_GAP_HOURS since the last post. It writes state/next_pick.json so the scan
//      drafts exactly this item (SKILL.md Step 3), runs scheduled-scan.sh, then post-notify.mjs
//      (auto-pick post + status email).
// --dry-run prints the ranking and the decision; no scan, no post, no state writes.

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE = path.join(SKILL_ROOT, "state");
const LOCK = path.join(STATE, "fresh-check.lock");
const PICK_FILE = path.join(STATE, "next_pick.json");
const MAX_POSTS_PER_DAY = 2;
const MIN_GAP_HOURS = 4;
const MIN_SCORE = 0.5;
const WINDOW_DAYS = 14;
const DRY_RUN = process.argv.includes("--dry-run");

const istDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const log = (m) => console.log(`[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] ${m}`);
const readJson = (p, fb) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
};
const strip = (h) =>
  h.replace(/<!--.*?-->/g, "").replace(/<a [^>]*class=hash-link[\s\S]*?<\/a>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// ── Step 1: sources ─────────────────────────────────────────────────────────────
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function statusOf(text) {
  if (/generally available|\bGA\b/i.test(text)) return "GA";
  if (/public preview/i.test(text)) return "Public Preview";
  if (/private preview/i.test(text)) return "Private Preview";
  if (/\bbeta\b/i.test(text)) return "Beta";
  return "none";
}

async function releaseNotes() {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const months = [[ist.getFullYear(), ist.getMonth()]];
  if (ist.getDate() <= WINDOW_DAYS) {
    const p = new Date(ist.getFullYear(), ist.getMonth() - 1, 1);
    months.push([p.getFullYear(), p.getMonth()]);
  }
  const out = [];
  for (const [y, m] of months) {
    const url = `https://docs.databricks.com/aws/en/release-notes/product/${y}/${MONTHS[m]}.html`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const re = /<h2[^>]*\sid="?([a-z0-9-]+)"?[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*\sid=|<\/article>|$)/g;
      let x;
      while ((x = re.exec(html))) {
        const title = strip(x[2]);
        const body = strip(x[3]).slice(0, 600);
        const date = (body.match(/^([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1];
        if (!date) continue;
        out.push({
          source: "release_note",
          url: `${url}#${x[1]}`,
          title,
          summary: body.replace(date, "").trim().slice(0, 300),
          // Release notes are dated, not timed: treat as noon IST of that day.
          published: new Date(`${date} 12:00:00 GMT+0530`),
          status: statusOf(`${title} ${body.slice(0, 200)}`),
        });
      }
    } catch (e) {
      log(`release notes ${url}: ${e.message}`);
    }
  }
  return out;
}

async function blog() {
  try {
    const res = await fetch("https://www.databricks.com/feed");
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
      const tag = (t) => strip((it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || "");
      return {
        source: "blog",
        url: tag("link"),
        title: tag("title"),
        summary: tag("description"),
        published: new Date(tag("pubDate")),
        categories: [...it.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((c) => strip(c[1])),
      };
    });
  } catch (e) {
    log(`blog feed: ${e.message}`);
    return [];
  }
}

function community() {
  const r = spawnSync(process.execPath, [path.join(SKILL_ROOT, "scripts", "community-fetch.mjs")], { encoding: "utf8", timeout: 120000 });
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    return (j.items || []).map((t) => ({
      source: "community",
      url: t.url,
      title: t.title.replace(/^Re:\s*/, ""),
      summary: t.board || "",
      published: t.posted_time ? new Date(t.posted_time) : new Date(j.fetched_at),
      replies: t.reply_count || 0,
      views: t.view_count || 0,
    }));
  } catch {
    log("community fetch failed — continuing without it");
    return [];
  }
}

// ── Steps 2–3: dedupe, scope, score (mirrors SKILL.md) ────────────────────────────
const taxonomy = readJson(path.join(SKILL_ROOT, "config", "taxonomy.json"), { keywords: [], negative_signals: [] });
const negatives = (taxonomy.negative_signals || []).map((p) => new RegExp(p, "i"));
const OUT_OF_SCOPE_CATEGORIES = /^(partners?|customers?|company|events?|culture|careers)$/i;

function engagement(it) {
  if (it.source === "release_note") return { GA: 1, "Public Preview": 0.7, Beta: 0.5, "Private Preview": 0.4 }[it.status] ?? 0.3;
  if (it.source === "blog") return /\bGA\b|generally available|launch|announc/i.test(it.title) ? 0.7 : 0.5;
  return Math.min(1, it.replies * 0.6 + (it.views / 1000) * 0.4);
}
function recency(it) {
  const h = (Date.now() - it.published.getTime()) / 3.6e6;
  return h < 12 ? 1 : h < 24 ? 0.85 : h < 48 ? 0.6 : h < 72 ? 0.4 : h < 168 ? 0.25 : 0.15;
}
function topic(it) {
  const text = `${it.title} ${it.summary}`.toLowerCase();
  const hits = new Set(taxonomy.keywords.filter((k) => text.includes(k.toLowerCase())));
  return Math.min(1, hits.size / 3);
}
function outOfScope(it) {
  const text = `${it.title} ${it.summary}`;
  if (negatives.some((r) => r.test(text))) return "negative signal";
  if (it.categories?.length && it.categories.every((c) => OUT_OF_SCOPE_CATEGORIES.test(c))) return `category ${it.categories.join("/")}`;
  return null;
}

function publishedHistory() {
  const pub = readJson(path.join(STATE, "published.json"), {});
  return (pub.history || []).filter((r) => r.posted_at && r.linkedin_post_id);
}
const newestRun = () => {
  const dir = path.join(SKILL_ROOT, "runs");
  return existsSync(dir) ? readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(d)).sort().pop() || null : null;
};
function run(cmd, argv, minutes) {
  const r = spawnSync(cmd, argv, { cwd: SKILL_ROOT, encoding: "utf8", timeout: minutes * 60000 });
  process.stdout.write(`${r.stdout || ""}${r.stderr || ""}`);
  return r.status;
}

// ── main ────────────────────────────────────────────────────────────────────────
if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < 90 * 60000) {
  log("another check/scan is still running — skipping");
  process.exit(0);
}

const drafted = readJson(path.join(STATE, "seen.json"), { items: {} }).items || {};
const all = [...(await releaseNotes()), ...(await blog()), ...community()];
const cutoff = Date.now() - WINDOW_DAYS * 864e5;
const ranked = [];
let dropped = 0;
for (const it of all) {
  if (!it.url || isNaN(it.published) || it.published.getTime() < cutoff || drafted[it.url]?.drafted_at) continue;
  if (outOfScope(it)) {
    dropped++;
    continue;
  }
  const e = engagement(it), r = recency(it), t = topic(it);
  ranked.push({ ...it, engagement: e, recency: r, topic_match: +t.toFixed(2), score: +(0.4 * e + 0.35 * r + 0.25 * t).toFixed(4) });
}
ranked.sort((a, b) => b.score - a.score);

const history = publishedHistory();
const today = istDate();
const postedToday = history.filter((r) => istDate(new Date(r.posted_at)) === today).length;
const last = history.map((r) => new Date(r.posted_at)).sort((a, b) => b - a)[0];
const hoursSince = last ? (Date.now() - last) / 3.6e6 : Infinity;

log(`ranked ${ranked.length} candidates (${all.length} pulled, ${dropped} out of scope); posted today ${postedToday}/${MAX_POSTS_PER_DAY}; last post ${hoursSince === Infinity ? "never" : `${hoursSince.toFixed(1)}h ago`}`);
for (const [i, it] of ranked.slice(0, 3).entries()) log(`  #${i + 1} ${it.score.toFixed(3)} [${it.source}${it.status ? ` ${it.status}` : ""}] ${it.title}`);

const top = ranked[0];
const reason =
  postedToday >= MAX_POSTS_PER_DAY ? `daily cap reached (${MAX_POSTS_PER_DAY})` :
  hoursSince < MIN_GAP_HOURS ? `last post only ${hoursSince.toFixed(1)}h ago (min ${MIN_GAP_HOURS}h)` :
  !top ? "no in-scope, undrafted item in the last 14 days" :
  top.score < MIN_SCORE ? `top score ${top.score} below ${MIN_SCORE}` : null;
if (reason) {
  log(`no post: ${reason}`);
  process.exit(0);
}
if (DRY_RUN) {
  log(`DRY RUN: would draft + post #1 — ${top.title}`);
  process.exit(0);
}

writeFileSync(LOCK, String(process.pid));
try {
  writeFileSync(PICK_FILE, JSON.stringify({ ...top, picked_at: new Date().toISOString(), runner_up: ranked.slice(1, 3).map((r) => ({ title: r.title, url: r.url, score: r.score })) }, null, 2));
  const before = newestRun();
  log(`drafting #1 via full scan: ${top.title}`);
  const exit = run("bash", [path.join(SKILL_ROOT, "scripts", "scheduled-scan.sh")], 45);
  const after = newestRun();
  log(`scan exit ${exit}, newest run ${after}${after === before ? " (no new draft)" : ""}`);
  run(process.execPath, [path.join(SKILL_ROOT, "scripts", "post-notify.mjs")], 15);
} finally {
  for (const f of [LOCK, PICK_FILE]) {
    try {
      unlinkSync(f);
    } catch {}
  }
}
