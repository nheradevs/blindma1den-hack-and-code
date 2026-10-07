/* =========================================================
   Platform shell + page behaviours (vanilla JS).
   - Sidebar: collapse/expand on desktop, drawer on < 1024px
   - Popovers: notifications and account menu
   - "/" focuses search
   - Tabs (WAI-ARIA tabs pattern, arrow keys)
   - Lab demo (start/stop + countdown), flag demo, field notes
   - Demo buttons/forms show a toast instead of calling an API
   PROTOTYPE: nothing here talks to a backend yet.
   ========================================================= */
(function () {
  'use strict';

  var EN = {
    'app.menu.collapse': 'Collapse menu',
    'app.menu.expand': 'Expand menu',
    'app.menu.open': 'Open menu',
    'app.menu.close': 'Close menu',
    'app.ms.running': 'Running',
    'app.ms.stopped': 'Stopped',
    'app.ms.expired': 'Time’s up. The environment was reset.',
    'app.flag.empty': 'Paste a flag first.',
    'app.flag.format': 'Flags look like BM1{...}. Check what you copied.',
    'app.flag.demo': 'Demo mode: flags aren’t checked yet. In production, the server validates and rate-limits submissions.',
    'app.toast.demo': 'Demo mode: this action isn’t connected yet.',
    'app.toast.saved': 'Saved. It’ll be waiting in Inventory when you’re on a computer.',
    'app.toast.emailed': 'Demo mode: in production we’d email you the link.',
    'app.toast.soon': 'Registration opens soon. We’ll notify you.',
    'app.toast.removed': 'Removed from saved missions.',
    'app.toast.saved2': 'Demo mode: changes aren’t saved yet.',
    'app.toast.logout': 'Demo mode: taking you back to the login page.'
  };
  function t(key) {
    var dict = window.BM_I18N && window.BM_I18N[document.documentElement.lang];
    return (dict && dict[key]) || EN[key] || key;
  }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  var app = document.querySelector('[data-app]');
  if (!app) return;

  /* ---------- Toast ---------- */
  var toastEl = document.querySelector('[data-toast]');
  var toastTimer;
  function toast(key) {
    if (!toastEl) return;
    toastEl.textContent = t(key);
    toastEl.setAttribute('data-key', key);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4500);
  }

  /* ---------- Sidebar ---------- */
  var toggle = document.querySelector('[data-sb-toggle]');
  var overlay = document.querySelector('[data-sb-overlay]');
  var sidebar = document.getElementById('app-sidebar');
  var desktop = window.matchMedia('(min-width: 1024px)');
  var SB_KEY = 'bm-sidebar';

  function syncToggle() {
    if (!toggle) return;
    var key;
    if (desktop.matches) {
      var collapsed = app.getAttribute('data-sidebar') === 'collapsed';
      toggle.setAttribute('aria-expanded', String(!collapsed));
      key = collapsed ? 'app.menu.expand' : 'app.menu.collapse';
    } else {
      var open = app.classList.contains('is-drawer-open');
      toggle.setAttribute('aria-expanded', String(open));
      key = open ? 'app.menu.close' : 'app.menu.open';
    }
    toggle.setAttribute('aria-label', t(key));
  }
  function setDrawer(open) {
    app.classList.toggle('is-drawer-open', open);
    if (overlay) overlay.hidden = !open;
    syncToggle();
    if (open && sidebar) { var first = sidebar.querySelector('a, button'); if (first) first.focus(); }
  }
  if (store(SB_KEY) === 'collapsed') app.setAttribute('data-sidebar', 'collapsed');
  if (toggle) {
    toggle.addEventListener('click', function () {
      if (desktop.matches) {
        var collapsed = app.getAttribute('data-sidebar') === 'collapsed';
        if (collapsed) app.removeAttribute('data-sidebar'); else app.setAttribute('data-sidebar', 'collapsed');
        store(SB_KEY, collapsed ? 'expanded' : 'collapsed');
        syncToggle();
      } else {
        setDrawer(!app.classList.contains('is-drawer-open'));
      }
    });
  }
  if (overlay) overlay.addEventListener('click', function () { setDrawer(false); toggle.focus(); });
  var onMq = function () { setDrawer(false); };
  if (desktop.addEventListener) desktop.addEventListener('change', onMq); else desktop.addListener(onMq);
  syncToggle();

  /* ---------- Popovers ---------- */
  var menus = Array.prototype.slice.call(document.querySelectorAll('[data-menu]'));
  function closeMenus(except) {
    menus.forEach(function (btn) {
      if (btn === except) return;
      btn.setAttribute('aria-expanded', 'false');
      var p = document.getElementById(btn.getAttribute('aria-controls'));
      if (p) p.hidden = true;
    });
  }
  menus.forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = btn.getAttribute('aria-expanded') === 'true';
      closeMenus(btn);
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
      if (!open) { var f = panel.querySelector('a, button'); if (f) f.focus(); }
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
  });
  document.addEventListener('click', function () { closeMenus(); });

  /* ---------- Global keys: Esc, "/" ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var openBtn = menus.filter(function (b) { return b.getAttribute('aria-expanded') === 'true'; })[0];
      if (openBtn) { closeMenus(); openBtn.focus(); return; }
      if (app.classList.contains('is-drawer-open')) { setDrawer(false); toggle.focus(); }
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement.isContentEditable) return;
      var q = document.getElementById('app-q');
      if (q && q.offsetParent !== null) { e.preventDefault(); q.focus(); }
    }
  });

  /* ---------- Logout (demo) ---------- */
  document.querySelectorAll('form[data-logout]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); // In production: POST /api/auth/logout, server clears the session, then redirect.
      toast('app.toast.logout');
      setTimeout(function () { window.location.assign('../login.html'); }, 900);
    });
  });

  /* ---------- Demo actions ---------- */
  document.querySelectorAll('[data-demo-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () { toast(btn.getAttribute('data-demo-toast')); });
  });
  document.querySelectorAll('form[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); toast(form.getAttribute('data-demo-form')); });
  });

  /* ---------- Tabs (arrow keys, Home/End) ---------- */
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (tb) {
        var on = tb === tab;
        tb.setAttribute('aria-selected', String(on));
        tb.setAttribute('tabindex', on ? '0' : '-1');
        var p = document.getElementById(tb.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') n = tabs[0];
        if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
  });

  /* ---------- Lab / attack box (demo) ---------- */
  var lab = document.querySelector('[data-lab]');
  if (lab) {
    var idle = lab.querySelector('[data-lab-idle]');
    var running = lab.querySelector('[data-lab-running]');
    var statusText = lab.querySelector('[data-lab-status-text]');
    var timerBox = lab.querySelector('[data-lab-timer]');
    var timeEl = lab.querySelector('[data-lab-time]');
    var remaining = 60 * 60, interval = null;
    function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
    function setRunning(on) {
      lab.classList.toggle('is-running', on);
      idle.hidden = on; running.hidden = !on; timerBox.hidden = !on;
      statusText.setAttribute('data-i18n-live', on ? 'app.ms.running' : 'app.ms.stopped');
      statusText.textContent = t(on ? 'app.ms.running' : 'app.ms.stopped');
      clearInterval(interval);
      if (on) {
        remaining = 60 * 60; timeEl.textContent = fmt(remaining);
        interval = setInterval(function () {
          remaining -= 1; timeEl.textContent = fmt(remaining);
          if (remaining <= 0) { setRunning(false); toast('app.ms.expired'); }
        }, 1000);
        var stop = running.querySelector('[data-lab-stop]'); if (stop) stop.focus();
      } else {
        var start = idle.querySelector('[data-lab-start]'); if (start) start.focus();
      }
    }
    lab.querySelector('[data-lab-start]').addEventListener('click', function () { setRunning(true); });
    lab.querySelector('[data-lab-stop]').addEventListener('click', function () { setRunning(false); });
  }

  /* ---------- Flag submission (demo) ---------- */
  var flagForm = document.querySelector('[data-flag-form]');
  if (flagForm) {
    var flagInput = flagForm.querySelector('input');
    var flagMsg = flagForm.querySelector('.flag-msg');
    flagForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = flagInput.value.trim();
      var key = !v ? 'app.flag.empty' : (/^BM1\{[^\s{}]{1,180}\}$/.test(v) ? 'app.flag.demo' : 'app.flag.format');
      flagMsg.textContent = t(key);                 // textContent: never render user input as HTML
      flagMsg.setAttribute('data-key', key);
      flagMsg.className = 'flag-msg ' + (key === 'app.flag.demo' ? 'is-info' : 'is-error');
      flagMsg.hidden = false;
      flagInput.setAttribute('aria-invalid', String(key !== 'app.flag.demo'));
    });
  }

  /* ---------- Field notes: saved only in this browser ---------- */
  var notes = document.querySelector('[data-notes]');
  if (notes) {
    var nk = 'bm-notes-' + notes.getAttribute('data-notes');
    var saved = store(nk); if (saved) notes.value = saved;
    var nt;
    notes.addEventListener('input', function () { clearTimeout(nt); nt = setTimeout(function () { store(nk, notes.value); }, 400); });
  }

  /* ---------- Search page: echo the query safely ---------- */
  var echo = document.querySelector('[data-search-echo]');
  if (echo) {
    var q = (new URLSearchParams(window.location.search).get('q') || '').slice(0, 100);
    if (q) {
      echo.textContent = q;                           // textContent, not innerHTML (no XSS via ?q=)
      var input = document.getElementById('search-page-q'); if (input) input.value = q;
    }
  }

  /* ---------- Re-translate dynamic texts ---------- */
  document.addEventListener('bm:langchange', function () {
    syncToggle();
    document.querySelectorAll('[data-i18n-live]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n-live')); });
    document.querySelectorAll('.flag-msg[data-key], [data-toast][data-key]').forEach(function (el) { el.textContent = t(el.getAttribute('data-key')); });
  });
})();
