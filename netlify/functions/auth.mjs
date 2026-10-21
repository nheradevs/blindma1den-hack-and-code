/* Netlify Function (v2) for /api/auth/*.
   v2 is not a style choice: it is the mode where Netlify Blobs is configured
   automatically. Under v1 the store could be created but every operation failed,
   because the credentials had to be threaded through connectLambda(event) by
   hand. Same handlers as the local server; only the transport differs. */

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
function apiPath(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = String(rawUrl || '');
  }
  if (pathname.startsWith('/api/')) return pathname;
  const stripped = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname;
  return '/api/' + stripped.replace(/^\/+/, '');
}

export default async (request, context) => {
  const path = apiPath(request.url);
  const headers = Object.fromEntries(request.headers);

  let body = {};
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(400, { ok: false, error: 'bad_request' });
    }
  }

  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (context && context.ip) || headers['x-nf-client-connection-ip'] || forwarded || '0.0.0.0';

  let api;
  try {
    api = await getApi();
  } catch (err) {
    console.error('[auth] no se pudo inicializar el store:', err && err.code, err && err.message);
    return json(500, { ok: false, error: (err && err.code) || 'store_unavailable' });
  }

  try {
    const result = await api.handle({ method: request.method, path, body, ip, headers });
    return json(result.status, result.body, result.headers);
  } catch (err) {
    // A store operation failed (read or write), not the handler logic.
    console.error('[auth] fallo una operación del store:', err && err.name, err && err.message);
    return json(500, { ok: false, error: 'store_operation_failed', code: (err && err.name) || 'Error' });
  }
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra
    }
  });
}
