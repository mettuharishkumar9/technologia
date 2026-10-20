#!/usr/bin/env node
// Build <run>/carousel.html from <run>/carousel.json using the Style 25 "Front Page" template.
//
// The template (templates/carousel/front-page.html) holds the CSS + viewer chrome + export mode;
// this script renders the 13 slide sections from JSON and drops them into the {{SLIDES}} slot.
// Text limits below are heuristics that catch obviously-too-long copy early; the hard check is
// render-carousel.mjs, which measures real overflow in the DOM.
//
// Usage:
//   node build-carousel.mjs <run-folder> [--template <path>] [--out carousel.html]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TEMPLATE = path.join(SKILL_ROOT, "templates", "carousel", "front-page.html");
const AUTHOR_FILE = path.join(SKILL_ROOT, "config", "author.json");

const TOTAL = 13;
// Fixed slide order — the story beats always land on the same slide numbers.
const ORDER = [
  "cover", "bullets", "bullets", "flow", "bullets", "feature", "numbered",
  "cards", "bullets", "compare", "bullets_caveat", "takeaway", "sources",
];

// Character ceilings per field (chosen from the lens-01 reference slides with headroom).
const MAX = {
  kicker: 40, headline: 60, stat: 12, coverHeadline: 40, deck: 140,
  bullet: 95, bulletSource: 44, note: 120, flowStep: 80, flowSub: 60,
  status: 64, featureBody: 160, numberedStep: 110,
  cardTitle: 26, cardBody: 125, compareCell: 42,
  caveat: 130, takeawayBody: 170, cta: 46,
  sourceTitle: 62, sourceMeta: 52, honesty: 230, dateLabel: 14,
};

function parseArgs(argv) {
  const a = { template: DEFAULT_TEMPLATE, out: "carousel.html" };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--template") a.template = path.resolve(argv[++i]);
    else if (argv[i] === "--out") a.out = argv[++i];
    else if (argv[i] === "--help") a.help = true;
    else pos.push(argv[i]);
  }
  a.runFolder = pos[0];
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.runFolder) {
  console.error("Usage: node build-carousel.mjs <run-folder> [--template <path>] [--out carousel.html]");
  process.exit(2);
}

// ── helpers ───────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function need(obj, key, where) {
  const v = obj?.[key];
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    throw new Error(`${where}: missing "${key}"`);
  }
  return v;
}
function lim(value, max, where) {
  const s = String(value);
  if (s.length > max) throw new Error(`${where}: "${s.slice(0, 48)}…" is ${s.length} chars; max ${max}. Shorten it in carousel.json.`);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) throw new Error(`${where}: emojis are not allowed on slides.`);
  return s;
}
function list(obj, key, min, max, where) {
  const v = need(obj, key, where);
  if (!Array.isArray(v) || v.length < min || v.length > max) {
    throw new Error(`${where}: "${key}" needs ${min}–${max} items, got ${Array.isArray(v) ? v.length : typeof v}`);
  }
  return v;
}
// Calibrated on the lens-01 reference slides: ≤30 chars fits one/two lines at 88px, ≤48 at 80px, longer at 76px.
const headlineClass = (t) => (t.length <= 30 ? "headline sz-88" : t.length <= 48 ? "headline sz-80" : "headline sz-76");

const masthead = (dateLabel) =>
  `<div class="masthead"><div class="brand mono"><span class="dot"></span>INSURANCE LENS</div>` +
  `<div class="dateline mono">DAILY · ${esc(dateLabel)}</div></div>\n      <div class="rule"></div>`;
const footer = (n, byline) =>
  `<div class="footer"><div class="byline">${esc(byline)}</div><div class="page mono">${String(n).padStart(2, "0")} / ${TOTAL}</div></div>`;
const kickerHtml = (s, where) => `<div class="kicker mono">${esc(lim(need(s, "kicker", where), MAX.kicker, where))}</div>`;
const headlineHtml = (s, where) => {
  const t = lim(need(s, "headline", where), MAX.headline, where);
  return `<h2 class="${headlineClass(t)}">${esc(t)}</h2>`;
};
const noteHtml = (s, where) => (s.note ? `<p class="note">${esc(lim(s.note, MAX.note, where))}</p>` : "");

function bulletsHtml(s, where, min = 2, max = 4) {
  const items = list(s, "bullets", min, max, where);
  const lis = items.map((b, i) => {
    const text = lim(need(typeof b === "string" ? { text: b } : b, "text", `${where} bullet ${i + 1}`), MAX.bullet, where);
    const src = b.source ? `<span class="src mono">${esc(lim(b.source, MAX.bulletSource, where))}</span>` : "";
    return `<li><span class="arrow">→</span><div class="txt">${esc(text)}${src}</div></li>`;
  });
  return `<ul class="bullets">\n          ${lis.join("\n          ")}\n        </ul>`;
}

