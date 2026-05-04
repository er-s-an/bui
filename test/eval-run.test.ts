import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, exactMatch } from '../scripts/eval-run.ts';

test('parseFrontmatter: returns empty data and full source when no frontmatter', () => {
  const src = '# just a heading\n\nbody text';
  const { data, body } = parseFrontmatter(src);
  assert.deepEqual(data, {});
  assert.equal(body, src);
});

test('parseFrontmatter: parses simple key/value pairs', () => {
  const src = [
    '---',
    'category: easy',
    'prompt: hello',
    'expected: world',
    '---',
    '',
    'why this',
  ].join('\n');
  const { data, body } = parseFrontmatter(src);
  assert.equal(data.category, 'easy');
  assert.equal(data.prompt, 'hello');
  assert.equal(data.expected, 'world');
  assert.equal(body, 'why this');
});

test('parseFrontmatter: strips single and double quotes', () => {
  const src = ['---', `prompt: "What's gold?"`, `expected: 'Au'`, '---', '', 'body'].join('\n');
  const { data } = parseFrontmatter(src);
  assert.equal(data.prompt, "What's gold?");
  assert.equal(data.expected, 'Au');
});

test('parseFrontmatter: honors \\n inside double-quoted values', () => {
  const src = ['---', 'multi: "line1\\nline2"', '---', ''].join('\n');
  const { data } = parseFrontmatter(src);
  assert.equal(data.multi, 'line1\nline2');
});

test('parseFrontmatter: skips lines that do not match key:value', () => {
  const src = ['---', '# a yaml comment-ish line', 'prompt: x', 'expected: y', '---', ''].join(
    '\n',
  );
  const { data } = parseFrontmatter(src);
  assert.equal(data.prompt, 'x');
  assert.equal(data.expected, 'y');
});

test('parseFrontmatter: preserves body whitespace except one optional leading blank line', () => {
  const src = ['---', 'prompt: x', 'expected: y', '---', '', 'first', '', 'second'].join('\n');
  const { body } = parseFrontmatter(src);
  assert.equal(body, 'first\n\nsecond');
});

test('exactMatch: case-fold and whitespace-collapse', () => {
  assert.equal(exactMatch('Au', 'au'), true);
  assert.equal(exactMatch('  Au  ', 'au'), true);
  assert.equal(exactMatch('the Nile', 'The   Nile'), true);
});

test('exactMatch: trailing punctuation is stripped on both sides', () => {
  assert.equal(exactMatch('Paris.', 'Paris'), true);
  assert.equal(exactMatch('3', '3.'), true);
  assert.equal(exactMatch('unknown!', 'unknown'), true);
});

test('exactMatch: different content does not match', () => {
  assert.equal(exactMatch('Amazon', 'Nile'), false);
  assert.equal(exactMatch('1921', 'unknown'), false);
});
