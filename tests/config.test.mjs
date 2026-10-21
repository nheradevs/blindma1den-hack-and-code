/* The function is bundled to CommonJS, where import.meta.url does not exist.
   Resolving it at import time used to crash the whole handler with
   'TypeError: Invalid URL'. These cases pin the safe behaviour. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDataDir } from '../server/config.mjs';

test('sin import.meta utilizable devuelve una ruta relativa en vez de explotar', () => {
  assert.equal(resolveDataDir(undefined), './.data');
  assert.equal(resolveDataDir(null), './.data');
  assert.equal(resolveDataDir(''), './.data');
  assert.equal(resolveDataDir('no es una url'), './.data');
});

test('con una URL de módulo válida devuelve la carpeta .data al lado del archivo', () => {
  const dir = resolveDataDir('file:///home/user/project/server/config.mjs');
  assert.equal(dir, '/home/user/project/server/.data/');
});
