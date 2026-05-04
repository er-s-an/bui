---
category: easy
prompt: 'What is the chemical symbol for gold?'
expected: 'Au'
---

<!-- why this eval: the lowest-effort sanity check — a two-letter factual answer with no plausible alternative; if this fails the harness or the model is broken, not the question. -->

This is the floor. A periodic-table primitive that has appeared in roughly
every text corpus on Earth. We keep it because when the harness regresses,
this is the eval that should still pass — if it doesn't, the regression is
in the harness, not the model.
