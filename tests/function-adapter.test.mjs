/* The Netlify Function adapter (v2: Request in, Response out).
   It runs the same handlers as the local server, so a broken adapter is
   invisible to the HTTP tests — this file is what pins it. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.AUTH_STORE = 'json';
process.env.AUTH_DATA_DIR = mkdtempSync(join(tmpdir(), 'bm-fn-'));
process.env.MAIL_MODE = 'log';
process.env.PUBLIC_BASE_URL = 'https://example.test';

const { default: handler } = await import('../netlify/functions/auth.mjs');
const ctx = { ip: '1.2.3.4' };

async function call(url, method = 'POST', body) {
  const req = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const res = await handler(req, ctx);
  return { status: res.status, json: await res.json() };
}

test('health por la ruta de la función', async () => {
  const res = await call('https://x.netlify.app/.netlify/functions/auth/health', 'GET');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
});

test('health por la ruta reescrita /api/health', async () => {
  const res = await call('https://x.netlify.app/api/health', 'GET');
  assert.equal(res.status, 200);
  assert.equal(res.json.mail, true);
});

test('registro y login a través del adaptador', async () => {
  const reg = await call('https://x.netlify.app/api/auth/register', 'POST', { email: 'fn@example.test', password: 'una frase larga 2026' });
  assert.equal(reg.status, 200);

  const login = await call('https://x.netlify.app/api/auth/login', 'POST', { email: 'fn@example.test', password: 'una frase larga 2026' });
  assert.equal(login.status, 200);
  assert.equal(login.json.redirect, '/app/index.html');
});

test('ruta desconocida y cuerpo inválido no rompen el adaptador', async () => {
  const notFound = await call('https://x.netlify.app/api/auth/nope', 'POST', {});
  assert.equal(notFound.status, 404);

  const req = new Request('https://x.netlify.app/api/auth/login', { method: 'POST', body: '{' });
  const res = await handler(req, ctx);
  assert.equal(res.status, 400);
});
