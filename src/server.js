import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the self-contained dashboard (out/report.html) and (re)generates the
// underlying data ON DEMAND, inside a request.
//
// Why on-demand: on Cloud Run an instance only gets CPU while it is handling a
// request. Generating at startup / on a background timer stalls forever because
// CPU is throttled once the instance is idle. Doing it inside the request (and
// awaiting it before responding) guarantees the fetch runs to completion.
//
// The HTML inlines its data/logo/favicon, so this only ever serves that ONE file
// — results.json (client PII) is never exposed.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(root, 'out', 'report.html');

const PORT = Number(process.env.PORT || 8080);
const INTERVAL_MS = Number(process.env.REPORT_INTERVAL_HOURS || 24) * 3600 * 1000;
const FAIL_BACKOFF_MS = 60 * 1000; // don't hammer a failing generation
const AUTH_USER = process.env.BASIC_AUTH_USER || '';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || '';

let lastRun = null; // { at, ok, partial, code }
let lastOkMs = 0; // epoch of last successful generation
let nextRetryMs = 0; // earliest epoch we may retry after a failure
let inflight = null; // Promise while a generation is running (single-flight)

function runStep(args) {
  return new Promise((res) => {
    const p = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    p.on('close', (code) => res(code ?? 1));
    p.on('error', (e) => { console.error('[server] spawn error:', e.message); res(1); });
  });
}

async function generate() {
  const args = ['src/index.js'];
  if (process.env.REPORT_START) args.push('--start', process.env.REPORT_START);
  if (process.env.REPORT_END) args.push('--end', process.env.REPORT_END);
  if (process.env.REPORT_WINDOW) args.push('--window', process.env.REPORT_WINDOW);

  console.log('[server] regenerating report…');
  const code = await runStep(args); // 0 ok · 1 fatal (auth) · 2 partial
  const at = new Date().toISOString();
  if (code === 1) {
    console.error('[server] report generation FAILED (fatal/auth). Keeping previous report if any.');
    lastRun = { at, ok: false, partial: false, code };
    nextRetryMs = Date.now() + FAIL_BACKOFF_MS;
    return;
  }
  await runStep(['src/report-html.js']);
  lastOkMs = Date.now();
  lastRun = { at, ok: true, partial: code === 2, code };
  console.log(`[server] report ${code === 2 ? 'PARTIAL' : 'OK'} at ${at}`);
}

// Ensure a fresh report exists, generating if missing/stale. Single-flight:
// concurrent requests share one generation. Returns when it's safe to serve.
function ensureReport() {
  const now = Date.now();
  const haveReport = existsSync(REPORT);
  const fresh = haveReport && now - lastOkMs < INTERVAL_MS;
  if (fresh) return Promise.resolve();
  if (inflight) return inflight; // a generation is already running — wait for it
  if (haveReport && now < nextRetryMs) return Promise.resolve(); // in backoff, serve stale
  inflight = generate().finally(() => { inflight = null; });
  return inflight;
}

function authorized(req) {
  if (!AUTH_USER) return true;
  const [scheme, val] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !val) return false;
  const [u, p] = Buffer.from(val, 'base64').toString().split(':');
  return u === AUTH_USER && p === AUTH_PASS;
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];

  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', generating: Boolean(inflight), lastRun }));
    return;
  }

  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Meeting Report"' });
    res.end('Authentication required');
    return;
  }

  if (path === '/' || path === '/index.html') {
    try {
      await ensureReport(); // blocks first/stale load; CPU is allocated during the request
    } catch (e) {
      console.error('[server] generation error:', e.message);
    }
    if (!existsSync(REPORT)) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '30' });
      res.end('<h1>Report could not be generated</h1><p>Check the server logs (auth or calendar error).</p>');
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
  console.log(`[server] listening on :${PORT}  (auth ${AUTH_USER ? 'ON' : 'off'}, refresh TTL ${INTERVAL_MS / 3600000}h, on-demand)`);
});
