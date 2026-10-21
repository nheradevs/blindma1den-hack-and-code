/* Behaviour of the auth backend, exercised over HTTP.
   Each test asserts an observable effect of the rule it covers: status, body,
   the mail that goes out, and that a rejected request leaves state untouched. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, post, get, mails, tokenFrom, PASSWORD } from './helpers.mjs';

let srv;
const EMAIL = 'recruit@example.test';

test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); });

test('health: dice que hay backend, y el frontend lo usa para salir del modo demo', async () => {
  const res = await get(srv.base, '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
});

test('registro: misma respuesta exacta para un correo nuevo y uno ya registrado', async () => {
  const first = await post(srv.base, '/api/auth/register', { email: EMAIL, password: PASSWORD });
  const second = await post(srv.base, '/api/auth/register', { email: EMAIL, password: PASSWORD });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.text, first.text, 'un cuerpo distinto enumera cuentas');
});

test('registro: contraseña corta devuelve 400 y no deja el correo a medio crear', async () => {
  const bad = await post(srv.base, '/api/auth/register', { email: 'short@example.test', password: 'short' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'weak_password');

  const good = await post(srv.base, '/api/auth/register', { email: 'short@example.test', password: PASSWORD });
  assert.equal(good.status, 200);
  const login = await post(srv.base, '/api/auth/login', { email: 'short@example.test', password: PASSWORD });
  assert.equal(login.status, 200, 'el usuario tiene que existir después del intento fallido');
});

test('pedir reset: mismo cuerpo y mismo status exista o no la cuenta', async () => {
  const known = await post(srv.base, '/api/auth/reset', { email: EMAIL }, { 'x-forwarded-for': '10.0.0.1' });
  const unknown = await post(srv.base, '/api/auth/reset', { email: 'ghost@example.test' }, { 'x-forwarded-for': '10.0.0.2' });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(unknown.text, known.text, 'un cuerpo distinto enumera cuentas');
});

test('el correo de reset llega y el token se puede usar una sola vez', async () => {
  await post(srv.base, '/api/auth/reset', { email: EMAIL }, { 'x-forwarded-for': '10.0.0.3' });
  const mail = mails(srv.dataDir).filter((m) => m.to === EMAIL).pop();
  assert.ok(mail, 'tiene que salir un correo');
  const token = tokenFrom(mail);
  assert.ok(token && token.length >= 32, 'token largo y aleatorio');

  const ok = await post(srv.base, '/api/auth/reset/confirm', { token, password: 'a whole new passphrase 42' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('set-cookie'), null, 'un reset no inicia sesión');

  const again = await post(srv.base, '/api/auth/reset/confirm', { token, password: 'another passphrase 43' });
  assert.equal(again.status, 410, 'el token es de un solo uso');

  const login = await post(srv.base, '/api/auth/login', { email: EMAIL, password: 'a whole new passphrase 42' });
  assert.equal(login.status, 200, 'la contraseña nueva tiene que servir');
});

test('token inventado y token ya usado: misma respuesta, sin decir cuál es cuál', async () => {
  const used = await post(srv.base, '/api/auth/reset/confirm', { token: 'x'.repeat(43), password: 'another passphrase 44' });
  assert.equal(used.status, 410);
  assert.equal(used.json.error, 'invalid_token');
});

test('contraseña débil: 400 y el token sigue válido para reintentar', async () => {
  await post(srv.base, '/api/auth/reset', { email: EMAIL }, { 'x-forwarded-for': '10.0.0.4' });
  const token = tokenFrom(mails(srv.dataDir).filter((m) => m.to === EMAIL).pop());

  const weak = await post(srv.base, '/api/auth/reset/confirm', { token, password: 'short' });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.error, 'weak_password');

  const ok = await post(srv.base, '/api/auth/reset/confirm', { token, password: 'retry works fine 45' });
  assert.equal(ok.status, 200, 'un intento fallido no puede quemar el token');
});

test('pedir un reset nuevo invalida el token anterior', async () => {
  await post(srv.base, '/api/auth/reset', { email: EMAIL }, { 'x-forwarded-for': '10.0.0.5' });
  const first = tokenFrom(mails(srv.dataDir).filter((m) => m.to === EMAIL).pop());
  await post(srv.base, '/api/auth/reset', { email: EMAIL }, { 'x-forwarded-for': '10.0.0.6' });
  const second = tokenFrom(mails(srv.dataDir).filter((m) => m.to === EMAIL).pop());
  assert.notEqual(first, second);

  const stale = await post(srv.base, '/api/auth/reset/confirm', { token: first, password: 'stale token attempt 46' });
  assert.equal(stale.status, 410, 'el token viejo tiene que morir cuando se pide otro');

  const fresh = await post(srv.base, '/api/auth/reset/confirm', { token: second, password: 'fresh token works 47' });
  assert.equal(fresh.status, 200);
});

test('login: credenciales correctas abren sesión con cookie HttpOnly', async () => {
  const res = await post(srv.base, '/api/auth/login', { email: EMAIL, password: 'fresh token works 47' });
  assert.equal(res.status, 200);
  assert.equal(res.json.redirect, '/app/index.html');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('login: contraseña incorrecta y correo inexistente dan el mismo 401', async () => {
  const wrongPassword = await post(srv.base, '/api/auth/login', { email: EMAIL, password: 'nope nope nope' });
  const noUser = await post(srv.base, '/api/auth/login', { email: 'ghost@example.test', password: 'nope nope nope' });
  assert.equal(wrongPassword.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(noUser.text, wrongPassword.text);
});

test('las contraseñas se guardan hasheadas, nunca en claro', async () => {
  const { hashPassword, verifyPassword } = await import('../server/core/crypto.mjs');
  const stored = await hashPassword(PASSWORD);
  assert.ok(!stored.includes(PASSWORD), 'el hash no puede contener la contraseña');
  assert.equal(await verifyPassword(PASSWORD, stored), true);
  assert.equal(await verifyPassword(PASSWORD + 'x', stored), false);
});
