/* Configuration for the auth backend. Everything comes from the environment so
   the same handlers run locally and on Netlify without code changes. */

import { fileURLToPath } from 'node:url';

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 8080),
  dataDir: process.env.AUTH_DATA_DIR || fileURLToPath(new URL('./.data/', import.meta.url)),

  // 'json' locally, 'blobs' inside Netlify Functions.
  storeMode: (process.env.AUTH_STORE || 'json').toLowerCase(),

  // Reset links: 30 minutes, single use, exactly one pending token per account.
  tokenTtlSeconds: num(process.env.AUTH_TOKEN_TTL_SECONDS, 30 * 60),
  sessionTtlSeconds: num(process.env.AUTH_SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),

  // Rate limits. No account lockout, ever: that would let anyone lock a known user out.
  rateWindowSeconds: num(process.env.AUTH_RATE_WINDOW_SECONDS, 10 * 60),
  rateResetPerIp: num(process.env.AUTH_RATE_RESET_MAX, 5),
  rateResetPerAccount: num(process.env.AUTH_RATE_ACCOUNT_MAX, 5),
  rateConfirmPerIp: num(process.env.AUTH_RATE_CONFIRM_MAX, 10),
  rateLoginPerIp: num(process.env.AUTH_RATE_LOGIN_MAX, 30),

  // The base URL is fixed on purpose: building it from the Host header is how
  // reset links get poisoned (Host header injection).
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:8080').replace(/\/+$/, ''),

  mailMode: (process.env.MAIL_MODE || 'log').toLowerCase(),
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'Blindma1den Hack&Code <onboarding@resend.dev>',

  // Cookies get Secure unless we are explicitly running plain-http localhost.
  cookieSecure: process.env.AUTH_COOKIE_SECURE !== 'false'
};
