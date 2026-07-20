// Aggregate classified meetings into headline counts, per-category / per-firm
// breakdowns, and an advisor leaderboard.

const MODALITIES = ['video', 'face_to_face', 'telephone', 'unspecified'];
const CATEGORIES = ['review', 'first', 'follow_up'];

function emptyModalityCounts() {
  return { video: 0, face_to_face: 0, telephone: 0, unspecified: 0, total: 0 };
}

function addModality(bucket, modality) {
  bucket[modality] = (bucket[modality] || 0) + 1;
  bucket.total += 1;
}

export function aggregate(meetings, noiseCount = 0) {
  const overall = emptyModalityCounts();
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, emptyModalityCounts()]));
  const byFirm = {};
  const advisorMap = new Map();
  const modalitySource = { title: 0, location: 0, conference: 0, none: 0 };

  for (const m of meetings) {
    const modality = MODALITIES.includes(m.modality) ? m.modality : 'unspecified';
    const category = CATEGORIES.includes(m.category) ? m.category : 'other';

    modalitySource[m.modalitySource] = (modalitySource[m.modalitySource] || 0) + 1;
    addModality(overall, modality);
    if (byCategory[category]) addModality(byCategory[category], modality);

    if (!byFirm[m.firm]) byFirm[m.firm] = emptyModalityCounts();
    addModality(byFirm[m.firm], modality);

    const key = m.advisor || 'unknown';
    if (!advisorMap.has(key)) {
      advisorMap.set(key, {
        advisor: key, total: 0, review: 0, first: 0, follow_up: 0,
        video: 0, face_to_face: 0, telephone: 0, unspecified: 0,
      });
    }
    const a = advisorMap.get(key);
    a.total += 1;
    if (category !== 'other') a[category] += 1;
    a[modality] += 1;
  }

  const advisors = [...advisorMap.values()].sort((x, y) => y.total - x.total);
  const reviewLeaderboard = [...advisors].sort((x, y) => y.review - x.review);

  return {
    grandTotal: meetings.length,
    excludedNoise: noiseCount,
    reviewTotal: byCategory.review.total,
    overall,
    modalitySource,
    byCategory,
    byFirm,
    advisors,
    topAdvisor: advisors[0] || null,
    topReviewAdvisor: reviewLeaderboard[0] || null,
  };
}
