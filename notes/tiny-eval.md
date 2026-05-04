# Tiny Eval

A markdown-driven eval harness for short-factual question answering. Drop a
`*.eval.md` file in a directory, run one command, get a graded report. The
grader is exact-match first and falls back to a model judge only when the
answer string doesn't normalize to the expected one.

- **Artifact:** [`artifacts/tiny-eval/`](../artifacts/tiny-eval/)
- **One-command run:** `npm install && ANTHROPIC_API_KEY=... npm run eval`
- **Status:** v0 shipped. 5 sample evals (easy / hard / ambiguous /
  known-failure / counterfactual). 4/5 pass on `claude-sonnet-4-5` _and_ on
  `claude-haiku-4-5-20251001`.

## What we tried

We wanted "writing an eval" to feel like writing a markdown note — not like
configuring a framework. Two pieces:

1. **`*.eval.md` files.** YAML frontmatter holds the only fields the harness
   reads (`prompt:`, `expected:`, optional `category:`). The body of the file
   explains _why this eval exists_ — it never reaches the model, but it _does_
   get embedded into the markdown report so the writeup-of-record always
   includes the rationale. We hand-rolled a ~30-line frontmatter parser
   instead of taking a YAML dependency: we want one `key: value` per line, no
   nested structure, no surprises.
2. **`scripts/eval-run.ts`** — a Node + TypeScript script (run via `tsx`, no
   build step) that walks the eval dir, calls Claude via the official
   `@anthropic-ai/sdk`, grades each answer, and writes
   `artifacts/tiny-eval/report.md`. Exit code is 0 if every eval passes, 1
   otherwise — so you can wire it into CI later without changing the harness.

Grading is two-stage:

- **Exact-match** after a normalize pass (case-fold, trim, whitespace
  collapse, trailing punctuation strip). This handles `"Au"` vs `"au"`,
  `"Paris."` vs `"Paris"`, and the long tail of trivial-formatting noise.
- **Judge fallback** is invoked _only_ when exact-match fails. We pass the
  question, expected, and model answer to a separate (cheap) model with a
  strict `VERDICT: pass|fail` / `REASON: ...` format and parse the verdict
  out. The judge is for semantic equivalence (different phrasing, same fact),
  not for letting the model grade itself friendly.

Five sample evals, picked to span the failure surface, not the trivia surface:

