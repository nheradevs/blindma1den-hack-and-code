/* A serverless deployment with a mail key but no PUBLIC_BASE_URL would send
   links to http://localhost:8080. It has to count as "no mail transport". */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, post, get, PASSWORD } from './helpers.mjs';

let srv;

test.before(async () => {
  srv = await startServer({
    MAIL_MODE: 'resend',
    RESEND_API_KEY: 'fake-key-for-this-test',
    NETLIFY: 'true',
    PUBLIC_BASE_URL: ''
  });
  await post(srv.base, '/api/auth/register', { email: 'nobase@example.test', password: PASSWORD });
});
test.after(async () => { await srv.close(); });

test('sin PUBLIC_BASE_URL no se promete un enlace a localhost', async () => {
  const health = await get(srv.base, '/api/health');
  assert.equal(health.json.mail, false, 'una clave de correo no alcanza si el enlace apunta a localhost');

  const reset = await post(srv.base, '/api/auth/reset', { email: 'nobase@example.test' }, { 'x-forwarded-for': '10.10.0.1' });
  assert.equal(reset.status, 503);
  assert.equal(reset.json.error, 'mail_unavailable');
});
