# LinkedIn post cards

One static (or lightly animated) image per post. Each run copies one template to
`<run>/card.html`, replaces the sample text with the day's facts, then runs
`node scripts/render-card.mjs <run>` → `post.png` (+ `post.gif` / `post.mp4` when animated).

## Template contract (every file in this folder)

- Self-contained HTML. One root `<div id="card">` with fixed `width`/`height` in px equal to
  `<meta name="card-size" content="WxH">`. `body { margin:0 }`, nothing outside `#card`.
- Sizes: landscape `1200x800`, 16:9 `1200x675`, square `1080x1080`, portrait `1080x1350`, 4:3 `1200x900`.
- Fonts: Google Fonts `<link>` only (Inter, Poppins, JetBrains Mono, Caveat, Anton…).
- Icons: Lucide UMD pinned `https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`,
  `<i data-lucide="name">`, call `lucide.createIcons()` at the end of body.
- Databricks mark: the inline SVG in `_shared.html` (red `#FF3621`). Do not draw other vendors'
  logos; use a neutral Lucide icon plus the product name in text.
- Byline: always `Harish Mettu` / `Databricks Platform Engineer` (from `config/author.json`).
  Avatar = round badge with initials `HM` unless `config/author_photo.png` exists.
- Every text slot that could overflow gets `data-fit="<slot-name>"` and a fixed box
  (`overflow:hidden`); the renderer fails if any slot overflows. In vertically centred flex
  boxes use `justify-content: safe center` — plain `center` spills past the top edge where
  the scrollHeight check can't see it. Put `data-fit` on the element that clips
  (`overflow:hidden` / `nowrap`), not on its parent — a clipped child is invisible to the check.
- Fill guide: an HTML comment at the top lists every slot with its max characters, which parts
  repeat (e.g. 3–4 steps), and what is optional. Sample content is a real Databricks feature.
- Animation (optional): CSS `@keyframes` with `animation-delay` and `animation-fill-mode: both`,
  plus `<meta name="card-duration" content="<ms>">` (include ~2 s hold at the end). The renderer
  pauses and seeks animations, so they must be pure CSS/WAAPI (no setTimeout, no JS timers).
  The fully-finished state must look complete as a still `post.png`. No `infinite` animations
  (the still is taken by seeking far past the end, which would land mid-cycle).

## Honesty rules for card content

- Every number, limit, date and status comes from the Databricks source. No invented metrics.
- Code blocks and result tables: copy from the docs, or label them `Example` (never "Ran on …"
  unless it was actually run).
- `c01_annotated_screenshot` only with a **real** screenshot from the docs page or release
  note, downloaded into the run folder. Never fake product UI.

## Templates

See `config/templates_catalog.json` → `cards` for ids, sizes and when to use each.
