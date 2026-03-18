#!/usr/bin/env node

/**
 * Repo Health Pulse - GitHub App Server
 *
 * Handles two webhook events:
 * 1. installation.created → Opens a PR in the repo with the workflow file
 * 2. workflow_run.completed / release.published → Invalidates cache (future)
 *
 * Deploy to: Vercel, Fly.io, or Cloudflare Workers
 * Env vars: APP_ID, PRIVATE_KEY, WEBHOOK_SECRET
 */

import * as http from 'http';
import * as crypto from 'crypto';

const PORT = parseInt(process.env.PORT || '3000');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const APP_ID = process.env.APP_ID || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

// --- JWT / Auth ---

function base64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }));
  const signature = crypto.sign('SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

async function getInstallationToken(installationId: number): Promise<string> {
  const jwt = createJwt(APP_ID, PRIVATE_KEY);
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'repo-health-pulse-app',
    },
  });
  const data = await res.json() as any;
  return data.token;
}

// --- PR Creation ---

const WORKFLOW_CONTENT = `name: Health Pulse

on:
  release:
    types: [published]
  pull_request:
    types: [closed]
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

permissions:
  contents: write
  actions: read
  pull-requests: read
  issues: read

jobs:
  pulse:
    runs-on: ubuntu-latest
    if: github.event_name != 'pull_request' || github.event.pull_request.merged == true
    steps:
      - uses: actions/checkout@v4
      - uses: andreahlert/repo-health-pulse@main
        with:
          format: monitor
          output-path: .github/health-pulse.svg
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "Update health pulse [skip ci]"
          file_pattern: ".github/health-pulse.svg"
`;

const PR_BODY = `## Repo Health Pulse

This PR adds an automated health monitor for your repository.

**What it does:**
- Runs daily (and on releases, merged PRs)
- Collects CI pass rate, PR merge time, release cadence, and issue response time
- Generates an animated ECG-style SVG showing your repo's vital signs
- Commits the SVG to \`.github/health-pulse.svg\`

**To display in your README, add:**

\`\`\`markdown
![health](.github/health-pulse.svg)
\`\`\`

**How scoring works:**
- Scores are percentile-based, compared against 286 real GitHub repos
- Adjusted by repo size cohort (tiny/medium/big/huge)
- CI 30% + PR merge 30% + Response 25% + Releases 15%

[Learn more](https://github.com/andreahlert/repo-health-pulse)
`;

async function ghApi(token: string, method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'repo-health-pulse-app',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function openSetupPr(token: string, owner: string, repo: string, defaultBranch: string): Promise<void> {
  const branchName = 'repo-health-pulse/setup';

  // Get the SHA of the default branch
  const ref = await ghApi(token, 'GET', `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
  const baseSha = ref.object?.sha;
  if (!baseSha) {
    console.error(`Could not get base SHA for ${owner}/${repo}`);
    return;
  }

  // Create branch
  try {
    await ghApi(token, 'POST', `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
  } catch {
    console.error(`Branch ${branchName} may already exist in ${owner}/${repo}`);
    return;
  }

  // Create workflow file
  const content = Buffer.from(WORKFLOW_CONTENT).toString('base64');
  await ghApi(token, 'PUT', `/repos/${owner}/${repo}/contents/.github/workflows/health-pulse.yml`, {
    message: 'Add Repo Health Pulse workflow',
    content,
    branch: branchName,
  });

  // Open PR
  const pr = await ghApi(token, 'POST', `/repos/${owner}/${repo}/pulls`, {
    title: 'Add Repo Health Pulse monitor',
    body: PR_BODY,
    head: branchName,
    base: defaultBranch,
  });

  console.log(`PR opened: ${pr.html_url}`);
}

// --- Webhook Handling ---

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // dev mode
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function handleWebhook(event: string, payload: any): Promise<string> {
  if (event === 'installation' && payload.action === 'created') {
    const installationId = payload.installation.id;
    const repos = payload.repositories || [];
    const token = await getInstallationToken(installationId);

    for (const repo of repos) {
      const [owner, name] = repo.full_name.split('/');
      const repoData = await ghApi(token, 'GET', `/repos/${owner}/${name}`);
      const defaultBranch = repoData.default_branch || 'main';

      console.log(`Setting up ${repo.full_name}...`);
      await openSetupPr(token, owner, name, defaultBranch);
    }

    return `Processed ${repos.length} repos`;
  }

  if (event === 'installation_repositories' && payload.action === 'added') {
    const installationId = payload.installation.id;
    const repos = payload.repositories_added || [];
    const token = await getInstallationToken(installationId);

    for (const repo of repos) {
      const [owner, name] = repo.full_name.split('/');
      const repoData = await ghApi(token, 'GET', `/repos/${owner}/${name}`);
      const defaultBranch = repoData.default_branch || 'main';

      console.log(`Setting up ${repo.full_name}...`);
      await openSetupPr(token, owner, name, defaultBranch);
    }

    return `Processed ${repos.length} added repos`;
  }

  return `Ignored event: ${event}/${payload.action}`;
}

// --- HTTP Server ---

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Repo Health Pulse App is running');
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', app_id: APP_ID ? 'configured' : 'missing' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const sig = req.headers['x-hub-signature-256'] as string || '';
      if (!verifySignature(body, sig)) {
        res.writeHead(401);
        res.end('Invalid signature');
        return;
      }

      const event = req.headers['x-github-event'] as string || '';
      try {
        const payload = JSON.parse(body);
        const result = await handleWebhook(event, payload);
        console.log(`[${event}] ${result}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err: any) {
        console.error(`[${event}] Error:`, err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Repo Health Pulse App listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  if (!APP_ID) console.warn('Warning: APP_ID not set');
  if (!PRIVATE_KEY) console.warn('Warning: PRIVATE_KEY not set');
  if (!WEBHOOK_SECRET) console.warn('Warning: WEBHOOK_SECRET not set (signature verification disabled)');
});
