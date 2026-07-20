const ASANA_BASE = 'https://app.asana.com/api/1.0';

const OPT_FIELDS = [
  'name',
  'completed',
  'completed_at',
  'due_on',
  'due_at',
  'created_at',
  'assignee.name',
  'assignee.email',
  'custom_fields.name',
  'custom_fields.display_value',
].join(',');

// Returns normalized meeting records from every configured Asana project,
// filtered to the [timeMin, timeMax] window.
export async function fetchAsana(config, timeMin, timeMax) {
  const { asanaPat, asanaProjectGids } = config.env;

  if (!asanaPat) {
    console.warn('[asana] ASANA_PAT is not set — skipping Asana fetch.');
    return [];
  }
  if (!asanaProjectGids || asanaProjectGids.length === 0) {
    console.warn('[asana] No ASANA_PROJECT_GIDS set — skipping Asana fetch.');
    return [];
  }

  const typeFieldName = config.asana?.typeCustomFieldName || null;
  const records = [];

  for (const projectGid of asanaProjectGids) {
    let offset;
    do {
      const url = new URL(`${ASANA_BASE}/tasks`);
      url.searchParams.set('project', projectGid);
      url.searchParams.set('opt_fields', OPT_FIELDS);
      url.searchParams.set('limit', '100');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${asanaPat}` },
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`[asana] ${res.status} for project ${projectGid}: ${body}`);
        break;
      }

      const json = await res.json();
      for (const task of json.data || []) {
        const rec = normalizeTask(task, typeFieldName);
        if (!rec.start) continue;
        const d = new Date(rec.start);
        if (d >= timeMin && d <= timeMax) records.push(rec);
      }
      offset = json.next_page?.offset;
    } while (offset);
  }

  return records;
}

function normalizeTask(task, typeFieldName) {
  const start = task.due_at || task.due_on || task.completed_at || task.created_at || null;

  let structuredType = null;
  if (typeFieldName) {
    const field = (task.custom_fields || []).find((f) => f.name === typeFieldName);
    structuredType = field?.display_value || null;
  }

  return {
    source: 'asana',
    id: `asana:${task.gid}`,
    title: task.name || '',
    start,
    advisor: task.assignee?.email || task.assignee?.name || null,
    client: null,
    accepted: null,
    completed: task.completed === true,
    structuredType,
    raw: { gid: task.gid, completed_at: task.completed_at },
  };
}
