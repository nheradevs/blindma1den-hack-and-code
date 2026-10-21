/* Expiry is time-based, so it gets its own process with a 1-second TTL. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, post, mails, tokenFrom, PASSWORD } from './helpers.mjs';

let srv;

test.before(async () => { srv = await startServer({ AUTH_TOKEN_TTL_SECONDS: '1' }); });
test.after(async () => { await srv.close(); });

test('un token de reset vence y después responde igual que uno inventado', async () => {
  const email = 'late@example.test';
  await post(srv.base, '/api/auth/register', { email, password: PASSWORD });
  await post(srv.base, '/api/auth/reset', { email }, { 'x-forwarded-for': '10.1.0.1' });
  const token = tokenFrom(mails(srv.dataDir).filter((m) => m.to === email).pop());
  assert.ok(token);

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const expired = await post(srv.base, '/api/auth/reset/confirm', { token, password: 'too late for this 48' });
  const invented = await post(srv.base, '/api/auth/reset/confirm', { token: 'y'.repeat(43), password: 'too late for this 48' });
  assert.equal(expired.status, 410);
  assert.equal(invented.status, 410);
  assert.equal(expired.text, invented.text, 'vencido e inexistente no se distinguen');
});
