// Structured classification for AWM/AEP/Chambers meeting titles:
//   ML - <Client> - <InsightlyID> - <adviser@email> - <Meeting Type> <Modality>
// Category comes from the calendar (set on the record). Here we derive:
//   - modality: video | face_to_face | telephone | unspecified
//   - isReview: category === 'review' OR title mentions "review"

function normalize(text) {
  return ` ${(text || '').toLowerCase()} `.replace(/\s+/g, ' ');
}

function matchesAny(hay, keywords) {
  return keywords.some((kw) => hay.includes(kw.toLowerCase()));
}

// Is this event an actual client meeting we should count?
export function isMeeting(record, config) {
  const ex = config.exclude || {};
  const hay = normalize(record.title);

  if (ex.requirePrefix) {
    const first = (record.titleParts?.[0] || '').toLowerCase();
    if (first !== ex.requirePrefix.toLowerCase()) return false;
  }
  if (matchesAny(hay, ex.titleKeywords || [])) return false;
  return true;
}

// Fallback: infer modality from the event location / conferencing link.
function inferFromLocation(record, c) {
  if (record.hasConference) return { modality: 'video', source: 'conference' };

  const loc = (record.location || '').trim().toLowerCase();
  if (!loc) return { modality: 'unspecified', source: 'none' };
  if ((c.locationJunk || []).includes(loc)) return { modality: 'unspecified', source: 'none' };
  if (/^\d{4}-\d{2}-\d{2}t/.test(loc)) return { modality: 'unspecified', source: 'none' }; // date junk

  if (matchesAny(` ${loc} `, c.locationVideoKeywords || [])) return { modality: 'video', source: 'location' };
  if (matchesAny(` ${loc} `, c.locationTelephoneKeywords || [])) return { modality: 'telephone', source: 'location' };
  // Anything else with a real location value is a physical meeting.
  return { modality: 'face_to_face', source: 'location' };
}

export function classify(record, config) {
  const c = config.classification;
  const hay = normalize(record.title);

  let modality = 'unspecified';
  let modalitySource = 'title';
  const hits = [];
  for (const [name, keywords] of Object.entries(c.modalityKeywords)) {
    if (matchesAny(hay, keywords)) hits.push(name);
  }
  if (hits.length === 1) modality = hits[0];
  else if (hits.length > 1) modality = c.modalityPrecedence.find((m) => hits.includes(m)) || hits[0];

  if (modality === 'unspecified') {
    const inferred = inferFromLocation(record, c);
    modality = inferred.modality;
    modalitySource = inferred.source;
  }

  const isReview = record.category === 'review' || matchesAny(hay, c.reviewKeywords);

  return { ...record, modality, modalitySource, isReview };
}

export function classifyAll(records, config) {
  const kept = [];
  const noise = [];
  for (const r of records) {
    if (isMeeting(r, config)) kept.push(classify(r, config));
    else noise.push(r);
  }
  return { meetings: kept, noise };
}
