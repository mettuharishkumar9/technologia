#!/usr/bin/env node
// Render an 8-second MP4 of the run's whiteboard.html (with CSS animations
// actually playing) and produce three artifacts:
//   - square.mp4     — 1080×1080, source for LinkedIn frame extraction
//   - vertical.mp4   — 1080×1920, padded with brand background → IG Reel video
//   - cover.jpg      — single frame from vertical at 1.5s → IG Reel cover
//   - linkedin.png   — single frame from square at 3s → LinkedIn post image
//
// Usage:
//   node render-video.mjs <run-folder>
//
// Reads <run>/media.spec.json for duration + viewport + CSS injection.

import { readFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const FFMPEG = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..", "bin", "ffmpeg.exe");

if (process.argv.length < 3) {
  console.error("Usage: node render-video.mjs <run-folder>");
  process.exit(2);
}
const runFolder = path.resolve(process.argv[2]);

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runFfmpeg(args, label) {
  log(`ffmpeg ${label}: ${args.slice(0, 6).join(" ")} ...`);
  const res = spawnSync(FFMPEG, args, { encoding: "utf8", timeout: 120000 });
  if (res.status !== 0) {
    console.error(res.stderr);
    throw new Error(`ffmpeg ${label} failed (status ${res.status})`);
  }
}

async function recordWebm(spec, outDir) {
  const [vw, vh] = spec.render_viewport;
  const tmpDir = path.join(outDir, "_tmp_video");
  if (existsSync(tmpDir)) await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  log(`Launching headless Chromium (Playwright)...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 1,
    recordVideo: { dir: tmpDir, size: { width: vw, height: vh } },
  });
  const page = await context.newPage();

  const htmlPath = path.join(outDir, spec.source_html);
  const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
  log(`Loading ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: "load" });

  // Inject CSS AFTER page load to hide template dev chrome (toolbar/hint) and zero body padding.
  // Using addStyleTag is more reliable than addInitScript for file:// URLs.
  if (spec.inject_css) {
    await page.addStyleTag({ content: spec.inject_css });
    log("Injected style overrides (hide toolbar/hint, body padding 0)");
  }

  const durMs = spec.duration_seconds * 1000;
  log(`Recording for ${durMs}ms...`);
  await page.waitForTimeout(durMs);

  // Closing the context flushes the video file.
  await page.close();
  await context.close();
  await browser.close();

  // Find the produced webm.
  const files = await readdir(tmpDir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`No webm produced in ${tmpDir}. Files: ${files.join(", ")}`);
  const webmPath = path.join(tmpDir, webm);
  log(`Recorded ${webmPath} (${Math.round(statSync(webmPath).size / 1024)} KB)`);
  return { webmPath, tmpDir };
}

async function main() {
  if (!existsSync(FFMPEG)) throw new Error(`ffmpeg not found at ${FFMPEG}`);
  const spec = JSON.parse(await readFile(path.join(runFolder, "media.spec.json"), "utf8"));

  const { webmPath, tmpDir } = await recordWebm(spec, runFolder);

  const squareOut = path.join(runFolder, "square.mp4");
  const verticalOut = path.join(runFolder, "vertical.mp4");
  const linkedinPng = path.join(runFolder, "linkedin.png");
  const coverJpg = path.join(runFolder, "cover.jpg");

  // 1. webm → square.mp4 at 1080×1080 (upscale, h264, silent audio track for IG compatibility)
  // All -i inputs come first, then output options.
  const [sw, sh] = spec.outputs.square_mp4.size;
  runFfmpeg(
    [
      "-y",
      "-i", webmPath,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf", `scale=${sw}:${sh}:flags=lanczos`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-t", String(spec.duration_seconds),
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      squareOut,
    ],
    "encode square.mp4"
  );

  // 2. square.mp4 → vertical.mp4 (pad to 1080×1920 with brand color)
  const [vw, vh] = spec.outputs.vertical_mp4.size;
  const padX = Math.round((vw - sw) / 2);
  const padY = Math.round((vh - sh) / 2);
  const padColor = (spec.outputs.vertical_mp4.pad_color || "#0f172a").replace("#", "0x");
  runFfmpeg(
    [
      "-y",
      "-i", squareOut,
      "-vf", `pad=${vw}:${vh}:${padX}:${padY}:color=${padColor}`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "-movflags", "+faststart",
      verticalOut,
    ],
    "pad to vertical.mp4"
  );

  // 3. Frame extract from square at 3s → linkedin.png
  const liAt = spec.outputs.square_mp4.frame_extract.at_seconds;
  runFfmpeg(["-y", "-ss", String(liAt), "-i", squareOut, "-vframes", "1", linkedinPng], `extract linkedin frame @${liAt}s`);

  // 4. Frame extract from vertical at 1.5s → cover.jpg
  const covAt = spec.outputs.vertical_mp4.frame_extract.at_seconds;
  runFfmpeg(["-y", "-ss", String(covAt), "-i", verticalOut, "-vframes", "1", "-q:v", "2", coverJpg], `extract reel cover @${covAt}s`);

  // Clean up the tmp webm dir.
  await rm(tmpDir, { recursive: true, force: true });

  log("=== Render complete ===");
  for (const f of [squareOut, verticalOut, linkedinPng, coverJpg]) {
    log(`  ${path.basename(f)} (${Math.round(statSync(f).size / 1024)} KB)`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