// ── slide renderers (markup mirrors carousels/lens-01-private-network-gateway/carousel.html) ──
const R = {
  cover(s, w) {
    const pill = lim(s.kicker || s.topic_tag, MAX.kicker, w);
    const stat = lim(need(s, "stat", w), MAX.stat, w);
    const head = lim(need(s, "headline", w), MAX.coverHeadline, w);
    const deck = lim(need(s, "deck", w), MAX.deck, w);
    return `<div class="cover-pill mono">${esc(pill)}</div>
      <div class="body center">
        <div class="cover-stat">${esc(stat)}</div>
        <h2 class="cover-headline">${esc(head)}</h2>
        <p class="cover-deck">${esc(deck)}</p>
      </div>`;
  },
  bullets(s, w) {
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        ${bulletsHtml(s, w)}
        ${noteHtml(s, w)}
      </div>`;
  },
  flow(s, w) {
    const steps = list(s, "steps", 3, 3, w).map((st, i) => {
      const o = typeof st === "string" ? { text: st } : st;
      const text = lim(need(o, "text", `${w} step ${i + 1}`), MAX.flowStep, w);
      const sub = o.sub ? ` <span class="sub">${esc(lim(o.sub, MAX.flowSub, w))}</span>` : "";
      return `<div class="card">${esc(text)}${sub}</div>`;
    });
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        <div class="flow">
          ${steps.join('\n          <div class="down">↓</div>\n          ')}
        </div>
        ${noteHtml(s, w)}
      </div>`;
  },
  feature(s, w) {
    const status = lim(need(s, "status", w), MAX.status, w);
    const body = lim(need(s, "body", w), MAX.featureBody, w);
    const note = s.note ? `<p class="note src-note mono">${esc(lim(s.note, MAX.note, w))}</p>` : "";
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="status mono">${esc(status)}</div>
      <div class="body">
        <div class="card feature-card">${esc(body)}</div>
        ${note}
      </div>`;
  },
  numbered(s, w) {
    const steps = list(s, "steps", 3, 3, w).map(
      (t, i) => `<div class="step"><div class="n">${i + 1}</div><div class="t">${esc(lim(t, MAX.numberedStep, w))}</div></div>`
    );
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        <div class="steps">
          ${steps.join("\n          ")}
        </div>
        ${noteHtml(s, w)}
      </div>`;
  },
  cards(s, w) {
    const cards = list(s, "cards", 2, 2, w).map((c, i) => {
      const title = lim(need(c, "title", `${w} card ${i + 1}`), MAX.cardTitle, w);
      const body = lim(need(c, "body", `${w} card ${i + 1}`), MAX.cardBody, w);
      return `<div class="card">\n            <h3>${esc(title)}</h3>\n            <p>${esc(body)}</p>\n          </div>`;
    });
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        <div class="two-up">
          ${cards.join("\n          ")}
        </div>
        ${noteHtml(s, w)}
      </div>`;
  },
  compare(s, w) {
    const rows = list(s, "rows", 3, 4, w);
    const cells = rows.map((r, i) => {
      if (!Array.isArray(r) || r.length !== 2) throw new Error(`${w}: row ${i + 1} must be [before, after]`);
      const last = i === rows.length - 1 ? " last" : "";
      return `<div class="cell l${last}">${esc(lim(r[0], MAX.compareCell, w))}</div><div class="cell r${last}">${esc(lim(r[1], MAX.compareCell, w))}</div>`;
    });
    const left = lim(s.left_label || "BEFORE", 12, w);
    const right = lim(s.right_label || "AFTER", 12, w);
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        <div class="cmp">
          <div class="cell head l mono">${esc(left)}</div><div class="cell head r mono">${esc(right)}</div>
          ${cells.join("\n          ")}
        </div>
      </div>`;
  },
  bullets_caveat(s, w) {
    const caveat = lim(need(s, "caveat", w), MAX.caveat, w);
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        ${bulletsHtml(s, w, 2, 3)}
        <div class="box">
          <div class="label mono">CAVEAT</div>
          <p>${esc(caveat)}</p>
        </div>
      </div>`;
  },
  takeaway(s, w) {
    const body = lim(need(s, "body", w), MAX.takeawayBody, w);
    const ctas = list(s, "ctas", 2, 3, w).map((c) => `<span class="pill mono">${esc(lim(c, MAX.cta, w))}</span>`);
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        <p class="lead">${esc(body)}</p>
        <div class="cta">
          ${ctas.join("\n          ")}
        </div>
      </div>`;
  },
  sources(s, w) {
    const rows = list(s, "sources", 2, 5, w).map((src, i) => {
      const title = lim(need(src, "title", `${w} source ${i + 1}`), MAX.sourceTitle, w);
      const meta = lim(need(src, "meta", `${w} source ${i + 1}`), MAX.sourceMeta, w);
      return `<div class="src-row"><div class="n mono">${String(i + 1).padStart(2, "0")}</div><div><div class="t">${esc(title)}</div><div class="s mono">${esc(meta)}</div></div></div>`;
    });
    const honesty = lim(need(s, "honesty_note", w), MAX.honesty, w);
    return `${kickerHtml(s, w)}
      ${headlineHtml(s, w)}
      <div class="body">
        <div class="sources">
          ${rows.join("\n          ")}
        </div>
        <div class="box honesty">
          <div class="label mono">HONESTY NOTE</div>
          <p>${esc(honesty)}</p>
        </div>
      </div>`;
  },
};

