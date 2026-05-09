#!/usr/bin/env node
// Render whiteboard image(s) for a databricks-pulse run.
// Reads <run>/images.spec.json, picks the right template fill recipe,
// writes whiteboard.html (or slide_NN.html) into the run folder, then
// screenshots each via headless Chrome to PNG.
//
// Usage:
//   node render-images.mjs <run-folder>
//
// For now only supports type:"single". Carousel will be added once the
// manual single-image test passes end-to-end.

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

if (process.argv.length < 3) {
  console.error("Usage: node render-images.mjs <run-folder>");
  process.exit(2);
}
const runFolder = path.resolve(process.argv[2]);

function htmlEscape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Per-template fill recipes. Add new entries here when adding template support.
// Each recipe takes raw template HTML + a `fill` object and returns filled HTML.
const fillRecipes = {
  "03_breaking_news": (html, fill) => {
    let out = html;

    // Simple inner-text replacements (regex captures one specific element each).
    const simple = [
      { sel: /(<div class="toolbar-title">)([\s\S]*?)(<\/div>)/, value: fill.toolbar_title },
      { sel: /(<div class="breaking-time">)([\s\S]*?)(<\/div>)/, value: fill.breaking_time },
      { sel: /(<div class="logo-box">)([\s\S]*?)(<\/div>)/, value: fill.logo_box_text },
      { sel: /(<div class="network-name">)([\s\S]*?)(<\/div>)/, value: fill.network_name },
      { sel: /(<div class="subheadline">)([\s\S]*?)(<\/div>)/, value: fill.subheadline }, // allows <br>
      { sel: /(<div class="source-text">)([\s\S]*?)(<\/div>)/, value: fill.source_text },
      { sel: /(<div class="lower-label">)([\s\S]*?)(<\/div>)/, value: fill.lower_label },
      { sel: /(<div class="lower-name">)([\s\S]*?)(<\/div>)/, value: fill.lower_name },
      { sel: /(<div class="lower-title">)([\s\S]*?)(<\/div>)/, value: fill.lower_title },
      { sel: /(<div class="ticker-content">)([\s\S]*?)(<\/div>)/, value: fill.ticker_content },
    ];
    for (const { sel, value } of simple) {
      if (value === undefined || value === null) continue;
      out = out.replace(sel, `$1${value}$3`);
    }

    // Headline has internal structure: main<span>highlight</span><br>tail
    out = out.replace(
      /(<div class="headline">)[\s\S]*?(<\/div>)/,
      `$1${htmlEscape(fill.headline_main || "")}<span>${htmlEscape(fill.headline_highlight || "")}</span><br>${htmlEscape(fill.headline_tail || "")}$2`
    );

    // 3 stat-val and 3 stat-lbl in document order — counter-based global replace.
    const stats = [
      [fill.stat_1_val, fill.stat_1_lbl],
      [fill.stat_2_val, fill.stat_2_lbl],
      [fill.stat_3_val, fill.stat_3_lbl],
    ];
    let vi = 0;
    out = out.replace(/(<div class="stat-val">)([\s\S]*?)(<\/div>)/g, (m, p1, _p2, p3) => {
      if (vi >= stats.length) return m;
      const v = htmlEscape(stats[vi][0] ?? "");
      vi++;
      return `${p1}${v}${p3}`;
    });
    let li = 0;
    out = out.replace(/(<div class="stat-lbl">)([\s\S]*?)(<\/div>)/g, (m, p1, _p2, p3) => {
      if (li >= stats.length) return m;
      const v = htmlEscape(stats[li][1] ?? "");
      li++;
      return `${p1}${v}${p3}`;
    });

    return out;
  },
  // Future: 02_stat_card, 04_before_after, 01_tutorial_carousel, etc.
};

function screenshot(htmlFile, pngFile, width, height) {
  console.log(`Screenshotting ${path.basename(htmlFile)} → ${path.basename(pngFile)} (${width}×${height})`);
  const res = spawnSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      `--screenshot=${pngFile}`,
      `--window-size=${width},${height}`,
      "--hide-scrollbars",
      `file:///${htmlFile.replace(/\\/g, "/")}`,
    ],
    { timeout: 30000, encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(`Chrome screenshot failed (status ${res.status}): ${res.stderr || res.stdout}`);
  }
}

async function main() {
  const specPath = path.join(runFolder, "images.spec.json");
  const spec = JSON.parse(await readFile(specPath, "utf8"));

  if (spec.type !== "single") {
    throw new Error(`Only type:"single" is supported in this version. Got: ${spec.type}`);
  }
  const recipe = fillRecipes[spec.template];
  if (!recipe) {
    throw new Error(`No fill recipe registered for template "${spec.template}". Add one in render-images.mjs.`);
  }

  const templateHtml = await readFile(spec.template_path, "utf8");
  const filled = recipe(templateHtml, spec.fill);

  const htmlOut = path.join(runFolder, "whiteboard.html");
  const pngOut = path.join(runFolder, "whiteboard.png");
  await writeFile(htmlOut, filled, "utf8");
  console.log(`Wrote ${htmlOut} (${filled.length} chars)`);

  const w = spec.output_size?.width || 820;
  const h = spec.output_size?.height || 1080;
  screenshot(htmlOut, pngOut, w, h);

  // Verify the PNG was produced.
  const { statSync } = await import("node:fs");
  const size = statSync(pngOut).size;
  console.log(`Wrote ${pngOut} (${Math.round(size / 1024)} KB)`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
