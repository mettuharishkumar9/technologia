#!/usr/bin/env node
// Print current IST time as a run folder name: YYYY-MM-DD-HHMM
// Workaround for broken `TZ='Asia/Kolkata' date` in MSYS/Git Bash on Windows.
//
// Usage:
//   node now-ist.mjs              → 2026-05-09-1024
//   node now-ist.mjs --iso        → 2026-05-09T10:24:31+05:30

const ISO = process.argv.includes("--iso");
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));

if (ISO) {
  // YYYY-MM-DDTHH:MM:SS+05:30
  process.stdout.write(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30\n`);
} else {
  // YYYY-MM-DD-HHMM
  process.stdout.write(`${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}\n`);
}