// ── main ──────────────────────────────────────────────────────────────────────
function main() {
  const runFolder = path.resolve(args.runFolder);
  const jsonPath = path.join(runFolder, "carousel.json");
  if (!existsSync(jsonPath)) throw new Error(`carousel.json not found in ${runFolder}`);
  if (!existsSync(args.template)) throw new Error(`template not found: ${args.template}`);

  const spec = JSON.parse(readFileSync(jsonPath, "utf8"));
  const author = existsSync(AUTHOR_FILE) ? JSON.parse(readFileSync(AUTHOR_FILE, "utf8")) : {};
  const byline = author.lower_name_full || author.byline || "Harish Mettu - Databricks Platform Engineer";

  const issue = lim(need(spec, "issue", "carousel.json"), 40, "issue");
  const dateLabel = lim(need(spec, "date_label", "carousel.json"), MAX.dateLabel, "date_label");
  const topic = lim(need(spec, "topic_tag", "carousel.json"), MAX.kicker, "topic_tag");
  const slides = list(spec, "slides", TOTAL, TOTAL, "carousel.json");

  const sections = slides.map((s, i) => {
    const n = i + 1;
    const where = `slide ${n} (${ORDER[i]})`;
    if (s.n !== undefined && s.n !== n) throw new Error(`${where}: "n" is ${s.n}, expected ${n}`);
    if (s.type !== ORDER[i]) throw new Error(`${where}: type must be "${ORDER[i]}", got "${s.type}"`);
    if (n === 1 && !s.kicker) s = { ...s, kicker: topic };
    const content = R[ORDER[i]](s, where);
    return `  <!-- ${n} — ${ORDER[i]} -->
  <section class="slide${n === 1 ? " active" : ""}" data-slide="${n}">
    <div class="sheet">
      ${masthead(dateLabel)}
      ${content}
      ${footer(n, byline)}
    </div>
  </section>`;
  });

  const title = `Insurance Lens — ${topic}`;
  const html = readFileSync(args.template, "utf8")
    .replaceAll("{{TITLE}}", esc(title))
    .replaceAll("{{TOTAL}}", String(TOTAL))
    .replaceAll("{{DOWNLOAD_PREFIX}}", esc(issue))
    .replace("{{SLIDES}}", sections.join("\n\n"));

  for (const token of ["{{TITLE}}", "{{TOTAL}}", "{{DOWNLOAD_PREFIX}}", "{{SLIDES}}"]) {
    if (html.includes(token)) throw new Error(`template token ${token} was not replaced — check the template`);
  }
  // Sanity: the verifier regexes used across the carousel repo.
  const slideCount = (html.match(/<section[^>]*\bclass="[^"]*\bslide\b/g) || []).length;
  const bylineCount = html.split(byline).length - 1;
  if (slideCount !== TOTAL) throw new Error(`built ${slideCount} slides, expected ${TOTAL}`);
  if (bylineCount < TOTAL) throw new Error(`byline appears ${bylineCount} times, expected ${TOTAL}`);

  const outPath = path.join(runFolder, args.out);
  writeFileSync(outPath, html, "utf8");
  console.log(`[${new Date().toISOString()}] built ${outPath} (${Buffer.byteLength(html, "utf8")} bytes, ${TOTAL} slides, "${title}")`);
}

try {
  main();
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
