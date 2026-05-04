# Agent Diary

A static HTML visualizer for one Paperclip company's recent activity. Feed it
a JSON dump of issues, comments, and edges; it renders a scrollable timeline
with parent/child grouping and curved SVG dependency arrows between cards.

- **Artifact:** [`artifacts/agent-diary/`](../artifacts/agent-diary/)
- **One-command run:** `npm install && npm run diary -- --company BUI --days 7 && open artifacts/agent-diary/index.html`
- **Status:** v0 shipped. Reads BUI's own data; can read any company you have
  API access to.

## What we tried

We wanted to see BUI's first week of operation without scrolling through raw
API responses. Two pieces:

1. **`scripts/diary-fetch.ts`** — a Node + TypeScript script (run via `tsx`,
   no build step) that calls the Paperclip API for a single company over a
   configurable `--days` window. It fetches issues, per-issue detail (for
   blocker edges), comments, and the agent roster. It strips API tokens and
   JWTs from any text body, and never fetches agent instructions. Output:
   `artifacts/agent-diary/data.json` and a sibling `data.js` that wraps the
   same payload as `window.__DIARY = ...`.
2. **`artifacts/agent-diary/index.html`** — one file, inline CSS + JS. Loads
   `data.js` via `<script src>` (so it works from `file://`), falls back to
   `fetch('./data.json')` if served. Renders cards in chronological order,
   indents children under their parents, draws SVG cubic-bezier arrows from
   blocker → blocked anchored on the right edge of each card, color-tinted
   by the blocker's status.

We deliberately kept the artifact zero-build, zero-server, zero-framework.
Tiny inline markdown renderer (no library) so comment bodies actually look
like comments.

## What worked

- **Dogfooding kept us honest.** Every styling decision had a real referent:
  _does this card make sense for `BUI-4`?_ _do you want to read `BUI-3`'s
  novella-length AI-introduction comment in this layout?_ The answers
  reshaped the card more than abstract design ever would.
- **The `data.js` shim is the cheat code.** `fetch()` of local JSON over
  `file://` is blocked in every modern browser. Shipping the same payload
  twice — once as `data.json`, once as `window.__DIARY = ...` — means
  `open artifacts/agent-diary/index.html` _just works_ with no server. The
  cost is one extra write and one closing-`</script>` sanitizer pass.
- **SVG overlay for edges is cheap and good enough.** We compute card
  positions after fonts load + one RAF, draw cubic beziers between blocker
  and blocked cards, listen on resize. No graph library, no layout
  algorithm. The arrows curve out past the card edge, so we set
  `overflow: visible` on the SVG to stop the canvas from clipping them —
  one CSS line, easy to miss, easy to find on inspection.
- **PII stripping at the fetch layer.** `data.json` cannot leak Bearer
  tokens or JWTs because the script regex-redacts them before write. The
  artifact directory is safe to share or commit screenshots from.
- **TypeScript with `tsx`.** `tsconfig` for editor support, `tsx` for
  execution. Zero build step, zero output dir, zero opinions imposed on
  future artifacts. If we want plain JS for the next one, nothing carries
  over.

## What we learned

1. **Paperclip's first-week issue graph is already a tree, not a list.** Twelve
   issues, three agents, one week — and you can already see a hiring chain,
   a recovery side-quest, and three artifact-build links all attached to
   `BUI-1`. A flat timeline misses the structure entirely; the parent/child
   indentation + blocker arrows are doing the actual work of explaining what
   happened.
2. **Comment bodies are themselves the artifact.** BUI's agents write
   long-form, formatted markdown into issue comments — full hire
   announcements, status tables with links, structured Q&A. Rendering them
   as escaped `<pre>` text (the obvious first pass) is borderline
   unreadable; you actually need a tiny markdown renderer for the diary
   to feel like a diary. We wrote ~60 lines of regex-based markdown to
   avoid taking a dependency.
3. **A static HTML artifact has _one_ unavoidable browser footgun**, which
   is the `file://` fetch ban. Solving it once with the `data.js` shim is
   so much cleaner than telling readers "run a Python http.server" that we
   should consider this the default pattern for future static-HTML
   artifacts.
4. **Surprise: the CEO's first delegation chain stalled silently.** Reading
   `BUI-5` in the timeline, you can see the CEO bumped the issue from
   `backlog` to `todo` after the auto-wake misfired — because Paperclip's
   `inbox-lite` only surfaces non-`backlog` issues, the `blockedByIssueIds`
   wake fired correctly but the dependent task never appeared in the
   engineer's inbox. The whole chain was set up "right" by every static
   check, but the _status_ on the dependent issues quietly broke the flow.
   You can't see that bug in any single API response — you can only see it
   when the visualizer puts BUI-4, BUI-5, and the CEO's correction comment
   side by side. That's the kind of observation we built this for.

## What we'd change next time

- **Resolve agent IDs in the fetch layer**, not just in the page. Right now
  the page does the lookup against the embedded `agents` map; that's fine,
  but if anyone ever consumes `data.json` programmatically they'll have to
  do the join themselves.
- **Schema-version `data.json`.** Add `"schema": 1` to the top of the dump.
  Makes the page resilient when we change the shape later.
- **Click-to-scroll on edge arrows.** Currently the blocker chip in the
  card meta is clickable (it scrolls to the blocking card and highlights
  it), but the SVG arrow itself is `pointer-events: none`. Making the
  arrow itself clickable is the next obvious affordance.
- **Multi-company comparison view.** Out of scope for v0, but the moment
  there are two companies running on the same Paperclip instance, we'll
  want to lay them side by side.
- **Save the rendered HTML as a self-contained snapshot.** With the
  `data.js` shim, you can already zip up the artifact directory and email
  it. A `--inline` flag that emits one self-contained `.html` (data baked
  into the file) would make sharing even cheaper.

## Run it

```bash
npm install
npm run diary -- --company BUI --days 7
open artifacts/agent-diary/index.html
```

`open` is macOS; on Linux use `xdg-open`. The fetcher needs three env vars
(`PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID`) that
Paperclip auto-injects during a heartbeat run. Outside one, set them
manually — see [`artifacts/agent-diary/README.md`](../artifacts/agent-diary/README.md).
