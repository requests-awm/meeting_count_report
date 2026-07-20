import { google } from 'googleapis';

const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function calendarClient(env) {
  const oauth = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
  oauth.setCredentials({ refresh_token: env.googleRefreshToken });
  return google.calendar({ version: 'v3', auth: oauth });
}

function statusOf(err) {
  return err?.code || err?.response?.status || 0;
}

// A bad refresh token / client secret is fatal for the WHOLE run — every
// calendar would fail identically, so aborting loudly beats silent zeros.
function isAuthError(err) {
  if (statusOf(err) === 401) return true;
  const msg = (err?.message || '').toLowerCase();
  const reason = (err?.response?.data?.error || '').toString().toLowerCase();
  return msg.includes('invalid_grant') || msg.includes('invalid_client') || reason.includes('invalid_grant');
}

// Transient failures worth retrying (rate limit / server errors).
function isRetryable(err) {
  const s = statusOf(err);
  return s === 429 || (s >= 500 && s < 600);
}

async function listPage(cal, params) {
  let attempt = 0;
  for (;;) {
    try {
      return await cal.events.list(params);
    } catch (err) {
      if (isAuthError(err)) throw err; // fatal — bubble up
      if (isRetryable(err) && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw err; // non-retryable, or retries exhausted
    }
  }
}

// Fetch every (non-cancelled) event from the configured calendars in [timeMin, timeMax].
// "happened" = non-cancelled (per configured policy). Category comes from the calendar.
// Returns { records, failed }: a fatal auth error throws (aborts the run); a
// per-calendar transient failure (after retries) is recorded in `failed` so the
// caller can label the report PARTIAL instead of silently undercounting.
export async function fetchGoogleCalendar(config, timeMin, timeMax) {
  const { googleClientId, googleRefreshToken } = config.env;
  if (!googleClientId || !googleRefreshToken) {
    throw new Error('Google OAuth env vars (GMAIL_CLIENT_ID / GMAIL_REFRESH_TOKEN) are not set.');
  }

  const cal = calendarClient(config.env);
  const records = [];
  const failed = [];

  for (const calCfg of config.calendars || []) {
    try {
      let pageToken;
      do {
        const res = await listPage(cal, {
          calendarId: calCfg.id,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          showDeleted: false,
          pageToken,
          fields:
            'nextPageToken,items(id,summary,status,htmlLink,location,hangoutLink,conferenceData(conferenceSolution(name)),start(date,dateTime))',
        });

        for (const ev of res.data.items || []) {
          if (ev.status === 'cancelled') continue;
          records.push(normalize(ev, calCfg));
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);
    } catch (err) {
      if (isAuthError(err)) {
        throw new Error(
          `Google authentication failed (${err.message}). The refresh token is likely expired or revoked — re-authorise before trusting any output. Aborting run.`
        );
      }
      console.error(`[calendar] ${calCfg.name} failed after retries: ${err.message}`);
      failed.push({ name: calCfg.name, firm: calCfg.firm, error: err.message });
    }
  }

  return { records, failed };
}

const EMAIL_RE = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
const INSIGHTLY_RE = /\b(\d{6,})\b/;

function normalize(ev, calCfg) {
  const title = ev.summary || '';
  const parts = title.split(' - ').map((s) => s.trim());

  const emailMatch = title.match(EMAIL_RE);
  const idMatch = title.match(INSIGHTLY_RE);

  // Only accept a real advisor email: local part must contain no digits
  // (rejects date-strings like "2025-07-28t...@" and "00.000z@").
  let advisor = null;
  if (emailMatch) {
    const email = emailMatch[1].toLowerCase();
    if (!/\d/.test(email.split('@')[0])) advisor = email;
  }

  return {
    source: 'calendar',
    id: `cal:${ev.id}`,
    calendarName: calCfg.name,
    firm: calCfg.firm,
    category: calCfg.category, // authoritative meeting category
    title,
    titleParts: parts,
    start: ev.start?.dateTime || ev.start?.date || null,
    advisor,
    advisorSource: advisor ? 'email' : 'none',
    client: parts.length > 1 ? parts[1] : null,
    insightlyId: idMatch ? idMatch[1] : null,
    location: (ev.location || '').trim(),
    hasConference: Boolean(ev.hangoutLink || ev.conferenceData),
    happened: true, // non-cancelled events only reach here
    raw: { status: ev.status, htmlLink: ev.htmlLink },
  };
}
