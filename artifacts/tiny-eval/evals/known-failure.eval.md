---
category: known-failure
prompt: 'How many times does the letter R appear in the word "strawberry"? Reply with just a digit.'
expected: '3'
---

<!-- why this eval: the canonical token-vs-character failure mode — older LLMs reliably said 2; modern Claude usually gets it right, so it doubles as a "have we regressed" guard. -->

Letter counting in tokenized models is the textbook example of a class of
problems where the model's training distribution shape doesn't line up with
the question's mechanics. "How many Rs in strawberry?" became a meme
because pre-2024 models confidently said `2`.

We include it to:

1. Sanity-check that the current snapshot still gets it (most do, now).
2. Have a known-shape failure on hand if we ever swap to a smaller / older
   model — we want to _see_ the regression happen on this slot, not
   discover it three evals later.

If this one ever flips to fail on a current frontier model, that's a real
signal worth investigating, not a noisy false alarm.
