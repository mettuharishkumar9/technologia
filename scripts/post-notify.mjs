#!/usr/bin/env node
// Scheduled post + email report. Cron calls this instead of pulse-post.mjs directly:
//
//   node scripts/post-notify.mjs [--dry-run] [--test-email]
//
// Runs `pulse-post.mjs --auto-pick`, echoes its output (cron appends it to logs/cron-post.log),
// classifies the outcome and emails a one-line verdict via Composio GMAIL_SEND_EMAIL:
//   ✅ posted   — with the LinkedIn link, topic and template
//   ❌ failed   — poster error, or the scan produced no fresh draft (with the scan log tail)
//   ⏸ paused   — state/POSTING_PAUSED exists
// Recipient: state/notify.json {"email_to": "..."} (state/ is gitignored).
// --test-email sends a sample report without posting anything.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSIO_BIN = process.env.COMPOSIO_BIN || path.join(os.homedir(), ".composio", "composio");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TEST_EMAIL = args.includes("--test-email");

const now = new Date();
const day = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

function readJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function scanLogTail(n = 15) {
  const logs = path.join(SKILL_ROOT, "logs");
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const f = path.join(logs, `scan-${today}.log`);
  if (!existsSync(f)) return `(no scan log for ${today} — the scan did not run)`;
  return readFileSync(f, "utf8").trim().split("\n").slice(-n).join("\n");
}

function runInfo(runName) {
  if (!runName) return {};
  const dir = path.join(SKILL_ROOT, "runs", runName);
  const card = readJson(path.join(dir, "card.json"), {});
  const ranked = readJson(path.join(dir, "ranked.json"), {});
  const top = (ranked.top3 || [])[0] || {};
  return { topic: top.title, source: top.url, template: card.template };
}

function sendEmail(subject, body) {
  const to = process.env.NOTIFY_EMAIL || readJson(path.join(SKILL_ROOT, "state", "notify.json"), {}).email_to;
  if (!to) {
    console.log("[post-notify] no recipient configured (state/notify.json email_to) — email skipped");
    return;
  }
  const data = { recipient_email: to, subject, body };
  const r = spawnSync(COMPOSIO_BIN, ["execute", "GMAIL_SEND_EMAIL", "-d", JSON.stringify(data)], { encoding: "utf8", timeout: 120000 });
  const ok = r.status === 0 && /"successful"\s*:\s*true/.test(r.stdout || "");
  console.log(`[post-notify] email to ${to}: ${ok ? "sent" : `FAILED (exit ${r.status}) ${(r.stderr || r.stdout || "").slice(0, 400)}`}`);
}

if (TEST_EMAIL) {
  sendEmail(`🧪 Databricks Pulse — test email (${day})`, `This is a test of the daily LinkedIn status email.\n\nFrom now on you'll get one email per scheduled post: ✅ posted, ❌ failed, or ⏸ paused.\n\nSent ${time} IST from the Lightsail pulse server.`);
  process.exit(0);
}

const post = spawnSync(process.execPath, [path.join(SKILL_ROOT, "scripts", "pulse-post.mjs"), "--auto-pick", ...(DRY_RUN ? ["--dry-run"] : [])], {
  cwd: SKILL_ROOT,
  encoding: "utf8",
  timeout: 15 * 60 * 1000,
});
const out = `${post.stdout || ""}${post.stderr || ""}`;
process.stdout.write(out);

const urn = (out.match(/post_urn=(\S+)/) || [])[1];
const runName = (out.match(/Run folder: .*\/runs\/([^\s/]+)/) || [])[1];
const info = runInfo(runName);
const errLine = (out.match(/ERROR: (.*)/) || [])[1];

let subject, body;
if (urn) {
  subject = `✅ LinkedIn post published — ${day}`;
  body = [
    `Today's Databricks Pulse post went live at ${time} IST.`,
    ``,
    `Post:     https://www.linkedin.com/feed/update/${urn}/`,
    info.topic ? `Topic:    ${info.topic}` : null,
    info.template ? `Image:    ${info.template}` : null,
    info.source ? `Source:   ${info.source}` : null,
    `Run:      ${runName}`,
  ].filter((l) => l !== null).join("\n");
} else if (/PAUSED:/.test(out)) {
  subject = `⏸ LinkedIn post paused — ${day}`;
  body = `Nothing was posted at ${time} IST because posting is paused (state/POSTING_PAUSED exists on the server).\nDelete that file to resume.`;
} else if (/no unposted runs found/.test(out)) {
  subject = `❌ LinkedIn post failed — ${day}`;
  body = `Nothing was posted at ${time} IST: the morning scan did not produce a fresh draft (slow day, scan error or budget cap).\n\nLast lines of today's scan log:\n\n${scanLogTail()}`;
} else if (DRY_RUN && post.status === 0) {
  subject = `🧪 LinkedIn post dry run OK — ${day}`;
  body = `Dry run at ${time} IST: the poster found ${runName || "a run"} and would publish it.${info.topic ? `\nTopic: ${info.topic}` : ""}${info.template ? `\nImage: ${info.template}` : ""}`;
} else {
  subject = `❌ LinkedIn post failed — ${day}`;
  body = `The poster failed at ${time} IST (exit ${post.status}).\n\n${errLine ? `Error: ${errLine}\n\n` : ""}${runName ? `Run: ${runName}\n\n` : ""}Last lines of the poster output:\n\n${out.trim().split("\n").slice(-12).join("\n")}\n\nCommon fix for "401 Unauthorized": re-login Composio on the server (composio login).`;
}

sendEmail(subject, body);
process.exit(urn || DRY_RUN ? 0 : post.status || 1);
