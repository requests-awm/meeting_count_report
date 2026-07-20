// Merge calendar + asana records: dedupe the same meeting appearing in both
// systems, and resolve whether it "actually happened".

function tokenize(title) {
  return new Set(
    (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

// Jaccard similarity on title word sets.
function titleSimilarity(a, b) {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function hoursApart(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(new Date(a) - new Date(b)) / 36e5;
}

function isSameMeeting(cal, asa, mergeCfg) {
  if (hoursApart(cal.start, asa.start) > mergeCfg.dateToleranceHours) return false;
  return titleSimilarity(cal.title, asa.title) >= mergeCfg.titleSimilarityThreshold;
}

// happened: Asana completion is source of truth; else fall back to calendar acceptance.
function resolveHappened(records) {
  const asanaCompleted = records.some((r) => r.source === 'asana' && r.completed === true);
  if (records.some((r) => r.source === 'asana')) {
    // Asana present → its completion flag decides.
    return asanaCompleted;
  }
  // Calendar-only → use acceptance as best-effort signal.
  return records.some((r) => r.accepted === true);
}

function mergePair(records) {
  // Prefer calendar title/advisor/client; prefer asana completion.
  const cal = records.find((r) => r.source === 'calendar');
  const asa = records.find((r) => r.source === 'asana');
  const base = cal || asa;

  return {
    id: records.map((r) => r.id).join('+'),
    title: base.title,
    start: base.start,
    advisor: cal?.advisor || asa?.advisor || null,
    client: cal?.client || asa?.client || null,
    isReview: records.some((r) => r.isReview),
    modality:
      records.find((r) => r.modality && r.modality !== 'unknown')?.modality || 'unknown',
    happened: resolveHappened(records),
    sources: records.map((r) => r.source),
  };
}

export function mergeRecords(calendarRecs, asanaRecs, config) {
  const mergeCfg = config.merge;
  const asanaUsed = new Set();
  const merged = [];

  for (const cal of calendarRecs) {
    const match = asanaRecs.find(
      (asa) => !asanaUsed.has(asa.id) && isSameMeeting(cal, asa, mergeCfg)
    );
    if (match) {
      asanaUsed.add(match.id);
      merged.push(mergePair([cal, match]));
    } else {
      merged.push(mergePair([cal]));
    }
  }

  for (const asa of asanaRecs) {
    if (!asanaUsed.has(asa.id)) merged.push(mergePair([asa]));
  }

  return merged;
}
