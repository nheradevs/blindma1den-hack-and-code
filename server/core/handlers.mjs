/* The auth API. Framework-agnostic on purpose: the local Node server and the
   Netlify Function both call createApi().handle() and only translate transport.
   Rules that must not drift:
   - the same answer for an existing and a non-existing account;
   - no account lockout, ever (rate limits only);
   - tokens stored hashed, single use, one pending per account;
   - a failed attempt never consumes a token;
   - a reset never signs anybody in. */

import { config } from '../config.mjs';
import { emailKey, hashPassword, newToken, tokenHash, verifyPassword } from './crypto.mjs';
import { mailAvailable, sendMail } from './mailer.mjs';

const OK = { ok: true };
const WEAK = { ok: false, error: 'weak_password' };
const INVALID_TOKEN = { ok: false, error: 'invalid_token' };
const BAD_CREDENTIALS = { ok: false, error: 'invalid_credentials' };
const RATE_LIMITED = { ok: false, error: 'rate_limited' };
const MAIL_UNAVAILABLE = { ok: false, error: 'mail_unavailable' };

const COMMON = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'welcome', 'admin', 'iloveyou', 'blindma1den', 'hackandcode'];
const PLANS = ['recruit', 'operator', 'squad'];

function reply(status, body, headers = {}) {
  return { status, body, headers };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(email) {
  return email.length > 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function weakPassword(password, email) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 128) return true;
  const lower = value.toLowerCase();
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.indexOf(local) !== -1) return true;
  const squashed = lower.replace(/[\s\d!@#$%^&*._-]+/g, '');
  return COMMON.indexOf(squashed) !== -1 || COMMON.indexOf(lower) !== -1;
}

// A hash to verify against when the account does not exist, so a login takes
// roughly the same time either way.
let dummyHash = null;

export function createApi({ store }) {
  async function limited(key, max) {
    const count = await store.incr(key, config.rateWindowSeconds);
    return count > max;
  }

  async function register({ body }) {
    const email = normalizeEmail(body.email);
    // A malformed address gets the same answer as a taken one: no enumeration.
    if (!looksLikeEmail(email)) return reply(200, OK);
    if (weakPassword(body.password, email)) return reply(400, WEAK);

    const userKey = 'user:' + emailKey(email);
    const existing = await store.get(userKey);
    // Never overwrite an existing account from a public form.
    if (existing) return reply(200, OK);

    const plan = PLANS.indexOf(String(body.plan || '').toLowerCase()) !== -1 ? String(body.plan).toLowerCase() : '';
    await store.set(userKey, {
      email,
      hash: await hashPassword(body.password),
      plan,
      createdAt: Date.now()
    });

    return reply(200, OK);
  }

  async function login({ body, ip, headers }) {
    if (await limited('rl:login:' + ip, config.rateLoginPerIp)) {
      return reply(429, RATE_LIMITED, { 'Retry-After': String(config.rateWindowSeconds) });
    }

    const email = normalizeEmail(body.email);
    const userKey = 'user:' + emailKey(email);
    const user = looksLikeEmail(email) ? await store.get(userKey) : null;

    let valid = false;
    if (user) {
      valid = await verifyPassword(body.password, user.hash);
    } else {
      if (!dummyHash) dummyHash = await hashPassword(newToken(16));
      await verifyPassword(body.password, dummyHash);
    }
    if (!valid) return reply(401, BAD_CREDENTIALS);

    const sid = newToken(32);
    const sidKey = tokenHash(sid);
    await store.set('sess:' + sidKey, { userKey, exp: Date.now() + config.sessionTtlSeconds * 1000 }, config.sessionTtlSeconds);
    await store.set('usess:' + userKey + ':' + sidKey, 1, config.sessionTtlSeconds);

    const secure = config.cookieSecure && String(headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const cookie = 'sid=' + sid + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + config.sessionTtlSeconds + (secure ? '; Secure' : '');
    return reply(200, { ok: true, redirect: '/app/index.html' }, { 'Set-Cookie': cookie });
  }

  async function resetRequest({ body, ip }) {
    // Refuse before touching any state: a global 503 leaks nothing about the
    // account and stops the UI from promising a link it cannot send.
    if (!mailAvailable()) return reply(503, MAIL_UNAVAILABLE, { 'Retry-After': '300' });

    if (await limited('rl:reset:ip:' + ip, config.rateResetPerIp)) {
      return reply(429, RATE_LIMITED, { 'Retry-After': String(config.rateWindowSeconds) });
    }

    const email = normalizeEmail(body.email);
    const id = emailKey(email);
    if (await limited('rl:reset:acct:' + id, config.rateResetPerAccount)) {
      return reply(429, RATE_LIMITED, { 'Retry-After': String(config.rateWindowSeconds) });
    }

    const userKey = 'user:' + id;
    const user = looksLikeEmail(email) ? await store.get(userKey) : null;

    // Same work whether or not the account exists: issue a token, replace the
    // previous one, and only send mail to a real address. The residual timing
    // difference is the mail call; the fix is a queue, noted in the README.
    const token = newToken(32);
    const hashed = tokenHash(token);
    const previous = await store.get('lastrt:' + userKey);
    if (previous) await store.del('token:' + previous);
    await store.set('lastrt:' + userKey, hashed, config.tokenTtlSeconds);
    await store.set('token:' + hashed, { userKey, exp: Date.now() + config.tokenTtlSeconds * 1000 }, config.tokenTtlSeconds);

    if (user) {
      // The link is built from a fixed base URL: trusting the Host header is how
      // password reset links get poisoned.
      const link = config.publicBaseUrl + '/reset-password#token=' + token;
      await sendMail({
        to: user.email,
        subject: 'Reset your Blindma1den Hack&Code keys',
        text: [
          'Someone asked to reset the password for this account.',
          '',
          'Open this link to choose a new one. It expires in 30 minutes and works once:',
          link,
          '',
          'If it was not you, ignore this message: the password stays as it is.'
        ].join('\n')
      });
    }

    return reply(200, OK);
  }

  async function resetConfirm({ body, ip }) {
    if (await limited('rl:confirm:' + ip, config.rateConfirmPerIp)) {
      return reply(429, RATE_LIMITED, { 'Retry-After': String(config.rateWindowSeconds) });
    }

    const token = String(body.token || '');
    const hashed = tokenHash(token);
    // Unknown, expired and already-used tokens all land here, identically.
    const record = token ? await store.get('token:' + hashed) : null;
    if (!record) return reply(410, INVALID_TOKEN);

    const userKey = record.userKey;
    const user = await store.get(userKey);
    if (!user) {
      await store.del('token:' + hashed);
      return reply(410, INVALID_TOKEN);
    }

    // Validating before consuming: a short password must not burn the link.
    if (weakPassword(body.password, user.email)) return reply(400, WEAK);

    await store.set(userKey, { ...user, hash: await hashPassword(body.password), updatedAt: Date.now() });
    await store.del('token:' + hashed);
    await store.del('lastrt:' + userKey);

    // Anyone already holding a session loses it, and every other pending reset dies.
    const prefix = 'usess:' + userKey + ':';
    for (const key of await store.keysByPrefix(prefix)) {
      await store.del('sess:' + key.slice(prefix.length));
    }
    await store.delByPrefix('usess:' + userKey + ':');
    await store.delByPrefix('rltok:' + userKey + ':');

    await sendMail({
      to: user.email,
      subject: 'Your Blindma1den Hack&Code password was changed',
      text: [
        'The password for this account was just changed, and every open session was closed.',
        '',
        'If it was you, log in again from the Access page.',
        'If it was not you, reset the password again right now and reply to this message.'
      ].join('\n')
    });

    return reply(200, OK);
  }

  async function handle({ method, path, body, ip, headers }) {
    const route = String(path || '').split('?')[0];

    if (route === '/api/health' && method === 'GET') {
      // `mail` is a capability, not a promise: the frontend uses it to decide
      // whether the reset flow can be offered at all.
      return reply(200, { ok: true, backend: 'local', mail: mailAvailable() });
    }
    if (method !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' });

    const payload = body && typeof body === 'object' ? body : {};
    const ctx = { body: payload, ip: ip || '0.0.0.0', headers: headers || {} };

    if (route === '/api/auth/register') return register(ctx);
    if (route === '/api/auth/login') return login(ctx);
    if (route === '/api/auth/reset') return resetRequest(ctx);
    if (route === '/api/auth/reset/confirm') return resetConfirm(ctx);
    // Magic links are not implemented yet. The answer stays generic on purpose:
    // the frontend shows the same "if there is an account" message either way.
    if (route === '/api/auth/magic-link') return reply(200, OK);

    return reply(404, { ok: false, error: 'not_found' });
  }

  return { handle };
}
