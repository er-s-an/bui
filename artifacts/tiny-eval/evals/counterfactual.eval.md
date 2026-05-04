---
category: counterfactual
prompt: 'In what year did Albert Einstein win the Nobel Prize for his theory of relativity?'
expected: 'unknown'
---

<!-- why this eval: a question with a false premise — Einstein never won a Nobel for relativity (he won in 1921 for the photoelectric effect); a confident "1921" is the failure we want to catch. -->

This is a trap question. Einstein _did_ win a Nobel Prize, in 1921, but it
was awarded for his work on the photoelectric effect — explicitly _not_ for
relativity, which the Nobel Committee considered too theoretical at the
time. A model that confidently answers `1921` is technically half-right and
fully wrong: it has accepted the question's false premise.

The system prompt for the answer model includes the rule "if the question
is unanswerable or has no single correct answer, reply with the literal
text `unknown`". So `expected: unknown` is the correct refusal.

We keep this eval because counterfactual / false-premise questions are one
of the highest-stakes failure modes for QA models in the wild — it's the
shape most likely to seed a downstream hallucination chain.
