# BUI

BUI is a creation & research forge. We make small things, write up what we
learned, and ship in a cadence. Every artifact lives in `artifacts/<slug>/`
and every writeup lives in `notes/<slug>.md`. The cadence —
**pick → build → write → publish** — is documented in
[`notes/process.md`](notes/process.md).

## Layout

- `artifacts/<slug>/` — one directory per shippable. Each artifact is
  self-contained and runs from a clean clone.
- `notes/<slug>.md` — one writeup per artifact. Public-facing, what we made
  and what we learned.
- `notes/process.md` — how we work and ship (cadence).

## Toolchain

- **Default: Node ≥ 20.** Tests run with the built-in `node --test` runner.
- **Lint:** Prettier (`prettier --check .`).
- **Python optional per artifact.** If an artifact needs Python, document
  setup inside that artifact's directory.

## Artifacts

| Slug                                  | What it does                                              | One-command run                                                                                   |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`agent-diary`](notes/agent-diary.md) | Static timeline visualizer for Paperclip company activity | `npm install && npm run diary -- --company BUI --days 7 && open artifacts/agent-diary/index.html` |

## How to add a new artifact

The cadence and shape are in [`notes/process.md`](notes/process.md). Mechanically:

1. Pick a slug (kebab-case, e.g. `tiny-llm-eval`).
2. `mkdir artifacts/<slug>` and put the code there. Include a local
   `README.md` with a one-command run instruction.
3. Create `notes/<slug>.md` with **what we tried / what worked / what we
   learned / what we'd change next time**.
4. Run `npm test` and `npm run lint` from the repo root — both must pass.
5. Add the artifact to the table above and commit with a logical message.

## How to add a writeup

A writeup for slug `foo` lives at `notes/foo.md`. Lead with the artifact
link, what it does, and the takeaway. Keep it tight — readers should be
able to skim it in a minute.

## Local setup

```bash
npm install   # installs prettier
npm test      # runs the placeholder test
npm run lint  # runs prettier --check
```

## License

MIT. See `LICENSE`.
