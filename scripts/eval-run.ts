#!/usr/bin/env node
/**
 * scripts/eval-run.ts
 *
 * Tiny eval harness for short factual question answering.
 *
 * Walks a directory of `*.eval.md` files (YAML frontmatter with `prompt:` and
 * `expected:`; body explains _why this eval exists_), calls Claude via the
 * official `@anthropic-ai/sdk` for each, grades with exact-match first then
 * a model-judge fallback, and writes a Markdown report.
 *
 * Usage:
 *   npm run eval -- --dir artifacts/tiny-eval/evals
 *   npm run eval -- --dir artifacts/tiny-eval/evals --out artifacts/tiny-eval/report.md
 *   npm run eval -- --dir artifacts/tiny-eval/evals --model claude-sonnet-4-5
 *
 * Env (required):
 *   ANTHROPIC_API_KEY   API key for the Anthropic SDK
 *
 * Exits 0 if every eval passes (exact-match OR judge=pass), 1 otherwise.
 *
 * Out of scope (by design): parallel execution, retries, multi-model
 * orchestration, embedding grading, web UI, multi-mode grading.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// ---- CLI parsing -----------------------------------------------------------

interface Args {
  dir: string;
  out: string;
  model: string;
  judge: string;
  maxTokens: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_JUDGE = 'claude-haiku-4-5-20251001';

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--dir' && next) {
      args.dir = next;
      i++;
    } else if (a === '--out' && next) {
      args.out = next;
      i++;
    } else if (a === '--model' && next) {
      args.model = next;
      i++;
    } else if (a === '--judge' && next) {
      args.judge = next;
      i++;
    } else if (a === '--max-tokens' && next) {
      args.maxTokens = Number(next);
      i++;
    } else if (a === '--help' || a === '-h') {
      printUsageAndExit(0);
    } else if (a.startsWith('--')) {
      console.error(`unknown flag: ${a}`);
      printUsageAndExit(2);
    }
  }
  if (!args.dir) {
    args.dir = 'artifacts/tiny-eval/evals';
  }
  if (!args.out) {
    args.out = 'artifacts/tiny-eval/report.md';
  }
  if (!args.model) args.model = DEFAULT_MODEL;
  if (!args.judge) args.judge = DEFAULT_JUDGE;
  if (
    typeof args.maxTokens !== 'number' ||
    !Number.isFinite(args.maxTokens) ||
    args.maxTokens <= 0
  ) {
    args.maxTokens = 256;
  }
  return args as Args;
}

function printUsageAndExit(code: number): never {
  console.error(
    [
      'Usage: npm run eval -- [--dir DIR] [--out FILE] [--model NAME] [--judge NAME]',
      '',
      `  --dir         Directory of *.eval.md files (default artifacts/tiny-eval/evals).`,
      `  --out         Markdown report path (default artifacts/tiny-eval/report.md).`,
      `  --model       Answer model id (default ${DEFAULT_MODEL}).`,
      `  --judge       Judge model id used only on exact-match miss (default ${DEFAULT_JUDGE}).`,
      `  --max-tokens  Max tokens for answer + judge calls (default 256).`,
    ].join('\n'),
  );
  process.exit(code);
}

// ---- Frontmatter parser (hand-rolled, no dep) ------------------------------

/**
 * Strict mini-YAML for our eval files. Supports:
 *   - file MUST start with `---` on its own line, end with `---` on its own line
 *   - one `key: value` per line; keys are [A-Za-z_][A-Za-z0-9_]*
 *   - values are everything after `: ` on the line; surrounding "..." or '...'
 *     are stripped; `\n` and `\"` and `\\` escapes are honored inside quotes
 *   - no nested objects, no lists, no multiline scalars (`|`, `>`)
 *
 * Returns the parsed key/value map plus the body (everything after the closing
 * `---`, with one optional leading blank line stripped).
 */
export function parseFrontmatter(source: string): {
  data: Record<string, string>;
  body: string;
} {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { data: {}, body: source };
  }
  const data: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      i++;
      break;
    }
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const isDoubleQuoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.length >= 2 && value.startsWith("'") && value.endsWith("'");
    if (isDoubleQuoted) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (isSingleQuoted) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  let body = lines.slice(i).join('\n');
  if (body.startsWith('\n')) body = body.slice(1);
  return { data, body };
}

// ---- Eval discovery + grading ---------------------------------------------

