/* =========================================================
   Auth forms: Access (login), Enlist (register), Reset.
   Vanilla JS. Progressive enhancement: without JS the forms
   still POST to their `action` (once the backend exists).

   ---------------------------------------------------------
   BACKEND CONTRACT (to implement server-side; the browser
   can't enforce any of this, it only helps the user)
   ---------------------------------------------------------
   POST /api/auth/login        { email, password }
   POST /api/auth/register     { email, password, plan }
   POST /api/auth/reset        { email }
   POST /api/auth/reset/confirm { token, password }
   POST /api/auth/magic-link   { email }

   - Responses never reveal whether an email exists
     (same message and similar timing for every case).
   - Passwords: 12–128 chars, any Unicode incl. spaces,
     no composition rules, rejected if found in breached
     password lists (e.g. HIBP k-anonymity API).
     Hash with Argon2id (or bcrypt/scrypt), never encrypt.
   - Rate limit per IP and per account; after repeated
     failures reply with { captcha: true } and the
     frontend shows the bot-check slot. No hard lockouts
     (they enable denial of service against users).
   - Session: HttpOnly + Secure + SameSite=Lax cookie,
     rotated on login, short idle timeout. CSRF token on
     state-changing requests.
   - Magic links and reset links: single use, ~15–30 min
     expiry, invalidated after password change.
   - Offer MFA (TOTP / passkeys) inside the platform.
   - Log auth events without logging passwords or tokens.

   RESET FLOW (reset.html -> reset-password.html)
   1. POST /api/auth/reset { email } answers 200 with the same
      body for existing and non-existing accounts, in the same
      amount of time (queue the mail, don't await it on one path
      only), 429 when the per-IP/per-account limit is hit.
   2. The mail carries HTTPS /reset-password#token=<token>:
      32 random bytes from a CSPRNG, base64url. Store only its
      hash, bound to the user, with created_at + expires_at.
      The fragment form never reaches the server, so the token
      stays out of access logs and Referer; js/reset-boot.js
      moves it into sessionStorage and cleans the address bar
      before any other script runs. On the server side, prefer
      exchanging the token for a short-lived, scoped session
      cookie (POST /api/auth/reset/verify) and redirect to a URL
      with no token at all.
   3. POST /api/auth/reset/confirm { token, password }: mark the
      token used (single use), apply the same password policy and
      hash as registration, reply 200, 400 on a weak password and
      a generic 410/400 for expired, used or unknown tokens (never
      say which, never say whose).
   4. Then: send the notification email, invalidate every session
      and every other outstanding reset token for that user, and
      do NOT start a session here: the UI sends the user back to
      Access to log in normally.
   5. Rate limit the token endpoints too, and never lock the
      account on reset requests (that turns the form into a
      denial-of-service tool against known usernames).
   ========================================================= */
