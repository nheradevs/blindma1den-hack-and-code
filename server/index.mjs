/* Local server: the static site and /api/auth/* on one origin, which is exactly
   how it runs on Netlify behind the redirect. No CORS, no third-party cookies,
   and the same security headers, so what you test locally is what ships.

   Usage:
     node server/index.mjs              # http://localhost:8080
     PORT=9000 node server/index.mjs
*/

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { createApi } from './core/handlers.mjs';
import { createStore } from './core/store.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const BODY_LIMIT = 8 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

// Same policy as netlify.toml, so a local run cannot hide a CSP problem.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

// Backend code is not part of the site: serving it would hand out the database.
const PRIVATE = ['/server/', '/tests/', '/netlify/'];

export function createAuthServer() {
  const api = createStore({ mode: config.storeMode, dataDir: config.dataDir }).then((store) => createApi({ store }));

  return createServer((req, res) => {
    api
      .then((handler) => route(req, res, handler))
      .catch((err) => {
        console.error('[server] error inesperado:', err && err.message);
        sendJson(res, 500, { ok: false, error: 'server_error' });
      });
  });
}

async function route(req, res, api) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return sendJson(res, 400, { ok: false, error: 'bad_request' });
  }

  if (url.pathname.startsWith('/api/')) return handleApi(req, res, api, url);
  return serveStatic(req, res, url);
}

async function handleApi(req, res, api, url) {
  let body = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    let raw;
    try {
      raw = await readBody(req);
    } catch (err) {
      const status = err.code === 413 ? 413 : 400;
      return sendJson(res, status, { ok: false, error: status === 413 ? 'payload_too_large' : 'bad_request' });
    }
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad_request' });
    }
  }

  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const result = await api.handle({
    method: req.method,
    path: url.pathname,
    body,
    ip: forwarded || req.socket.remoteAddress || '0.0.0.0',
    headers: req.headers
  });

  sendJson(res, result.status, result.body, result.headers);
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        const err = new Error('payload_too_large');
        err.code = 413;
        req.destroy();
        return reject(err);
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'bad_request' });
  }

  if (pathname.includes('\0')) return sendJson(res, 404, { ok: false, error: 'not_found' });
  let rel = pathname.replace(/^\/+/, '');
  if (rel === '' || pathname.endsWith('/')) rel += 'index.html';

  const segments = rel.split('/');
  const hidden = segments.some((part) => part.startsWith('.'));
  const isPrivate = PRIVATE.some((prefix) => ('/' + rel).startsWith(prefix)) || rel === 'netlify.toml';
  if (hidden || isPrivate || rel.includes('..')) return sendJson(res, 404, { ok: false, error: 'not_found' });

  const full = resolve(ROOT, rel);
  if (!full.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  let filePath = full;
  let stats;
  try {
    stats = statSync(filePath);
    if (stats.isDirectory()) {
      filePath = resolve(filePath, 'index.html');
      stats = statSync(filePath);
    }
  } catch {
    // Netlify resolves /reset to /reset.html (pretty URLs). Match that locally so
    // the links in the README and in emails behave the same in both places.
    if (!extname(full)) {
      try {
        filePath = full + '.html';
        stats = statSync(filePath);
      } catch {
        return sendJson(res, 404, { ok: false, error: 'not_found' });
      }
    } else {
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    }
  }

  const type = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Content-Length': stats.size,
    'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'public, max-age=60'
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(filePath).pipe(res);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === SELF;
if (invokedDirectly) {
  createAuthServer().listen(config.port, () => {
    console.log('Blindma1den Hack&Code + auth API en http://localhost:' + config.port);
    console.log('store: ' + config.storeMode + ' | mail: ' + config.mailMode + ' | base: ' + config.publicBaseUrl);
  });
}
