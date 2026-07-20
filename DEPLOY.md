# Deployment

The app ships as one container image that runs in **two modes**:

| Mode | What it does | Use for |
|------|--------------|---------|
| **Service** (default) | Serves the dashboard at `http://<host>:8080/` and refreshes the data on a schedule | A live internal dashboard behind a URL |
| **Job** | Runs the report once and exits (exit `0` ok · `1` fatal/auth · `2` partial) | Cron / Cloud Run Jobs / CI |

The dashboard HTML is fully self-contained (data, logo, favicon inlined). The server
serves **only** that file — `results.json` (which holds client PII) is never exposed.

## Prerequisites
- Google OAuth credentials in a local `.env` (see `.env.example`). Secrets are passed
  at **runtime** — they are never baked into the image.

## Build
```bash
docker build -t ascot/meeting-report:latest .
```

## Run — service mode (docker compose, easiest)
```bash
docker compose up -d        # reads .env, serves on :8080, refreshes every 24h
# open http://localhost:8080
docker compose logs -f      # watch generation logs
```

## Run — service mode (plain docker)
```bash
docker run -d --name meeting-report -p 8080:8080 --env-file .env \
  ascot/meeting-report:latest
```

## Run — job mode (generate once, then exit)
```bash
# Mount a folder to collect the output files
docker run --rm --env-file .env -v "$PWD/out:/app/out" \
  ascot/meeting-report:latest \
  node src/index.js --start 2025-07-01 --end 2026-07-01
echo "exit code: $?"   # 0 ok · 1 fatal · 2 partial
```

## Environment variables
| Var | Default | Purpose |
|-----|---------|---------|
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | — | Google OAuth (required) |
| `PORT` | `8080` | Server port (service mode) |
| `REPORT_INTERVAL_HOURS` | `24` | How often the service refreshes data (`0` = never) |
| `REPORT_START` / `REPORT_END` | last completed FY | Fixed window (`--end` exclusive) |
| `REPORT_WINDOW` | `365` | Day count if `REPORT_END` unset |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | — | If set, dashboard requires Basic Auth (health check stays open) |
| `SKIP_INITIAL_REPORT` | — | `true` = don't generate on startup (serve existing) |

## Endpoints
- `GET /` — the dashboard (Basic Auth if configured)
- `GET /healthz` — `{ status, generating, lastRun }`, unauthenticated (for probes)

## Deploying to a platform
- **Cloud Run (service):** deploy the image, set env vars from Secret Manager, port 8080.
  Set `REPORT_INTERVAL_HOURS=0` and instead trigger refresh with a **Cloud Run Job** +
  Cloud Scheduler if you prefer scheduled jobs over an in-process timer.
- **Cloud Run Job / ECS scheduled task / cron:** override the command to
  `node src/index.js …` (job mode) and read the exit code.
- **Any VM:** `docker compose up -d`, front with nginx/Caddy for TLS.

## Security notes
- Put the service behind auth if it's reachable beyond your network — set
  `BASIC_AUTH_*`, or use platform IAM/IAP, or keep it VPN-only.
- The `GMAIL_REFRESH_TOKEN` grants read access to calendars containing client PII —
  store it in a secret manager, not in the image or a committed file.
- `results.json` stays inside the container/volume; only the sanitised HTML is served.
