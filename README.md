# Meeting-Count Agent

Counts client meetings over any 365-day window (default: the last completed fiscal
year, 1 Jul → 30 Jun) from Google Calendar, broken down by **category**
(Review / First / Follow-Up), **modality** (Video / Face-to-face / Telephone /
Unspecified), and **advisor** — flagging who ran the most.

## Data model
Meetings live in type-specific Google calendars (AWM, AEP, Chambers Wealth), and each
event title follows a fixed shape:
```
ML - <Client Name> - <InsightlyID> - <adviser@email> - <Meeting Type> <Modality>
```
The tool parses **advisor, client, insightly id, and modality** from the title, and
takes the **meeting category from the calendar** the event lives in. It does *not*
guess: titles with no modality are counted as **Unspecified**.

- **"Happened"** = the calendar event is not cancelled (per configured policy).
- Non-meeting entries (reminders like "3 days befor meet", estate-planning "Name - EP"
  placeholders, "Office" blocks, etc.) are excluded and logged as noise.

## Setup
```bash
npm install
cp .env.example .env      # then fill in credentials
```
`.env` needs (Google Calendar via OAuth):
```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```
Asana vars are optional — Asana is **not** used for counting (calendar is authoritative).

Which calendars are read is controlled in [config.json](config.json) → `calendars`
(name / firm / category / id).

## Run
```bash
# Last completed fiscal year (default)
npm run report

# Explicit period: --end is exclusive (so this = the full FY)
node src/index.js --start 2025-07-01 --end 2026-07-01

# Or a rolling N-day window from a start date
node src/index.js --start 2024-01-01 --window 180

# Rebuild the interactive HTML dashboard from the latest results
npm run preview

# Fetch + rebuild dashboard in one step
npm run report:preview
```

Tip: fetch a **wide** range (e.g. `--start 2024-07-01 --end 2026-07-01`) once, then use the
dashboard's date-range picker and firm filters to slice any period in-browser — no re-fetch.

## Output
- **console** — full summary.
- **results.json** — report + every counted meeting + a noise sample (audit trail).
- **results.csv** — spreadsheet-friendly totals.
- **results-by-advisor.csv** — one row per advisor (category + modality columns).
- **out/report.html** — interactive dashboard: pick a **date range**, filter by **firm**,
  and every metric recomputes live. Theme-aware, self-contained.

## Tuning (config.json)
- `calendars` — add/remove calendars or firms.
- `classification.modalityKeywords` — words that map a title to each modality.
- `exclude.requirePrefix` / `exclude.titleKeywords` — what counts as a real meeting.

## Caveats (real data quality)
- A large share of Review meetings have **no modality** in the title → "Unspecified".
- Some titles miss the advisor email or use a name → grouped under "unknown".
- Counts reflect exactly what's on the calendars; spot-check surprising advisor totals.

## Notes
- Timezone `Europe/London` (change in config.json).
- Read-only. Nothing is written to Supabase or any shared database.
