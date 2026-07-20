# Meeting-Count Agent — Plan

Reusable Node.js tool that reports how many **Review / Face-to-face / Video / Telephone**
meetings occurred over any 365-day window (default fiscal year 1 Jul → 30 Jun),
whether they actually happened, and which advisor ran the most.

## Decisions (confirmed with user)
- **Data source:** merge **Google Calendar + Asana**.
- **Meeting type:** classified from **title keywords**.
- **"Did it happen":** Asana **completion status** is source of truth; calendar
  provides type/advisor/time + non-cancelled/acceptance as fallback signal.
- **Deliverable:** reusable CLI script, any 365-day window.
- **Stack:** Node.js 20+ (matches AWM toolchain).
- **Timezone:** `Africa/Johannesburg` (assumed).

## Classification is two-dimensional
`review` is a *purpose*; `face_to_face` / `video` / `telephone` are *modalities*.
A meeting is scored on BOTH axes, so a "review over video" counts as a review AND
a video meeting. This avoids arbitrary precedence and gives correct totals.

## Auth (user provides)
- Google Calendar: Workspace **service account + domain-wide delegation**,
  `calendar.readonly`. Impersonates each advisor to read their calendar.
- Asana: **Personal Access Token** + workspace/project GIDs.
- Stored in `.env` (git-ignored).

## Pipeline
1. Resolve window from `--start` (+ `--window`, default 365).
2. Fetch calendar events (paginated, recurring expanded via `singleEvents`).
3. Fetch Asana tasks (paginated, with completion + custom fields + assignee).
4. Classify each item (review flag + modality) from title keywords.
5. Merge/dedupe calendar↔asana on date + client/advisor + fuzzy title.
6. Resolve advisor (calendar organizer/attendee `@ascotwm.com`, or Asana assignee).
7. Aggregate: per-type counts, happened-vs-booked, per-advisor breakdown, top advisor.
8. Output: console summary + `results.csv` + `results.json`.

## Files
```
src/  fetchGoogleCalendar.js · fetchAsana.js · classify.js · merge.js · aggregate.js · config.js · index.js
config.json · .env.example · .gitignore · README.md
```

## Outstanding input needed
- 20–30 real sample titles (both systems) to tune the keyword ruleset.
- Asana: which custom fields hold completion + meeting type.
- Confirm timezone.

## Out of scope
- No writes to Supabase/public schema. Local file output only.
