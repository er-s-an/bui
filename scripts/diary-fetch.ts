#!/usr/bin/env node
/**
 * scripts/diary-fetch.ts
 *
 * Fetches one Paperclip company's recent activity (issues + comments + edges)
 * and writes it to artifacts/agent-diary/data.json (+ data.js inline copy).
 *
 * Usage:
 *   npm run diary -- --company BUI --days 7
 *   npm run diary -- --company BUI --days 7 --out artifacts/agent-diary
 *
 * Env (required):
 *   PAPERCLIP_API_URL  e.g. http://127.0.0.1:3100
 *   PAPERCLIP_API_KEY  bearer token (run JWT during heartbeats; static key otherwise)
 *   PAPERCLIP_COMPANY_ID  uuid of the company you have access to
 *
 * The script verifies that PAPERCLIP_COMPANY_ID matches --company by checking
 * the company's `issuePrefix`.
 *
 * Output schema (data.json):
 *   {
 *     "company":     { "id", "name", "issuePrefix", "createdAt" },
 *     "generatedAt": "<iso>",
 *     "windowDays":  <int>,
 *     "since":       "<iso>",
 *     "agents":      { "<agentId>": { "id", "name", "role", "urlKey" } },
 *     "issues":      [ Issue, ... ]   // sorted by createdAt asc
 *   }
 *
 *   Issue:
 *     { "id", "identifier", "title", "description", "status", "priority",
 *       "parentId" | null,
 *       "assigneeAgentId" | null, "createdByAgentId" | null,
 *       "createdAt", "updatedAt", "completedAt" | null, "cancelledAt" | null,
 *       "blockedByIds": [ <issueId>, ... ],
 *       "comments": [ Comment, ... ]   // sorted by createdAt asc
 *     }
 *
 *   Comment:
 *     { "id", "authorAgentId" | null, "body", "createdAt", "createdByRunId" | null }
 *
 * PII-light: we deliberately drop adapter overrides, execution workspace
 * settings, user-id columns, and run audit metadata beyond run id. We never
 * fetch agent instructions. Comment/issue bodies are scanned for obvious
 * Bearer/JWT tokens and redacted.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

// ---- CLI parsing -----------------------------------------------------------

interface Args {
  company: string;
  days: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--company' && next) {
      args.company = next;
      i++;
    } else if (a === '--days' && next) {
      args.days = Number(next);
      i++;
    } else if (a === '--out' && next) {
      args.out = next;
      i++;
    } else if (a === '--help' || a === '-h') {
      printUsageAndExit(0);
    } else if (a.startsWith('--')) {
      console.error(`unknown flag: ${a}`);
      printUsageAndExit(2);
    }
  }
  if (!args.company) {
    console.error('missing --company <PREFIX>');
    printUsageAndExit(2);
  }
  if (typeof args.days !== 'number' || !Number.isFinite(args.days) || args.days <= 0) {
    args.days = 7;
  }
  if (!args.out) {
    args.out = 'artifacts/agent-diary';
  }
  return args as Args;
}

function printUsageAndExit(code: number): never {
  console.error(
    [
      'Usage: npm run diary -- --company <PREFIX> [--days N] [--out DIR]',
      '',
      '  --company  Issue prefix of the company to dump (e.g. BUI). Must match',
      '             the company that PAPERCLIP_COMPANY_ID points at.',
      '  --days     Time window in days (default 7).',
      '  --out      Output directory (default artifacts/agent-diary).',
    ].join('\n'),
  );
  process.exit(code);
}

// ---- HTTP ------------------------------------------------------------------

interface HttpClient {
  get<T>(path: string): Promise<T>;
}

function makeClient(baseUrl: string, apiKey: string): HttpClient {
  return {
    async get<T>(path: string): Promise<T> {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GET ${path} -> ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
      }
      return (await res.json()) as T;
    },
  };
}

// ---- Types we care about (loose; the API may return more fields) -----------

interface RawCompany {
  id: string;
  name: string;
  issuePrefix: string;
  createdAt: string;
}

interface RawAgent {
  id: string;
  name: string;
  role: string;
  urlKey: string;
}

interface RawIssueListItem {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  parentId: string | null;
  assigneeAgentId: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

interface RawIssueDetail extends RawIssueListItem {
  blockedBy: Array<{ id: string }>;
}

interface RawComment {
  id: string;
  authorAgentId: string | null;
  body: string;
  createdAt: string;
  createdByRunId: string | null;
}

// ---- Redaction --------------------------------------------------------------

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g;

function redactSecrets(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(BEARER_PATTERN, 'Bearer [redacted]').replace(JWT_PATTERN, '[jwt redacted]');
}

// ---- Main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiKey = process.env.PAPERCLIP_API_KEY;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;

  if (!apiUrl || !apiKey || !companyId) {
    console.error(
      'Missing PAPERCLIP env. Need PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID.',
    );
    process.exit(2);
  }

  const http = makeClient(apiUrl.replace(/\/$/, ''), apiKey);

  // 1. Resolve and verify company.
  const company = await http.get<RawCompany>(`/api/companies/${companyId}`);
  if (company.issuePrefix !== args.company) {
    console.error(
      `--company ${args.company} but PAPERCLIP_COMPANY_ID resolves to issuePrefix ${company.issuePrefix}.`,
    );
    console.error(
      `If you mean ${company.issuePrefix}, rerun with --company ${company.issuePrefix}.`,
    );
    process.exit(2);
  }
  console.error(`# company: ${company.name} (${company.issuePrefix})`);

  // 2. Fetch agents (for name/role lookup).
  const rawAgents = await http.get<RawAgent[]>(`/api/companies/${companyId}/agents`);
  const agents: Record<string, { id: string; name: string; role: string; urlKey: string }> = {};
  for (const a of rawAgents) {
    agents[a.id] = { id: a.id, name: a.name, role: a.role, urlKey: a.urlKey };
  }
  console.error(`# agents: ${rawAgents.length}`);

  // 3. Fetch issues, filter by window.
  const since = new Date(Date.now() - args.days * 86_400_000);
  const sinceIso = since.toISOString();
  // Pull a generous limit; v0 is small. Increase if BUI grows past this.
  const allIssues = await http.get<RawIssueListItem[]>(
    `/api/companies/${companyId}/issues?limit=200`,
  );
  // Window: include issues with any updatedAt or createdAt within the window.
  const inWindow = allIssues.filter((i) => {
    const t = Date.parse(i.updatedAt) || Date.parse(i.createdAt);
    return Number.isFinite(t) && t >= since.getTime();
  });
  console.error(
    `# issues: ${inWindow.length} of ${allIssues.length} in window (since ${sinceIso})`,
  );

  // 4. Per issue: fetch detail (for blockedBy) + comments.
  const issues = await Promise.all(
    inWindow.map(async (i) => {
      const [detail, rawComments] = await Promise.all([
        http.get<RawIssueDetail>(`/api/issues/${i.id}`),
        http.get<RawComment[]>(`/api/issues/${i.id}/comments?limit=200`),
      ]);

      const comments = [...rawComments]
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((c) => ({
          id: c.id,
          authorAgentId: c.authorAgentId,
          body: redactSecrets(c.body),
          createdAt: c.createdAt,
          createdByRunId: c.createdByRunId ?? null,
        }));

      return {
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        description: redactSecrets(i.description),
        status: i.status,
        priority: i.priority,
        parentId: i.parentId,
        assigneeAgentId: i.assigneeAgentId,
        createdByAgentId: i.createdByAgentId,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        completedAt: i.completedAt,
        cancelledAt: i.cancelledAt,
        blockedByIds: (detail.blockedBy ?? []).map((b) => b.id),
        comments,
      };
    }),
  );

  // Sort issues by createdAt ascending — that's the timeline order.
  issues.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const out = {
    company: {
      id: company.id,
      name: company.name,
      issuePrefix: company.issuePrefix,
      createdAt: company.createdAt,
    },
    generatedAt: new Date().toISOString(),
    windowDays: args.days,
    since: sinceIso,
    agents,
    issues,
  };

  // 5. Write data.json and data.js.
  // data.js is a `window.__DIARY = ...` shim so the static HTML can be opened
  // directly from disk (file://) where browser fetch() of local JSON is blocked.
  const outDir = resolve(process.cwd(), args.out);
  await mkdir(outDir, { recursive: true });

  const json = JSON.stringify(out, null, 2);
  const jsonPath = resolve(outDir, 'data.json');
  await writeFile(jsonPath, json + '\n', 'utf8');

  const jsPath = resolve(outDir, 'data.js');
  // Use JSON.stringify (already escapes) wrapped as a script. Avoid </script in JSON.
  const safeJson = json.replace(/<\/script/gi, '<\\/script');
  await writeFile(jsPath, `window.__DIARY = ${safeJson};\n`, 'utf8');

  console.error(`# wrote ${jsonPath}`);
  console.error(`# wrote ${jsPath}`);
  console.error(`# done. open artifacts/agent-diary/index.html`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
