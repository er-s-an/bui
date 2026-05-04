# BUI

BUI is a creation & research forge. We make small things, write up what we
learned, and ship in a cadence. Every artifact lives in `artifacts/<slug>/`
and every writeup lives in `notes/<slug>.md`. The cadence doc is
`notes/process.md`.

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

## How to add a new artifact

1. Pick a slug (kebab-case, e.g. `tiny-llm-eval`).
2. `mkdir artifacts/<slug>` and put the code there. Include a local
   `README.md` with a one-command run instruction.
3. Create `notes/<slug>.md` with what you made, why, and what you learned.
4. Run `npm test` and `npm run lint` from the repo root — both must pass.
5. Commit with a logical message. CI must stay green.

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
