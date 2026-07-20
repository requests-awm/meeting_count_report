// Second-pass advisor resolution.
// Many titles carry the advisor as a NAME ("Greg Armstrong") rather than an email.
// We derive "first last" -> email from every real advisor email already present in
// the data, then match name-only records against that map so they consolidate with
// the email-based entries instead of landing in "unknown".

function nameKeyFromEmail(email) {
  return email.split('@')[0].replace(/[._-]+/g, ' ').trim().toLowerCase();
}

export function resolveAdvisors(records, config) {
  const nameToEmail = new Map();

  // Build from emails found in the data.
  for (const r of records) {
    if (r.advisor) {
      const key = nameKeyFromEmail(r.advisor);
      if (key.includes(' ')) nameToEmail.set(key, r.advisor); // needs first+last to be safe
    }
  }
  // Manual aliases/overrides from config (nickname -> email).
  for (const [name, email] of Object.entries(config.advisorAliases || {})) {
    nameToEmail.set(name.toLowerCase(), email.toLowerCase());
  }

  let resolved = 0;
  for (const r of records) {
    if (r.advisor) continue;
    const hay = ` ${(r.title || '').toLowerCase()} `;
    for (const [name, email] of nameToEmail) {
      if (hay.includes(` ${name} `) || hay.includes(`- ${name} -`) || hay.includes(` ${name}`)) {
        r.advisor = email;
        r.advisorSource = 'name';
        resolved += 1;
        break;
      }
    }
  }
  return { resolved, distinctAdvisors: new Set(records.map((r) => r.advisor).filter(Boolean)).size };
}
