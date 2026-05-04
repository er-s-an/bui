# Process

How BUI ships. A working agreement, not a manifesto.

## The cycle

**pick → build → write → publish.** One artifact in flight at a time.

| Step    | Rough time-box | Output                                                                                                                                                                                    |
| ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pick    | ~30 min        | A spec issue under [BUI-1](/BUI/issues/BUI-1) titled `<n>th artifact: <name>` with a one-paragraph spec, 3–5 acceptance bullets, and an explicit out-of-scope list. Assigned to yourself. |
| build   | 1–3 days       | Code in `artifacts/<slug>/`. A clean clone runs it with one command.                                                                                                                      |
| write   | 30–60 min      | `notes/<slug>.md` in the shape: **what we tried / what worked / what we learned / what we'd change next time**. At least one observation that surprised us.                               |
| publish | ~15 min        | Top-level `README.md` artifact table updated with the run command. Logical commit. Commit message ends with `Co-Authored-By: Paperclip <noreply@paperclip.ing>`.                          |

If `build` overruns 3 days, stop and split the artifact, not the cadence.

## One issue per artifact

The spec issue is also the ship issue. It opens when you pick, and closes when all three are true:

1. code merged into `main`,
2. `notes/<slug>.md` committed,
3. top-level `README.md` updated with the run command.

Don't create a separate "build & ship" sub-issue unless the build genuinely needs parallel children. We tried that for artifact #1 and ended up with two spec-shaped issues for the same artifact; the middle one drifted past ship.

## Dependencies between artifacts

Cross-artifact blockers go in `blockedByIssueIds`. Not in description prose. Not as `parentId` alone. Dependent issues default to `blocked`, not `backlog` — Paperclip auto-wakes the assignee when the chain resolves; `backlog` keeps it out of the inbox and the chain stalls silently.

## Pain from the first cycle

Naming what hurt so the next cycle is faster.

- **Two spec-shaped issues for one artifact.** Artifact #1 had a `pick + scope` task ([BUI-5](/BUI/issues/BUI-5)), a child spec issue ([BUI-12](/BUI/issues/BUI-12)), _and_ a `build & ship` issue ([BUI-6](/BUI/issues/BUI-6)) that re-stated the spec. The middle one drifted open past ship. Going forward: one issue per artifact, opened by `pick` and closed by `publish`.
- **`backlog` instead of `blocked`.** The first chain wired dependents as `backlog` + `parentId`; the wake fired but the dependents stayed out of the inbox. CEO had to bump them manually. Going forward: `blocked` + `blockedByIssueIds` for any cross-issue dependency.
- **No agreed writeup shape until after the fact.** The artifact-#1 writeup turned out fine, but we improvised the structure. The four-section shape above is now the agreement.

## What "shipped" means

A clean clone runs the artifact in one command. No "you need to install X first" footnotes outside the artifact's own README. If a teammate cloned us right now and ran the documented command, they should see something — otherwise it is not shipped.
