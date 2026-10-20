#!/usr/bin/env node
// Render every slide of a run's carousel.html to PNG for a LinkedIn multi-image post.
//
// Relies on the carousel's built-in export mode: `carousel.html?slide=N` hides the
// viewer chrome and shows slide N at exactly 1080×1350 (same contract as the
// databricks-linkedin-series carousels — see /* EXPORT-MODE-INJECTION-V1 */).
//
// Usage:
//   node render-carousel.mjs <run-folder> [--html carousel.html] [--slides 13] [--out carousel] [--scale 1]
//
// Writes <run>/<out>/slide-01.png … slide-NN.png and <run>/<out>/manifest.json
// (ordered list of PNG paths — pulse-post.mjs reads this to build the images array).

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const SLIDE_W = 1080;
const SLIDE_H = 1350;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function parseArgs(argv) {
  const args = { html: "carousel.html", slides: 13, out: "carousel", scale: 1 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--html") args.html = argv[++i];
    else if (a === "--slides") args.slides = parseInt(argv[++i], 10);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--scale") args.scale = parseInt(argv[++i], 10);
    else if (a === "--help") args.help = true;
    else positional.push(a);
  }
  args.runFolder = positional[0];
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.runFolder) {
  console.error("Usage: node render-carousel.mjs <run-folder> [--html carousel.html] [--slides 13] [--out carousel] [--scale 1]");
  process.exit(2);
}
if (!Number.isInteger(args.slides) || args.slides < 2 || args.slides > 20) {
  console.error("--slides must be between 2 and 20 (LinkedIn multi-image limit).");
  process.exit(2);
}

const runFolder = path.resolve(args.runFolder);
const htmlPath = path.join(runFolder, args.html);
const outDir = path.join(runFolder, args.out);

async function main() {
  if (!existsSync(htmlPath)) throw new Error(`carousel HTML not found: ${htmlPath}`);
  await mkdir(outDir, { recursive: true });

  const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
  log(`Launching headless Chromium (Playwright)...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: SLIDE_W, height: SLIDE_H },
    deviceScaleFactor: args.scale,
  });
  const page = await context.newPage();

  const files = [];
  const failures = [];
  for (let n = 1; n <= args.slides; n++) {
    const outPath = path.join(outDir, `slide-${String(n).padStart(2, "0")}.png`);
    try {
      await page.goto(`${fileUrl}?slide=${n}`, { waitUntil: "load" });
      // Web fonts (Google Fonts) must be ready or Anton/Inter fall back to system fonts.
      await page.evaluate(() => document.fonts.ready);
      // Let the export-mode script run its deferred fit() and any transitions settle.
      await page.waitForTimeout(400);
      const visible = await page.evaluate(() => {
        const active = document.querySelector(".slide.active");
        if (!active) return null;
        const r = active.getBoundingClientRect();
        // Overflow guard: the content region (.body, or any element above the footer) must end
        // above the footer's top edge, and nothing may extend past the sheet's bottom.
        const footer = active.querySelector(".footer");
        const footerTop = footer ? footer.getBoundingClientRect().top : r.bottom;
        let contentBottom = 0;
        for (const el of active.querySelectorAll(".sheet > *:not(.footer)")) {
          const b = el.getBoundingClientRect().bottom;
          if (b > contentBottom) contentBottom = b;
          for (const inner of el.querySelectorAll("*")) {
            const ib = inner.getBoundingClientRect().bottom;
            if (ib > contentBottom) contentBottom = ib;
          }
        }
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (active.innerText || "").trim().length,
          overflowPx: Math.round(contentBottom - footerTop),
        };
      });
      if (!visible) throw new Error("no .slide.active element — export mode did not select a slide");
      if (visible.text === 0) throw new Error("active slide has no text");
      if (visible.overflowPx > 0) {
        throw new Error(`content overlaps the footer by ${visible.overflowPx}px — shorten the text in carousel.json`);
      }
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H } });
      const kb = Math.round(statSync(outPath).size / 1024);
      log(`slide ${String(n).padStart(2, "0")} → ${path.basename(outPath)} (${kb} KB, slide box ${visible.w}×${visible.h})`);
      files.push(outPath);
    } catch (e) {
      failures.push({ slide: n, error: e.message });
      log(`slide ${n} FAILED: ${e.message}`);
    }
  }

  await page.close();
  await context.close();
  await browser.close();

  const manifest = {
    rendered_at: new Date().toISOString(),
    source_html: path.relative(runFolder, htmlPath),
    width: SLIDE_W * args.scale,
    height: SLIDE_H * args.scale,
    slides: files.map((f) => path.relative(runFolder, f).replace(/\\/g, "/")),
  };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  if (failures.length) {
    throw new Error(`${failures.length} slide(s) failed: ${failures.map((f) => `#${f.slide} (${f.error})`).join("; ")}`);
  }
  log(`=== Carousel render complete: ${files.length} slides → ${outDir} ===`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
