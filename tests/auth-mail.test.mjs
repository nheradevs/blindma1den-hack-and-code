/* A deployment without a mail transport must not pretend it sent a link.
   Its own process: the capability is read from the environment at import. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, post, get, PASSWORD } from './helpers.mjs';

let srv;

test.before(async () => {
  // Production shape: serverless runtime, Resend selected, no key loaded yet.
  srv = await startServer({ MAIL_MODE: 'resend', RESEND_API_KEY: '', NETLIFY: 'true' });
  await post(srv.base, '/api/auth/register', { email: 'nokey@example.test', password: PASSWORD });
});
test.after(async () => { await srv.close(); });

test('health declara que no puede enviar correo', async () => {
  const res = await get(srv.base, '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.mail, false, 'la capacidad tiene que viajar en el health');
});

test('pedir reset sin transporte de correo devuelve 503, no un éxito falso', async () => {
  const existing = await post(srv.base, '/api/auth/reset', { email: 'nokey@example.test' }, { 'x-forwarded-for': '10.9.0.1' });
  const unknown = await post(srv.base, '/api/auth/reset', { email: 'ghost@example.test' }, { 'x-forwarded-for': '10.9.0.2' });
  assert.equal(existing.status, 503);
  assert.equal(existing.json.error, 'mail_unavailable');
  assert.equal(unknown.status, 503);
  assert.equal(unknown.text, existing.text, 'cuenta existente e inexistente tienen que responder igual');
});

test('con el correo caído no se escribe ningún mail ni se consume el límite', async () => {
  assert.equal(existsSync(join(srv.dataDir, 'mail.log')), false, 'no puede haber un correo registrado');
  // Cinco rechazos seguidos no deben gastar el límite por IP: el 503 no es un intento del usuario.
  for (let i = 0; i < 5; i++) {
    const res = await post(srv.base, '/api/auth/reset', { email: 'nokey@example.test' }, { 'x-forwarded-for': '10.9.1.1' });
    assert.equal(res.status, 503);
  }
});
