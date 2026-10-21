/* Storage for the auth backend.
   - mode 'json'  : one file on disk, used by tests and the local server.
   - mode 'blobs' : Netlify Blobs, used by the deployed function. The dependency
                    is imported lazily so the local path never needs it.
   Records carry an absolute expiry; an expired record is a missing record. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.mjs';

export async function createStore({ mode = 'json', dataDir = config.dataDir } = {}) {
  if (mode === 'blobs') return createBlobsStore();
  return createJsonStore(dataDir);
}

function createJsonStore(dataDir) {
  const file = join(dataDir, 'db.json');
  let records = null;

  function load() {
    if (records) return records;
    try {
      records = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      records = {};
    }
    return records;
  }

  function save() {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(records), { mode: 0o600 });
    renameSync(tmp, file); // atomic: a crash never leaves half a database
  }

  function alive(record) {
    return record && (record.exp === null || record.exp === undefined || record.exp > Date.now());
  }

  return {
    async get(key) {
      const all = load();
      const record = all[key];
      if (!record) return null;
      if (!alive(record)) { delete all[key]; save(); return null; }
      return record.v;
    },

    async set(key, value, ttlSeconds = 0) {
      const all = load();
      all[key] = { v: value, exp: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null };
      save();
    },

    async del(key) {
      const all = load();
      if (!(key in all)) return;
      delete all[key];
      save();
    },

    async delByPrefix(prefix) {
      const all = load();
      let touched = false;
      for (const key of Object.keys(all)) {
        if (key.startsWith(prefix)) { delete all[key]; touched = true; }
      }
      if (touched) save();
    },

    async keysByPrefix(prefix) {
      const all = load();
      return Object.keys(all).filter((key) => key.startsWith(prefix) && alive(all[key]));
    },

    async incr(key, ttlSeconds = 0) {
      const all = load();
      const current = alive(all[key]) ? Number(all[key].v) || 0 : 0;
      const exp = alive(all[key]) && all[key].exp ? all[key].exp : (ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null);
      all[key] = { v: current + 1, exp };
      save();
      return current + 1;
    }
  };
}

function codedError(code, cause) {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

async function createBlobsStore() {
  let getStore;
  try {
    ({ getStore } = await import('@netlify/blobs'));
  } catch (err) {
    // The package is not installed or not bundled into the function.
    throw codedError('store_dependency_missing', err);
  }

  let store;
  try {
    store = getStore({ name: 'bm-auth', consistency: 'strong' });
  } catch (err) {
    // Package present, credentials missing: classic functions need connectLambda(event).
    throw codedError('store_context_missing', err);
  }

  async function read(key) {
    const record = await store.get(key, { type: 'json' });
    if (!record) return null;
    if (record.exp && record.exp <= Date.now()) { await store.delete(key); return null; }
    return record;
  }

  return {
    async get(key) {
      const record = await read(key);
      return record ? record.v : null;
    },

    async set(key, value, ttlSeconds = 0) {
      const exp = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
      await store.setJSON(key, { v: value, exp });
    },

    async del(key) {
      await store.delete(key);
    },

    async delByPrefix(prefix) {
      const { blobs } = await store.list({ prefix });
      for (const blob of blobs) await store.delete(blob.key);
    },

    async keysByPrefix(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((blob) => blob.key);
    },

    // Not atomic: Blobs has no compare-and-swap. Netlify's traffic rules are the
    // real limiter in production; this keeps the local behaviour honest.
    async incr(key, ttlSeconds = 0) {
      const record = await read(key);
      const current = record ? Number(record.v) || 0 : 0;
      const exp = record && record.exp ? record.exp : (ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null);
      await store.setJSON(key, { v: current + 1, exp });
      return current + 1;
    }
  };
}
