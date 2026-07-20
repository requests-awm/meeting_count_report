import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

export function loadConfig() {
  const raw = readFileSync(resolve(projectRoot, 'config.json'), 'utf8');
  const config = JSON.parse(raw);

  config.env = {
    // Google Calendar via OAuth (client + refresh token)
    googleClientId: process.env.GMAIL_CLIENT_ID,
    googleClientSecret: process.env.GMAIL_CLIENT_SECRET,
    googleRefreshToken: process.env.GMAIL_REFRESH_TOKEN,
    // Asana (optional; not required for calendar-based counting)
    asanaToken: process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT,
    asanaWorkspaceId: process.env.ASANA_WORKSPACE_ID || process.env.ASANA_WORKSPACE_GID,
    asanaProjectGids: (process.env.ASANA_PROJECT_GIDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };

  config.projectRoot = projectRoot;
  return config;
}
