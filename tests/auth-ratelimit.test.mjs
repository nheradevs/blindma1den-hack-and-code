/* Rate limits: per IP and per account, and never a lockout of the account. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, post, PASSWORD } from './helpers.mjs';

let srv;

test.before(async () => {
  srv = await startServer({
    AUTH_RATE_RESET_MAX: '2',
    AUTH_RATE_ACCOUNT_MAX: '2',
    AUTH_RATE_WINDOW_SECONDS: '600'
  });
});
test.after(async () => { await srv.close(); });

test('el mismo IP se pasa del límite y recibe 429 con el cuerpo genérico', async () => {
  const email = 'burst@example.test';
  await post(srv.base, '/api/auth/register', { email, password: PASSWORD });
  const ip = { 'x-forwarded-for': '10.2.0.1' };
  for (let i = 0; i < 2; i++) {
    const ok = await post(srv.base, '/api/auth/reset', { email }, ip);
    assert.equal(ok.status, 200, 'las dos primeras pasan');
  }
  const limited = await post(srv.base, '/api/auth/reset', { email }, ip);
  assert.equal(limited.status, 429);
  assert.equal(limited.json.error, 'rate_limited');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('el límite por cuenta frena también a quien rota IPs', async () => {
  const email = 'victim@example.test';
  await post(srv.base, '/api/auth/register', { email, password: PASSWORD });
  await post(srv.base, '/api/auth/reset', { email }, { 'x-forwarded-for': '10.2.1.1' });
  await post(srv.base, '/api/auth/reset', { email }, { 'x-forwarded-for': '10.2.1.2' });
  const limited = await post(srv.base, '/api/auth/reset', { email }, { 'x-forwarded-for': '10.2.1.3' });
  assert.equal(limited.status, 429);
});

test('un IP distinto con otra cuenta sigue pudiendo pedir su reset', async () => {
  const other = 'free@example.test';
  await post(srv.base, '/api/auth/register', { email: other, password: PASSWORD });
  const ok = await post(srv.base, '/api/auth/reset', { email: other }, { 'x-forwarded-for': '10.2.2.1' });
  assert.equal(ok.status, 200);
});

test('pasar el límite no bloquea la cuenta: el login sigue funcionando', async () => {
  const login = await post(srv.base, '/api/auth/login', { email: 'victim@example.test', password: PASSWORD });
  assert.equal(login.status, 200, 'un lockout por reset sería un DoS contra el usuario');
});
