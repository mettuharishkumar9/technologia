#!/usr/bin/env node
// Render the LinkedIn post card for a databricks-pulse run.
//
//   node render-card.mjs <run-folder> [--html card.html] [--scale 2]
//
// Reads <run>/card.html (a filled copy of a templates/cards/*.html template) and writes:
//   post.png             static image (final state of any animation), size from <meta name="card-size">
//   post.gif, post.mp4   only when the template declares <meta name="card-duration" content="<ms>">
//
// Animation is deterministic: every CSS/Web animation is paused and seeked frame by frame,
// so the GIF never depends on how fast the box is.
//
// Overflow guard: fails (exit 1) if #card or any [data-fit] element overflows its box.
// Shorten the text in card.html and re-run rather than shipping clipped text.

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_FFMPEG = path.resolve(SCRIPT_DIR, "..", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FFMPEG = process.env.FFMPEG_BIN || (existsSync(BUNDLED_FFMPEG) ? BUNDLED_FFMPEG : "ffmpeg");

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith("--")) {
  console.error("Usage: node render-card.mjs <run-folder> [--html card.html] [--scale 2]");
  process.exit(2);
}
const runFolder = path.resolve(args[0]);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : def;
};
const htmlFile = path.resolve(runFolder, opt("--html", "card.html"));
const scale = parseFloat(opt("--scale", "2"));
const FPS = 15;

const log = (m) => console.log(`[render-card] ${m}`);

// Fonts/icons come from Google Fonts + unpkg; a slow CDN shouldn't kill the run.
async function open(page, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      log(`load attempt ${attempt} failed (${e.message.split(/\r?\n/)[0]}), retrying`);
    }
  }
}

function ffmpeg(argv, label) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-y", ...argv], { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`ffmpeg ${label} failed`);
  }
}

if (!existsSync(htmlFile)) {
  console.error(`No ${htmlFile}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  // First pass at scale 1 just to read the declared size.
  const probe = await browser.newPage();
  await open(probe, pathToFileURL(htmlFile).href);
  const meta = await probe.evaluate(() => ({
    size: document.querySelector('meta[name="card-size"]')?.content || "1080x1080",
    duration: parseInt(document.querySelector('meta[name="card-duration"]')?.content || "0", 10),
  }));
  await probe.close();
  const [W, H] = meta.size.split("x").map(Number);

  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  await open(page, pathToFileURL(htmlFile).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
    if (window.lucide) window.lucide.createIcons();
  });

  const seek = (t) =>
    page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = t;
      }
    }, t);

  // Final state = far past every animation's end.
  await seek(meta.duration || 600000);

  const overflow = await page.evaluate(() => {
    const bad = [];
    const card = document.getElementById("card");
    if (!card) return ["#card element missing"];
    if (card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1)
      bad.push(`#card content ${card.scrollWidth}x${card.scrollHeight} > ${card.clientWidth}x${card.clientHeight}`);
    for (const el of document.querySelectorAll("[data-fit]")) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
        bad.push(`[data-fit="${el.dataset.fit}"] overflows (${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}): "${el.textContent.trim().slice(0, 60)}"`);
    }
    return bad;
  });
  if (overflow.length) {
    console.error("OVERFLOW — shorten the text and re-run:\n  " + overflow.join("\n  "));
    process.exitCode = 1;
  }

  const card = page.locator("#card");
  const png = path.join(runFolder, "post.png");
  await card.screenshot({ path: png });
  log(`post.png ${W * scale}x${H * scale}`);

  if (meta.duration > 0) {
    const tmp = path.join(runFolder, "_card_frames");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    // Frames at 1x: the GIF/MP4 are 1080 px wide anyway, and 2x frames take ~4x as long.
    const fpage = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1080 / W });
    await open(fpage, pathToFileURL(htmlFile).href);
    await fpage.evaluate(async () => {
      await document.fonts.ready;
      if (window.lucide) window.lucide.createIcons();
    });
    const fcard = fpage.locator("#card");
    const n = Math.round((meta.duration / 1000) * FPS);
    for (let i = 0; i < n; i++) {
      await fpage.evaluate((t) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
      }, (i * 1000) / FPS);
      await fcard.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, "0")}.png`) });
    }
    await fpage.close();
    const input = ["-framerate", String(FPS), "-i", path.join(tmp, "f%04d.png")];
    ffmpeg(
      [...input, "-vf", "scale=1080:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0", path.join(runFolder, "post.gif")],
      "gif",
    );
    ffmpeg(
      [...input, "-vf", "scale=1080:-2:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-r", "30", "-movflags", "+faststart", path.join(runFolder, "post.mp4")],
      "mp4",
    );
    rmSync(tmp, { recursive: true, force: true });
    log(`post.gif + post.mp4 (${n} frames, ${meta.duration} ms)`);
  }
} finally {
  await browser.close();
}
