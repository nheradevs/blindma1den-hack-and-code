/* =========================================================
   Blindma1den Hack&Code — Public site behaviour
   Vanilla JS, no dependencies. Loaded with `defer`.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- i18n ---------- */
  var SUPPORTED = ['en', 'es'];
  var DEFAULT_LANG = 'en';
  var STORAGE_KEY = 'bm-lang';
  var dict = window.BM_I18N || {};

  // Strings that never appear in the HTML (set dynamically).
  var EN_DYNAMIC = { 'nav.open': 'Open menu', 'nav.close': 'Close menu' };

  var textEls = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
  var attrEls = Array.prototype.slice.call(document.querySelectorAll('[data-i18n-attr]'));

  // English lives in the HTML: cache it so we can switch back.
  var originalText = new Map();
  var originalAttr = new Map();
  textEls.forEach(function (el) { originalText.set(el, el.textContent); });
  attrEls.forEach(function (el) {
    var values = {};
    parseAttrSpec(el).forEach(function (pair) { values[pair.attr] = el.getAttribute(pair.attr); });
    originalAttr.set(el, values);
  });

  function parseAttrSpec(el) {
    // Format: "aria-label:nav.open;content:meta.description"
    return el.getAttribute('data-i18n-attr').split(';').map(function (part) {
      var bits = part.split(':');
      return { attr: bits[0].trim(), key: (bits[1] || '').trim() };
    });
  }

  // Avoid orphans: glue the last two words with a non-breaking space
  // so a single word never ends up alone on the last line.
  // (CSS text-wrap: pretty/balance does this too in modern browsers;
  // this is the fallback for the rest.)
  function noOrphan(text, maxPair) {
    var trimmed = text.replace(/\s+$/, '');
    var words = trimmed.split(/\s+/);
    if (words.length < 2) return text;
    // Don't glue very long pairs: they could overflow small screens.
    if ((words[words.length - 2] + words[words.length - 1]).length > maxPair) return text;
    return trimmed.replace(/\s+(\S+)$/, ' $1');
  }

  function t(lang, key, fallback) {
    if (lang !== DEFAULT_LANG && dict[lang] && dict[lang][key] != null) return dict[lang][key];
    return fallback;
  }

  var currentLang = DEFAULT_LANG;

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
    currentLang = lang;
    document.documentElement.lang = lang;

    textEls.forEach(function (el) {
      var text = t(lang, el.getAttribute('data-i18n'), originalText.get(el));
      // Big display headings only glue short word pairs, so they
      // never overflow narrow phones (CSS text-wrap: balance helps too).
      // Max length of the glued word pair: smaller for big headings so they never overflow phones.
      var maxPair = el.closest('h1') ? 14 : el.closest('h2, .tracks-lead, .tracks-question') ? 18 : 26;
      el.textContent = el.tagName === 'TITLE' ? text : noOrphan(text, maxPair);
    });
    attrEls.forEach(function (el) {
      var orig = originalAttr.get(el);
      parseAttrSpec(el).forEach(function (pair) {
        el.setAttribute(pair.attr, t(lang, pair.key, orig[pair.attr]));
      });
    });
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === lang));
    });
    syncToggleLabel();

    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage blocked: ignore */ }

    // Let page scripts (e.g. gauntlet.js) react to language changes.
    document.dispatchEvent(new CustomEvent('bm:langchange', { detail: { lang: lang } }));
  }

  function initialLang() {
    var fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl && SUPPORTED.indexOf(fromUrl) !== -1) return fromUrl;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) { /* ignore */ }
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(nav) !== -1 ? nav : DEFAULT_LANG;
  }

  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setLang(btn.getAttribute('data-lang')); });
  });

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  function isOpen() { return toggle && toggle.getAttribute('aria-expanded') === 'true'; }

  function syncToggleLabel() {
    if (!toggle) return;
    var key = isOpen() ? 'nav.close' : 'nav.open';
    toggle.setAttribute('aria-label', t(currentLang, key, EN_DYNAMIC[key]));
  }

  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    syncToggleLabel();
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () { setMenu(!isOpen()); });

    // Close on Escape and return focus to the toggle
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setMenu(false); toggle.focus(); }
    });

    // Close after choosing a link
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });

    // Reset when resizing to desktop
    var desktop = window.matchMedia('(min-width: 1200px)');
    var onChange = function () { if (desktop.matches) setMenu(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onChange);
    else desktop.addListener(onChange);
  }

  /* ---------- Current year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- Boot ---------- */
  setLang(initialLang());
})();