(function () {
  'use strict';

  // Set to true once /api/auth/* exists. While false, nothing is sent anywhere.
  var BACKEND_READY = false;

  var MIN_PW = 12;
  var MAX_PW = 128;
  var PLANS = ['recruit', 'operator', 'squad'];

  /* ---------- Messages (EN here, ES in i18n.js under the same keys) ---------- */
  var EN = {
    'auth.err.emailRequired': 'Enter your email address.',
    'auth.err.emailInvalid': 'That doesn’t look like an email address.',
    'auth.err.pwRequired': 'Enter your password.',
    'auth.err.pwShort': 'At least 12 characters. Short passwords fall first.',
    'auth.err.pwLong': 'Maximum 128 characters. Impressive, but no.',
    'auth.err.pwEmail': 'Your password can’t contain your email.',
    'auth.err.pwCommon': 'That one is on every attacker’s list. Pick another.',
    'auth.err.pwMismatch': 'The two passwords don’t match.',
    'auth.err.generic': 'Something went wrong. Try again in a moment.',
    'auth.err.login': 'Email or password is incorrect.',
    'auth.pw.rule': 'At least 12 characters. Spaces and any symbol allowed. Long beats complex.',
    'auth.pw.weak': 'Too short. Keep going.',
    'auth.pw.ok': 'Acceptable. Longer would be better.',
    'auth.pw.strong': 'Strong. Attackers will need patience.',
    'auth.show': 'Show password',
    'auth.hide': 'Hide password',
    'auth.sending': 'Checking…',
    'auth.ok.register': 'If this email can be used, a confirmation link is on its way. Check your inbox.',
    'auth.ok.reset': 'If there’s an account for that email, a reset link is on its way.',
    'auth.ok.magic': 'If there’s an account for that email, a magic link is on its way.',
    'auth.err.magicEmail': 'Enter your email above first, then ask for the magic link.',
    'auth.demo': 'Demo mode: the authentication backend isn’t connected yet, so nothing was sent.',
    'reset.rate': 'Too many requests from here. Wait a couple of minutes and try again.',
    'reset.resend': 'Send another link',
    'reset.resendWait': 'Send again in %ss'
  };

  function t(key) {
    var lang = document.documentElement.lang;
    var dict = window.BM_I18N && window.BM_I18N[lang];
    return (dict && dict[key]) || EN[key] || key;
  }

  // Translated text with one substituted value ("Send again in %ss" -> "... 45s").
  function tf(key, value) {
    return t(key).replace('%s', String(value));
  }

  // Tiny list of the most common passwords. The real check (breached lists) happens server-side.
  var COMMON = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'welcome', 'admin', 'iloveyou', 'blindma1den', 'hackandcode'];

  function emailError(input) {
    var v = input.value.trim();
    if (!v) return 'auth.err.emailRequired';
    // Light check only; the server is the source of truth.
    if (input.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'auth.err.emailInvalid';
    return null;
  }

  function passwordError(input, mode, email) {
    var v = input.value;
    if (!v) return 'auth.err.pwRequired';
    if (mode !== 'register') return null; // Login: never hint at password rules.
    if (v.length < MIN_PW) return 'auth.err.pwShort';
    if (v.length > MAX_PW) return 'auth.err.pwLong';
    var lower = v.toLowerCase();
    var local = (email || '').split('@')[0].toLowerCase();
    if (local.length >= 4 && lower.indexOf(local) !== -1) return 'auth.err.pwEmail';
    var squashed = lower.replace(/[\s\d!@#$%^&*._-]+/g, '');
    if (COMMON.some(function (c) { return squashed === c || lower === c; })) return 'auth.err.pwCommon';
    return null;
  }

  function strength(v) {
    if (v.length < MIN_PW) return 0;
    var classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(function (r) { return r.test(v); }).length;
    var words = v.trim().split(/\s+/).length;
    if (v.length >= 20 || (v.length >= 16 && (classes >= 3 || words >= 4))) return 2;
    return 1;
  }

  function showError(input, key) {
    var el = document.getElementById(input.id + '-error');
    if (!el) return;
    if (key) {
      el.textContent = t(key);
      el.setAttribute('data-key', key);
      el.hidden = false;
      input.setAttribute('aria-invalid', 'true');
    } else {
      el.textContent = '';
      el.removeAttribute('data-key');
      el.hidden = true;
      input.removeAttribute('aria-invalid');
    }
  }

  // `root` is any element that contains a [data-status] region (a form, or a reset panel).
  function setStatus(root, key, kind) {
    if (!root) return;
    var el = root.querySelector('[data-status]');
    if (!el) return;
    if (!key) { el.hidden = true; el.textContent = ''; el.removeAttribute('data-key'); return; }
    el.textContent = t(key);
    el.setAttribute('data-key', key);
    el.className = 'auth-status' + (kind ? ' is-' + kind : '');
    el.hidden = false;
  }

  /* ---------- Password visibility toggle ---------- */
  document.querySelectorAll('.pw-toggle').forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', t(show ? 'auth.hide' : 'auth.show'));
      input.focus();
    });
  });

  /* ---------- Caps Lock warning ---------- */
  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    var warn = document.getElementById(input.id.replace('-password', '-caps'));
    if (!warn) return;
    function check(e) { if (e.getModifierState) warn.hidden = !e.getModifierState('CapsLock'); }
    input.addEventListener('keydown', check);
    input.addEventListener('keyup', check);
    input.addEventListener('blur', function () { warn.hidden = true; });
  });

  /* ---------- Strength meter (register) ---------- */
  var pwNew = document.querySelector('[data-strength]');
  var meter = document.querySelector('[data-meter]');
  var hint = document.querySelector('[data-strength-hint]');
  function updateMeter() {
    if (!pwNew || !meter || !hint) return;
    var v = pwNew.value;
    if (!v) {
      meter.className = '';
      hint.textContent = t('auth.pw.rule');
      return;
    }
    var s = strength(v);
    meter.className = 'is-' + ['weak', 'ok', 'strong'][s];
    hint.textContent = t(['auth.pw.weak', 'auth.pw.ok', 'auth.pw.strong'][s]);
  }
  if (pwNew) pwNew.addEventListener('input', updateMeter);

  /* ---------- Plan from URL (?plan=operator), allowlisted ---------- */
  var planInput = document.querySelector('[data-plan]');
  if (planInput) {
    var plan = (new URLSearchParams(window.location.search).get('plan') || '').toLowerCase();
    planInput.value = PLANS.indexOf(plan) !== -1 ? plan : '';
  }

  /* ---------- Submit ---------- */
  function send(url, payload) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function busy(form, on) {
    var btn = form.querySelector('[data-submit]');
    if (!btn) return;
    if (on) {
      btn.setAttribute('data-label', btn.textContent);
      btn.textContent = t('auth.sending');
      btn.disabled = true;
      form.setAttribute('aria-busy', 'true');
    } else {
      btn.textContent = btn.getAttribute('data-label') || btn.textContent;
      btn.disabled = false;
      form.removeAttribute('aria-busy');
    }
  }

  function successKey(mode) {
    return { register: 'auth.ok.register', reset: 'auth.ok.reset', magic: 'auth.ok.magic' }[mode];
  }

  /* ---------- Reset step 2 (/reset-password.html): token + outcome panels ---------- */
  var TOKEN_KEY = 'bm-reset-token';
  var PANEL_HEADINGS = { form: 'reset-form-h', done: 'reset-done-h', invalid: 'reset-invalid-h' };
  var resetPanels = {
    form: document.getElementById('panel-reset-form'),
    done: document.getElementById('panel-reset-done'),
    invalid: document.getElementById('panel-reset-invalid')
  };

  function readResetToken() {
    try {
      var stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) return stored;
    } catch (e) { /* storage blocked: fall through to the URL */ }
    // js/reset-boot.js could not run or could not store it: read the URL as a last resort.
    try { return new URLSearchParams(window.location.search).get('token') || ''; } catch (e) { return ''; }
  }

  function clearResetToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  }

  function showResetPanel(which, focus) {
    if (!resetPanels.form) return;
    Object.keys(resetPanels).forEach(function (k) {
      if (resetPanels[k]) resetPanels[k].hidden = k !== which;
    });
    if (focus) {
      var h = document.getElementById(PANEL_HEADINGS[which]);
      if (h) h.focus();
    }
  }

  // Landed on step 2 without a token: broken, expired or already used link.
  if (resetPanels.form) showResetPanel(readResetToken() ? 'form' : 'invalid', false);

  /* ---------- Resend cooldown (reset request form) ----------
     One request per minute per browser tab. The real limit is server-side
     (per IP and per account); this only stops double submits and gives the
     user something to look at instead of a dead button. */
  var RESEND_SECONDS = 60;

  function startCooldown(form, seconds) {
    var btn = form.querySelector('[data-submit]');
    if (!btn) return;
    if (form.__cooldown) clearInterval(form.__cooldown);
    if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', btn.textContent);
    // Hand the label over to the countdown: main.js re-applies data-i18n texts on
    // language change, which would otherwise overwrite it mid-count.
    btn.removeAttribute('data-i18n');
    var left = seconds || RESEND_SECONDS;

    function paint() {
      if (form.__cooldownLeft > 0) btn.textContent = tf('reset.resendWait', form.__cooldownLeft);
      else btn.textContent = t('reset.resend');
    }
    function tick() {
      form.__cooldownLeft = left;
      if (left < 0) {
        clearInterval(form.__cooldown);
        form.__cooldown = null;
        btn.disabled = false;
        paint();
        return;
      }
      btn.disabled = true;
      paint();
      left--;
    }
    form.__cooldownPaint = paint;
    tick();
    form.__cooldown = setInterval(tick, 1000);
  }

  document.querySelectorAll('form[data-auth]').forEach(function (form) {
    var mode = form.getAttribute('data-auth');
    var email = form.querySelector('input[type="email"]');
    var password = form.querySelector('input[name="password"]');
    var password2 = form.querySelector('input[name="password2"]');
    // Setting a new password (register or reset step 2) applies the same policy;
    // login never hints at password rules.
    var policy = (mode === 'register' || mode === 'reset-confirm') ? 'register' : mode;

    // Clear an error as soon as the user fixes the field.
    [email, password, password2].forEach(function (input) {
      if (!input) return;
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') showError(input, null);
      });
    });

    function validate() {
      var first = null;
      if (email) {
        var eKey = emailError(email);
        showError(email, eKey);
        if (eKey) first = email;
      }
      if (password) {
        var pKey = passwordError(password, policy, email ? email.value : '');
        showError(password, pKey);
        if (pKey && !first) first = password;
      }
      if (password2) {
        // Two fields, one value: an empty or different repetition is a user error,
        // never a hint about the account.
        var cKey = !password2.value ? 'auth.err.pwRequired' : (password2.value !== password.value ? 'auth.err.pwMismatch' : null);
        showError(password2, cKey);
        if (cKey && !first) first = password2;
      }
      if (first) first.focus();
      return !first;
    }

    function submit(kind, url, payload) {
      setStatus(form, null);
      if (password) { password.type = 'password'; } // never leave it visible / saved as text
      form.querySelectorAll('.pw-toggle').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', t('auth.show')); });

      if (!BACKEND_READY) {
        // Demo mode: no backend exists yet, so nothing is sent anywhere.
        // Access/Enlist validate locally and then let the visitor into the
        // prototype platform. Reset and magic link keep the notice, because
        // there is no email to send without a server.
        if (kind === 'login' || kind === 'register') {
          window.location.assign('app/index.html');
          return;
        }
        if (kind === 'reset-confirm') {
          // No server to store the password: show the outcome panels with the demo
          // notice on top, so the state is reviewable without ever claiming that a
          // real change (or a real session invalidation) happened.
          if (password) password.value = '';
          if (password2) password2.value = '';
          showResetPanel('done', true);
          setStatus(resetPanels.done, 'auth.demo', 'info');
          clearResetToken();
          return;
        }
        setStatus(form, 'auth.demo', 'info');
        if (kind === 'reset') startCooldown(form);
        return;
      }

      busy(form, true);
      send(url, payload).then(function (r) {
        busy(form, false);
        if (r.data && r.data.captcha) {
          var slot = form.querySelector('[data-captcha]');
          if (slot) slot.hidden = false; // the bot-check widget mounts here
        }
        if (kind === 'login') {
          if (r.ok && r.data.redirect && r.data.redirect.charAt(0) === '/' && r.data.redirect.charAt(1) !== '/') {
            window.location.assign(r.data.redirect); // same-origin paths only (no open redirect)
          } else if (r.ok) {
            window.location.assign('/app/');
          } else {
            setStatus(form, r.status === 429 ? 'auth.err.generic' : 'auth.err.login', 'error');
            password.value = '';
            password.focus();
          }
        } else if (kind === 'reset-confirm') {
          // 200 -> done. 400/410 (weak password, expired, used, unknown token) ->
          // generic dead-end panel: the UI never says which case it was, or whose.
          if (r.ok) {
            if (password) password.value = '';
            if (password2) password2.value = '';
            showResetPanel('done', true);
            clearResetToken();
          } else if (r.status === 429) {
            setStatus(form, 'reset.rate', 'error');
          } else if (r.status >= 500) {
            setStatus(form, 'auth.err.generic', 'error');
          } else {
            showResetPanel('invalid', true);
            clearResetToken();
          }
        } else {
          // Register / reset / magic link: same answer whatever happened, to avoid
          // account enumeration. A 429 is a client-side limit, not an account fact,
          // so it gets its own message.
          if (r.status === 429) {
            setStatus(form, kind === 'reset' ? 'reset.rate' : 'auth.err.generic', 'error');
            if (kind === 'reset') startCooldown(form);
          } else {
            setStatus(form, r.status >= 500 ? 'auth.err.generic' : successKey(kind), r.status >= 500 ? 'error' : 'ok');
            if (kind === 'reset' && r.status < 500) startCooldown(form);
          }
          if (kind === 'register' && password) password.value = '';
        }
      }).catch(function () {
        busy(form, false);
        setStatus(form, 'auth.err.generic', 'error');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;
      var payload;
      if (mode === 'reset-confirm') {
        var token = readResetToken();
        if (!token) { showResetPanel('invalid', true); return; }
        payload = { token: token, password: password.value };
      } else {
        payload = { email: email.value.trim() };
        if (password) payload.password = password.value;
        var plan = form.querySelector('[data-plan]');
        if (plan && plan.value) payload.plan = plan.value;
      }
      submit(mode, form.getAttribute('action'), payload);
    });

    var magic = form.querySelector('[data-magic]');
    if (magic) {
      magic.addEventListener('click', function () {
        if (password) showError(password, null);
        var eKey = emailError(email);
        if (eKey) {
          showError(email, 'auth.err.magicEmail');
          email.focus();
          return;
        }
        showError(email, null);
        submit('magic', '/api/auth/magic-link', { email: email.value.trim() });
      });
    }
  });

  /* ---------- Access / Enlist switch ----------
     Both panels are in the page. The tabs are normal links (login.html / signup.html);
     here we intercept the click, swap panels without reloading and update the URL
     with history.pushState so refresh, back/forward and shared links still work. */
  var card = document.querySelector('[data-auth-card]');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-switch]'));
  var VIEWS = {
    login:    { panel: 'panel-login',    heading: 'login-h',    file: 'login.html',  titleKey: 'auth.meta.title', titleEn: 'Access — Blindma1den Hack&Code' },
    register: { panel: 'panel-register', heading: 'register-h', file: 'signup.html', titleKey: 'enl.meta.title',  titleEn: 'Enlist — Blindma1den Hack&Code' }
  };
  var currentView = card && card.classList.contains('is-register') ? 'register' : 'login';

  function viewTitle(view) {
    var v = VIEWS[view];
    var lang = document.documentElement.lang;
    var dict = window.BM_I18N && window.BM_I18N[lang];
    return (dict && dict[v.titleKey]) || v.titleEn;
  }

  function showView(view, opts) {
    if (!card || !VIEWS[view]) return;
    opts = opts || {};
    currentView = view;
    Object.keys(VIEWS).forEach(function (k) {
      var panel = document.getElementById(VIEWS[k].panel);
      if (panel) panel.hidden = k !== view;
    });
    card.classList.remove('is-login', 'is-register');
    card.classList.add('is-' + view);
    tabs.forEach(function (tab) {
      if (tab.getAttribute('data-switch') === view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    var navLogin = document.querySelector('.nav-login');
    if (navLogin) {
      if (view === 'login') navLogin.setAttribute('aria-current', 'page');
      else navLogin.removeAttribute('aria-current');
    }
    document.title = viewTitle(view);
    if (opts.push) {
      // Keep the query string (?plan=…, ?lang=…) when switching.
      try { history.pushState({ authView: view }, '', VIEWS[view].file + window.location.search); } catch (err) { /* sandboxed preview: ignore */ }
    }
    if (opts.focus) {
      // Move focus to the new panel heading so keyboard and screen reader users know what changed.
      var h = document.getElementById(VIEWS[view].heading);
      if (h) h.focus();
    }
    // Restart the entry animation.
    card.classList.remove('is-switching');
    void card.offsetWidth;
    card.classList.add('is-switching');
  }

  if (card && tabs.length) {
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        // Let Ctrl/Cmd/Shift/middle click open a new tab as usual.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        var view = tab.getAttribute('data-switch');
        if (view !== currentView) showView(view, { push: true, focus: true });
      });
    });
    try { history.replaceState({ authView: currentView }, '', window.location.href); } catch (err) { /* ignore */ }
    window.addEventListener('popstate', function (e) {
      var view = (e.state && e.state.authView) || (/signup\.html$/.test(window.location.pathname) ? 'register' : 'login');
      showView(view, { focus: true });
    });
    card.addEventListener('animationend', function () { card.classList.remove('is-switching'); });
  }

  /* ---------- Show the selected plan on Enlist ---------- */
  var planLabel = document.querySelector('[data-plan-label]');
  var planName = document.querySelector('[data-plan-name]');
  if (planLabel && planName && planInput && planInput.value) {
    planName.textContent = planInput.value.charAt(0).toUpperCase() + planInput.value.slice(1);
    planLabel.hidden = false;
  }

  /* ---------- Re-translate dynamic texts on language change ---------- */
  document.addEventListener('bm:langchange', function () {
    document.querySelectorAll('.field-error[data-key], [data-status][data-key]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-key'));
    });
    document.querySelectorAll('.pw-toggle').forEach(function (b) {
      b.setAttribute('aria-label', t(b.getAttribute('aria-pressed') === 'true' ? 'auth.hide' : 'auth.show'));
    });
    // Countdown labels, and the heading of whichever reset panel is visible.
    document.querySelectorAll('form[data-auth]').forEach(function (f) {
      if (f.__cooldownPaint) f.__cooldownPaint();
    });
    updateMeter();
    if (card) document.title = viewTitle(currentView);
  });
})();
