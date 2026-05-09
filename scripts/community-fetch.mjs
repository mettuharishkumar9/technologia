#!/usr/bin/env node
// Fetch recent posts from community.databricks.com.
// Khoros blocks bare WebFetch user-agents, so we fetch with a browser UA
// and parse the HTML with regex (no npm deps needed).
//
// Usage: node community-fetch.mjs [--limit N]
// Output: JSON on stdout.

const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : 25;
})();

const URL = "https://community.databricks.com/t5/forums/recentpostspage/post-type/message";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseRelativeTime(text) {
  // Khoros shows relative times like "2 hours ago", "yesterday",
  // or full timestamps like "05-08-2026 14:32:11".
  const now = new Date();
  const t = text.toLowerCase().trim();

  const m = t.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const ms = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }[unit];
    return new Date(now.getTime() - n * ms).toISOString();
  }
  if (t === "yesterday") return new Date(now.getTime() - 86400e3).toISOString();
  if (t === "today") return now.toISOString();

  // MM-DD-YYYY HH:MM[:SS] AM/PM (Khoros's title attribute format)
  const usDate = text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (usDate) {
    const [, mm, dd, yyyy, hh, min, ss, ampm] = usDate;
    let h = parseInt(hh, 10);
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && h < 12) h += 12;
      if (ampm.toUpperCase() === "AM" && h === 12) h = 0;
    }
    const d = new Date(Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10), h, parseInt(min, 10), parseInt(ss || "0", 10)));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) {
    process.stderr.write(`HTTP ${res.status} ${res.statusText}\n`);
    process.exit(1);
  }
  const html = await res.text();

  // Split the body by the per-post wrapper. Each post starts with:
  //   <div class="MessageView lia-message-view-recent-posts-item ..."
  // Use a sentinel split so we can isolate each post's HTML chunk.
  const SENTINEL = "___DBPULSE_POST_BOUNDARY___";
  const wrapperRe = /<div[^>]*class="[^"]*lia-message-view-recent-posts-item[^"]*"[^>]*>/g;
  const chunked = html.replace(wrapperRe, SENTINEL + "$&");
  const chunks = chunked.split(SENTINEL).slice(1); // first chunk is pre-amble, drop it

  const items = [];
  for (const chunk of chunks) {
    if (items.length >= LIMIT) break;

    // Title + URL: find the page-link anchor inside the message-subject area.
    const linkMatch = chunk.match(/<a[^>]*class="[^"]*page-link[^"]*"[^>]*href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/);
    if (!linkMatch) continue;
    const href = linkMatch[1];
    const title = stripTags(linkMatch[2]);
    if (!title) continue;
    const url = href.startsWith("http") ? href : `https://community.databricks.com${href}`;

    // Author: <a class="...lia-user-name-link..." ...>NAME</a> or just the UserName span text.
    let author = null;
    const authorMatch = chunk.match(/class="[^"]*lia-user-name-link[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/);
    if (authorMatch) author = stripTags(authorMatch[1]);
    if (!author) {
      const userNameMatch = chunk.match(/class="[^"]*UserName[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      if (userNameMatch) author = stripTags(userNameMatch[1]);
    }

    // Posted time: prefer the full timestamp in the title attribute.
    let postedTime = null;
    const titleAttrMatch = chunk.match(/<span[^>]*class="[^"]*local-(?:friendly-)?date[^"]*"[^>]*title="([^"]+)"/);
    if (titleAttrMatch) postedTime = parseRelativeTime(decodeEntities(titleAttrMatch[1]));
    if (!postedTime) {
      const relMatch = chunk.match(/<span[^>]*class="[^"]*local-(?:friendly-)?date[^"]*"[^>]*>\s*([^<]+)/);
      if (relMatch) postedTime = parseRelativeTime(relMatch[1]);
    }

    // Reply / view counts. On the recent-posts page these often aren't shown per-row,
    // so we accept 0 as default and don't fail.
    let replyCount = 0;
    const replyMatch = chunk.match(/(\d+(?:,\d+)?)\s*(?:Replies|Reply|Comment|comments?)/i);
    if (replyMatch) replyCount = parseInt(replyMatch[1].replace(/,/g, ""), 10);

    let viewCount = 0;
    const viewMatch = chunk.match(/(\d+(?:,\d+)*)\s*(?:Views|View)/i);
    if (viewMatch) viewCount = parseInt(viewMatch[1].replace(/,/g, ""), 10);

    // Board / forum name (often in an "in <board>" link after the byline).
    let board = null;
    const boardMatch = chunk.match(/\bin\s+<a[^>]*class="[^"]*lia-link-navigation[^"]*"[^>]*>([^<]+)<\/a>/);
    if (boardMatch) board = stripTags(boardMatch[1]);
    if (!board) {
      // Fall back to extracting from the URL path: /t5/<board-slug>/...
      const slugMatch = url.match(/community\.databricks\.com\/t5\/([^/]+)\//);
      if (slugMatch) board = slugMatch[1].replace(/-/g, " ");
    }

    items.push({
      title,
      url,
      author,
      board,
      posted_time: postedTime,
      reply_count: replyCount,
      view_count: viewCount,
    });
  }

  process.stdout.write(JSON.stringify({ source: "community", fetched_at: new Date().toISOString(), count: items.length, items }, null, 2));
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e.message}\n`);
  process.exit(1);
});
