/* Netlify Function: the same handlers as the local server, with the Blobs store.
   Reached through the redirect in netlify.toml, so the browser keeps talking to
   the same origin (/api/auth/*) and nothing needs CORS, a second domain or a
   different CSP. */

import { createApi } from '../../server/core/handlers.mjs';
import { createStore } from '../../server/core/store.mjs';

const PREFIX = '/.netlify/functions/auth';

let apiPromise = null;

function getApi() {
  if (!apiPromise) {
    apiPromise = createStore({ mode: process.env.AUTH_STORE || 'blobs' })
      .then((store) => createApi({ store }));
  }
  return apiPromise;
}

/* Netlify hands the original path (/api/auth/reset) when the request came
   through a rewrite, and the function path when it did not. Accept both. */
function apiPath(rawPath) {
  const value = String(rawPath || '');
  if (value.startsWith('/api/')) return value;
  const stripped = value.startsWith(PREFIX) ? value.slice(PREFIX.length) : value;
  return '/api/' + stripped.replace(/^\/+/, '');
}

export const handler = async (event) => {
  const path = apiPath(event.path);
  const headers = event.headers || {};

  let body = {};
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return json(400, { ok: false, error: 'bad_request' });
    }
  }

  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = headers['x-nf-client-connection-ip'] || forwarded || '0.0.0.0';

  let api;
  try {
    api = await getApi();
  } catch (err) {
    // Most likely the Blobs dependency is missing (see netlify.toml build command).
    console.error('[auth] no se pudo inicializar el store:', err && err.message);
    return json(500, { ok: false, error: 'store_unavailable' });
  }

  try {
    const result = await api.handle({ method: event.httpMethod, path, body, ip, headers });
    return json(result.status, result.body, result.headers);
  } catch (err) {
    console.error('[auth] error inesperado:', err && err.message);
    return json(500, { ok: false, error: 'server_error' });
  }
};

function json(status, body, extra = {}) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra
    },
    body: JSON.stringify(body)
  };
}
