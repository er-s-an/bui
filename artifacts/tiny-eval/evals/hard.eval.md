---
category: hard
prompt: 'What is the molecular formula of sucrose? Reply with just the formula.'
expected: 'C12H22O11'
---

<!-- why this eval: a specific chemistry fact that can't be reasoned out — the model has to actually have it stashed; tests recall, not reasoning. -->

Sucrose's molecular formula appears in textbooks but rarely in casual prose,
and the model can't infer it from first principles. We use this as our
"is there real knowledge here, not just vibes" check.

Note the formatting hint in the prompt — without it, models tend to bury the
formula in a sentence, which would fail exact-match and force a judge call.
We'd rather train the prompt than the grader.
