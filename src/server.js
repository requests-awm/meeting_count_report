import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the self-contained dashboard (out/report.html) and refreshes the
// underlying data on a schedule. The HTML inlines its data/logo/favicon, so this
// only ever serves that ONE file — results.json (client PII) is never exposed.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(root, 'out', 'report.html');

const PORT = Number(process.env.PORT || 8080);
const INTERVAL_H = Number(process.env.REPORT_INTERVAL_HOURS || 24);
const AUTH_USER = process.env.BASIC_AUTH_USER || '';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || '';

let generating = false;
let lastRun = null; // { at, ok, partial, code }

function runStep(args) {
  return new Promise((res) => {
    const p = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    p.on('close', (code) => res(code ?? 1));
    p.on('error', (e) => { console.error('[server] spawn error:', e.message); res(1); });
  });
}

async function regenerate() {
  if (generating) { console.log('[server] regenerate already in progress — skipping'); return; }
  generating = true;
  try {
    const args = ['src/index.js'];
    if (process.env.REPORT_START) args.push('--start', process.env.REPORT_START);
    if (process.env.REPORT_END) args.push('--end', process.env.REPORT_END);
    if (process.env.REPORT_WINDOW) args.push('--window', process.env.REPORT_WINDOW);

    console.log('[server] regenerating report…');
    const code = await runStep(args); // 0 ok · 1 fatal (auth) · 2 partial
    if (code === 1) {
      console.error('[server] report generation FAILED (fatal/auth). Keeping previous report if any.');
      lastRun = { at: new Date().toISOString(), ok: false, partial: false, code };
      return;
    }
    await runStep(['src/report-html.js']);
    lastRun = { at: new Date().toISOString(), ok: true, partial: code === 2, code };
    console.log(`[server] report ${code === 2 ? 'PARTIAL' : 'OK'} at ${lastRun.at}`);
  } finally {
    generating = false;
  }
}

function authorized(req) {
  if (!AUTH_USER) return true; // auth disabled
  const [scheme, val] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !val) return false;
  const [u, p] = Buffer.from(val, 'base64').toString().split(':');
  return u === AUTH_USER && p === AUTH_PASS;
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];

  // Health check is unauthenticated so orchestrator probes work.
  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', generating, lastRun }));
    return;
  }

  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Meeting Report"' });
    res.end('Authentication required');
    return;
  }

  if (path === '/' || path === '/index.html') {
    if (!existsSync(REPORT)) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h1>Report not available yet</h1><p>Generation is in progress or failed — check server logs.</p>');
      return;
    }
    const html = await readFile(REPORT);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<h1>404 — Not found</h1>');
});

server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}  (auth ${AUTH_USER ? 'ON' : 'off'}, refresh every ${INTERVAL_H}h)`);
});

if (process.env.SKIP_INITIAL_REPORT !== 'true') regenerate();
if (INTERVAL_H > 0) setInterval(regenerate, INTERVAL_H * 3600 * 1000);
