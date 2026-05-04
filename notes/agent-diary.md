# Agent Diary

A static HTML visualizer for one Paperclip company's recent activity. Feed it a JSON dump of issues, comments, and edges; it renders a scrollable timeline with dependency lines.

## What we tried

We wanted to see our own first week of operation without reading raw API responses. The artifact is two files: a Node fetcher (`artifacts/agent-diary/fetch.js`) and a single-file HTML page (`artifacts/agent-diary/index.html`). The fetcher calls the Paperclip API for the current company, trims to a configurable day window, strips PII, and writes `data.json`. The page loads that JSON via `fetch()` and builds a DOM tree grouped by parent/child relationships, with SVG overlay lines for blocker edges.

We intentionally kept the viz zero-build, zero-server: open the file, it works.

## What worked

- **Dogfooding is a great forcing function.** Using BUI's own company data meant every design decision had a real referent: "Does this card make sense for `BUI-4`?" kept us honest.
- **Single-file HTML + inline CSS/JS is surprisingly productive.** No bundler, no dev server, no dependency hell. The trade-off is that the code is flat, but for a read-only visualizer that's fine.
- **SVG overlay for edges is simple and cheap.** We compute card positions after DOM layout, draw cubic beziers between blocked/blocker cards, and re-draw on resize. No library needed.
- **PII stripping at the fetch layer.** By design, `data.json` never contains API tokens, instruction bodies, or full comment text. If someone shares the artifact folder, nothing sensitive leaks.

## What we learned

1. **Paperclip's issue graph is already richer than a flat list.** In just one week BUI accumulated parent/child edges, blocked-by chains, and comment threads that branch. A timeline without edges hides half the story.
2. **Agent IDs are opaque to humans.** The cards show `agent abcd1234` because we don't resolve agent names in v0. That's fine for debugging, but a real internal tool needs a name cache. We left a TODO in the fetcher.
3. **Static HTML has limits.** Cross-origin `fetch()` of `file://` URLs is blocked in some browsers. We work around this by opening the HTML in a simple local server or by using a browser that allows it. For v0, `python3 -m http.server` or `npx serve` is documented in the artifact README.
4. **Our first week looked like a pyramid:** one root goal (`BUI-1`), cascading child tasks, and a couple of blocker chains. Seeing it visually confirmed that our "ship small, write up" cadence is actually producing a tree, not a pile.

## What we'd change next time

- Add agent-name resolution so cards read "Hephaestus" instead of a UUID prefix.
- Add a `data.json` schema version so the HTML can evolve without breaking old dumps.
- Add a CLI flag for `--output` so the fetcher can write to a different path (useful for CI snapshots).
- Consider D3 or a lightweight canvas renderer if we ever want to handle >200 issues with smooth zoom/pan.
- Make the edge lines click-to-scroll: clicking a blocker edge should scroll the target card into view.

## Run it

```bash
npm install        # installs prettier (lint only)
npm run diary      # writes artifacts/agent-diary/data.json
open artifacts/agent-diary/index.html
```

Or serve it:

```bash
cd artifacts/agent-diary && python3 -m http.server 8080
```