interface EvalSpec {
  slug: string;
  path: string;
  prompt: string;
  expected: string;
  category: string; // optional metadata, free-form
  body: string; // why-this-eval explainer
}

async function loadEvals(dir: string): Promise<EvalSpec[]> {
  const absDir = resolve(process.cwd(), dir);
  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch (err) {
    throw new Error(
      `cannot read --dir ${dir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const evalFiles = entries.filter((e) => e.endsWith('.eval.md')).sort();
  if (evalFiles.length === 0) {
    throw new Error(`no *.eval.md files in ${dir}`);
  }
  const specs: EvalSpec[] = [];
  for (const file of evalFiles) {
    const path = resolve(absDir, file);
    const raw = await readFile(path, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    if (!data.prompt || !data.expected) {
      throw new Error(
        `${file}: frontmatter must include both 'prompt:' and 'expected:' (got keys: ${
          Object.keys(data).join(', ') || 'none'
        })`,
      );
    }
    specs.push({
      slug: basename(file, '.eval.md'),
      path,
      prompt: data.prompt,
      expected: data.expected,
      category: data.category ?? '',
      body: body.trim(),
    });
  }
  return specs;
}

function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '');
}

export function exactMatch(answer: string, expected: string): boolean {
  return normalizeAnswer(answer) === normalizeAnswer(expected);
}

// ---- Model calls -----------------------------------------------------------

const ANSWER_SYSTEM = [
  'You are answering short factual questions for an evaluation harness.',
  'Reply with the answer only — no preamble, no explanation, no markdown.',
  'Use the shortest correct phrasing. If the question is unanswerable or has',
  'no single correct answer, reply with the literal text "unknown".',
].join(' ');

const JUDGE_SYSTEM = [
  'You are a strict eval judge. You will be given a question, a reference',
  'expected answer, and a model answer. Decide whether the model answer is',
  'semantically equivalent to the expected answer for the purposes of a',
  'short-factual-QA eval (case, punctuation, and minor phrasing differences',
  'are fine; different facts are not).',
  '',
  'Reply with exactly one line, in this format:',
  '  VERDICT: pass|fail',
  '  REASON: <one sentence, <=140 chars>',
].join('\n');

interface AnswerResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

async function runAnswer(
  client: Anthropic,
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<AnswerResult> {
  const t0 = Date.now();
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: ANSWER_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  const latencyMs = Date.now() - t0;
  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();
  return {
    text,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    latencyMs,
  };
}

interface JudgeResult {
  verdict: 'pass' | 'fail';
  reason: string;
  inputTokens: number;
  outputTokens: number;
}

async function runJudge(
  client: Anthropic,
  judgeModel: string,
  spec: EvalSpec,
  answer: string,
  maxTokens: number,
): Promise<JudgeResult> {
  const userMsg = [
    `Question: ${spec.prompt}`,
    `Expected: ${spec.expected}`,
    `Model answer: ${answer}`,
  ].join('\n');
  const resp = await client.messages.create({
    model: judgeModel,
    max_tokens: maxTokens,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
  const verdictMatch = text.match(/VERDICT:\s*(pass|fail)/i);
  const reasonMatch = text.match(/REASON:\s*(.+)/i);
  const verdict: 'pass' | 'fail' = verdictMatch && /pass/i.test(verdictMatch[1]) ? 'pass' : 'fail';
  const reason = (reasonMatch?.[1] ?? text).trim().slice(0, 200);
  return {
    verdict,
    reason,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
  };
}

// ---- Report writing --------------------------------------------------------

interface Verdict {
  spec: EvalSpec;
  answer: string;
  exact: boolean;
  judge: 'pass' | 'fail' | 'skipped';
  judgeReason: string;
  pass: boolean;
  answerInputTokens: number;
  answerOutputTokens: number;
  judgeInputTokens: number;
  judgeOutputTokens: number;
  latencyMs: number;
}

function renderReport(args: {
  generatedAt: string;
  model: string;
  judge: string;
  verdicts: Verdict[];
}): string {
  const { generatedAt, model, judge, verdicts } = args;
  const passed = verdicts.filter((v) => v.pass).length;
  const total = verdicts.length;
  const totalIn = verdicts.reduce((s, v) => s + v.answerInputTokens + v.judgeInputTokens, 0);
  const totalOut = verdicts.reduce((s, v) => s + v.answerOutputTokens + v.judgeOutputTokens, 0);

  const lines: string[] = [];
  lines.push(`# tiny-eval report`);
  lines.push('');
  lines.push(`- generated: ${generatedAt}`);
  lines.push(`- answer model: \`${model}\``);
  lines.push(`- judge model: \`${judge}\` (only invoked on exact-match miss)`);
  lines.push(`- result: **${passed}/${total} passed**`);
  lines.push(`- token usage: ${totalIn} in / ${totalOut} out (answer + judge combined)`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| slug | exact | judge | pass | latency (ms) |');
  lines.push('| ---- | ----- | ----- | ---- | ------------ |');
  for (const v of verdicts) {
    lines.push(
      `| \`${v.spec.slug}\` | ${v.exact ? 'pass' : 'fail'} | ${v.judge} | ${
        v.pass ? '✓' : '✗'
      } | ${v.latencyMs} |`,
    );
  }
  lines.push('');

  for (const v of verdicts) {
    lines.push(`## ${v.spec.slug}`);
    lines.push('');
    if (v.spec.category) lines.push(`_category: ${v.spec.category}_`);
    if (v.spec.body) lines.push(v.spec.body);
    lines.push('');
    lines.push(`**Prompt:** ${v.spec.prompt}`);
    lines.push('');
    lines.push(`**Expected:** \`${v.spec.expected}\``);
    lines.push('');
    lines.push(`**Got:** \`${v.answer.replace(/`/g, "'")}\``);
    lines.push('');
    lines.push(`- exact-match: **${v.exact ? 'pass' : 'fail'}**`);
    if (v.judge === 'skipped') {
      lines.push(`- judge: skipped (exact match passed)`);
    } else {
      lines.push(`- judge: **${v.judge}** — ${v.judgeReason}`);
    }
    lines.push(
      `- usage: answer ${v.answerInputTokens}/${v.answerOutputTokens} tok, judge ${v.judgeInputTokens}/${v.judgeOutputTokens} tok, latency ${v.latencyMs}ms`,
    );
    lines.push('');
  }
  return lines.join('\n');
}

// ---- Main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is required.');
    process.exit(2);
  }

  const specs = await loadEvals(args.dir);
  console.error(`# loaded ${specs.length} eval(s) from ${args.dir}`);
  console.error(`# answer model: ${args.model}`);
  console.error(`# judge model:  ${args.judge}`);

  const client = new Anthropic({ apiKey });

  const verdicts: Verdict[] = [];
  for (const spec of specs) {
    process.stderr.write(`# running ${spec.slug} ... `);
    const ans = await runAnswer(client, args.model, spec.prompt, args.maxTokens);
    const exact = exactMatch(ans.text, spec.expected);

    let judgeVerdict: 'pass' | 'fail' | 'skipped' = 'skipped';
    let judgeReason = '';
    let judgeIn = 0;
    let judgeOut = 0;
    if (!exact) {
      const j = await runJudge(client, args.judge, spec, ans.text, args.maxTokens);
      judgeVerdict = j.verdict;
      judgeReason = j.reason;
      judgeIn = j.inputTokens;
      judgeOut = j.outputTokens;
    }
    const pass = exact || judgeVerdict === 'pass';
    process.stderr.write(`${pass ? 'pass' : 'fail'} (${ans.latencyMs}ms)\n`);

    verdicts.push({
      spec,
      answer: ans.text,
      exact,
      judge: judgeVerdict,
      judgeReason,
      pass,
      answerInputTokens: ans.inputTokens,
      answerOutputTokens: ans.outputTokens,
      judgeInputTokens: judgeIn,
      judgeOutputTokens: judgeOut,
      latencyMs: ans.latencyMs,
    });
  }

  const report = renderReport({
    generatedAt: new Date().toISOString(),
    model: args.model,
    judge: args.judge,
    verdicts,
  });

  const outPath = resolve(process.cwd(), args.out);
  await writeFile(outPath, report, 'utf8');
  console.error(`# wrote ${outPath}`);

  const passed = verdicts.filter((v) => v.pass).length;
  const total = verdicts.length;
  console.log(`tiny-eval: ${passed}/${total} passed (model=${args.model}, judge=${args.judge})`);
  for (const v of verdicts) {
    console.log(`  ${v.pass ? 'PASS' : 'FAIL'}  ${v.spec.slug}  exact=${v.exact} judge=${v.judge}`);
  }
  process.exit(passed === total ? 0 : 1);
}

// Only run main() when invoked as the entry point (e.g. `tsx scripts/eval-run.ts`).
// When this module is imported by tests we don't want a side-effect API call.
const invokedAsScript = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}
