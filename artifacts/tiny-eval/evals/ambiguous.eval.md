---
category: ambiguous
prompt: 'What is the longest river in the world?'
expected: 'Nile'
---

<!-- why this eval: a question with two defensible answers (Nile, Amazon) — exposes how the judge handles "expected" ≠ "model answer" when both are correct. -->

The Nile is the textbook answer (~6,650 km) but a 2007 Brazilian expedition
argued the Amazon is longer (~6,992 km), and the dispute is unresolved.
Either answer is defensible.

We pick `Nile` as `expected` because that's still the dominant convention,
which means the judge fallback _will_ get triggered if the model says
`Amazon`. That's the point: this eval is more about watching the **judge**
make a sensible call on a contested fact than about pinning down the
"correct" answer. A passing run on either Nile or Amazon is a passing run.