| Slug             | What it tests                                                       |
| ---------------- | ------------------------------------------------------------------- |
| `easy`           | Sanity floor (`Au` for gold). If this fails, the harness is broken. |
| `hard`           | Recall, not reasoning (sucrose's molecular formula).                |
| `ambiguous`      | Two defensible answers (Nile vs Amazon) — exercises the judge.      |
| `known-failure`  | Tokenization meme (Rs in "strawberry") — guard against regression.  |
| `counterfactual` | False-premise trap (Einstein's Nobel "for relativity").             |

## What worked

- **Frontmatter as the input format.** Eval files are diffable, grep-able,
  and explain themselves. The body — "_why this eval exists_" — turns out
  to be the highest-value field on the file, even though the harness only
  uses it as report decoration. Future-us will read `counterfactual.eval.md`
  and immediately know what failure mode it's catching.
- **Two-stage grading is the right shape for short factual QA.** On both
  models we ran, four of five evals exact-matched on the first try. The
  judge only fires on the one eval that genuinely needs it (the
  counterfactual), which means the per-run judge cost is one extra API call,
  not five. Total cost on our default run: under half a cent.
- **Entry-point guard.** The script doubles as a library (we re-import
  `parseFrontmatter` and `exactMatch` from the test file). Wrapping `main()`
  in `if (fileURLToPath(import.meta.url) === resolve(process.argv[1]))` keeps
  the import path side-effect-free. Without this, `npm test` ran the live API.
  More on that in the next section.
- **Single-file harness.** `scripts/eval-run.ts` is one file, ~470 lines
  with JSDoc and report rendering inline. There's no plugin system, no
  config object, no runner abstraction. Adding an eval is one `cp` and a
  text edit. Adding a feature is editing one file.

## What we learned

1. **Surprise: zero answer variance across two model snapshots.** We ran the
   same five evals on `claude-sonnet-4-5` and `claude-haiku-4-5-20251001`
   back-to-back. Every single answer string was byte-identical: `Au`, `Nile`,
   `C12H22O11`, `3`, `1921`. We expected the smaller / faster model to
   _diverge_ on at least the trap question — instead the two snapshots gave
   the same five strings in the same order, with nothing in between to
   distinguish them on this set. The honest read: short-factual QA at this
   difficulty is a saturated benchmark; if you want signal between Claude
   tiers, you need harder evals.
2. **Both models accept the false premise on the counterfactual.** Both
   answer `1921` to "what year did Einstein win the Nobel for relativity?"
   The system prompt explicitly tells them to reply `unknown` for
   unanswerable questions. Both ignore that and pattern-match on "Einstein
   Nobel year." The eval is doing its job, the models are losing on it
   together, and the judge correctly catches it ("photoelectric effect, not
   relativity"). This is the single most useful eval slot in the set,
   because the failure is shared across the lineup we'd actually ship.
3. **Test imports of script files are an unguarded foot-gun.** Our first
   `npm test` run silently fired five live API calls because the test file
   imports `parseFrontmatter` from `scripts/eval-run.ts`, which executed
   `main()` as a top-level side effect. The unit tests passed, but the test
   process exited 1 because `main()` ran the real eval suite and the
   counterfactual failed. The fix is the entry-point guard described above;
   the lesson is _put the guard in from the first commit when a script-file
   has exports_.
4. **`input_tokens` reported by the SDK isn't a stable cost signal between
   runs.** On run 2 the per-eval `input_tokens` came back as `0` for several
   evals. That's not a bug in the report — it's prompt caching kicking in
   on the API side because the system prompt and user content are
   byte-identical between back-to-back runs. The on-the-wire bill is real;
   the field name we keyed on is just incomplete (we'd need
   `cache_read_input_tokens` to total it). Our cost-per-run note ("under
   half a cent") is true for the first run. Subsequent runs of the same
   evals will be cheaper than our report claims.
5. **Latency is a wash at this output size.** Haiku-4-5 is supposedly the
   faster model, but on these 5-token answers, the per-call latency is
   within noise of Sonnet-4-5: 600–1500 ms either way, with the variance
   inside a single model wider than the variance between models. At small
   output sizes, request setup and network round-trip dominate.

## What we'd change next time

- **Surface `cache_read_input_tokens` and `cache_creation_input_tokens`** in
  the report so the cost line is honest on repeat runs.
- **Add a `--n N` repeats flag.** Right now we run each eval once. To catch
  intra-model variance (sampling instability on borderline questions) we
  want each eval ×3 and a per-eval pass-rate. Out of scope for v0 but
  obvious next move once we have evals that aren't deterministic-trivia.
- **Auto-run on a second model.** A `--compare model-a,model-b` flag that
  produces a side-by-side report would skip the manual diff step we did for
  this writeup. It's also the only way the surprise-zero-variance finding
  would be visible to a future contributor without re-doing our experiment.
- **Add at least one harder eval.** Counterfactual is the only one with
  meaningful signal on a frontier model right now; everything else is
  noise-free `pass`. Ideas: a date-arithmetic question, a multi-hop fact
  ("born in country whose flag has..."), or a numeric estimation with a
  defended range.
- **Decide on parallelism.** v0 runs serially because that's what the
  acceptance criteria called for and because it keeps the live progress log
  readable. With 50+ evals we'll want bounded parallelism — but that wants a
  real plan around rate limits, not a drive-by addition.

## Run it

```bash
npm install
ANTHROPIC_API_KEY=... npm run eval
```

The report lands at `artifacts/tiny-eval/report.md`. Stdout shows pass/fail
per eval and a one-liner summary. Exit code is 0 if everything passes, 1
otherwise.

Other knobs (all optional):

```bash
npm run eval -- --dir my/evals --out report.md \
  --model claude-sonnet-4-5 \
  --judge claude-haiku-4-5-20251001
```

See [`artifacts/tiny-eval/README.md`](../artifacts/tiny-eval/README.md) for
the full flag list, eval-file shape, and out-of-scope notes.
