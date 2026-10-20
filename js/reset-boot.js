/* =========================================================
   Reset token bootstrap. Runs synchronously in <head>, before
   any deferred or injected script (Netlify snippets, analytics,
   third parties) can read window.location.

   Why: a reset token in the query string leaks through server
   and proxy logs, the Referer header of every subresource, the
   browser history and any script that touches location.href.
   Here the token is moved into sessionStorage and the address
   bar is cleaned immediately.

   No token in storage, or history unavailable (sandboxed preview,
   storage blocked): the URL is left untouched so js/auth.js can
   still read it. Never break the flow to gain a bit of hygiene.
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'bm-reset-token';
  var MAX = 512;
  var ALLOWED = /^[A-Za-z0-9._~-]+$/;

  var token = '';
  try {
    var hash = window.location.hash.replace(/^#/, '');
    // Fragment first: it never reaches the server, so it is the better place for a token.
    var params = new URLSearchParams(hash.indexOf('token=') === 0 ? hash : window.location.search);
    var raw = params.get('token') || '';
    // Anything longer, or outside the base64url/hex alphabet, is noise: ignore it.
    if (raw && raw.length <= MAX && ALLOWED.test(raw)) token = raw;
  } catch (e) {
    return; // no URLSearchParams: leave everything as it is
  }

  if (!token) return;

  var stored = false;
  try {
    sessionStorage.setItem(KEY, token);
    stored = true;
  } catch (e) {
    /* storage blocked (Safari private mode, cookies off): keep the URL */
  }

  if (stored) {
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch (e) {
      /* history blocked: the token is already in sessionStorage, nothing else to do */
    }
  }
})();
