/* Shared helpers for the auth backend tests.
   The server reads its configuration from process.env at import time, so the
   environment is prepared here before the module is imported. */

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startServer(env = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'bm-auth-'));
  Object.assign(process.env, {
    AUTH_DATA_DIR: dataDir,
    MAIL_MODE: 'log',
    PUBLIC_BASE_URL: 'https://example.test',
    ...env
  });
  const { createAuthServer } = await import('../server/index.mjs');
  const server = createAuthServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    base,
    dataDir,
    server,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

export async function post(base, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers, json: safeJson(text) };
}

export async function get(base, path, headers = {}) {
  const res = await fetch(base + path, { headers });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers, json: safeJson(text) };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/* The mail channel is the public way these flows hand out a token: read it back
   from the local log instead of reaching into storage. */
export function mails(dataDir) {
  try {
    return readFileSync(join(dataDir, 'mail.log'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function tokenFrom(mail) {
  const match = /[#?&]token=([A-Za-z0-9_-]+)/.exec(mail.text || '');
  return match ? match[1] : null;
}

export const PASSWORD = 'correct horse battery staple';
