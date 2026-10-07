/* =========================================================
   Generic chip filter (used by The Gauntlet and Briefing).

   Markup:
     <div class="filters" hidden>
       <button class="chip" data-filter="all" aria-pressed="true">…</button>
       <button class="chip" data-filter="red" aria-pressed="false">…</button>
     </div>
     <p class="sr-only" aria-live="polite" data-filter-status></p>
     <li data-filter-item data-tags="red blue">…</li>

   Progressive enhancement: without JS every item is visible
   and the filter bar stays hidden.
   ========================================================= */
(function () {
  'use strict';

  var bar = document.querySelector('.filters');
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-filter-item]'));
  var status = document.querySelector('[data-filter-status]');
  if (!bar || !items.length) return;

  var STATUS = {
    en: function (n) { return 'Showing ' + n + (n === 1 ? ' result' : ' results'); },
    es: function (n) { return 'Mostrando ' + n + (n === 1 ? ' resultado' : ' resultados'); }
  };

  var current = 'all';

  function lang() {
    return STATUS[document.documentElement.lang] ? document.documentElement.lang : 'en';
  }

  function apply(filter, announce) {
    current = filter;
    var shown = 0;
    items.forEach(function (item) {
      var tags = (item.getAttribute('data-tags') || '').split(' ');
      var match = filter === 'all' || tags.indexOf(filter) !== -1;
      item.hidden = !match;
      if (match) shown++;
    });
    bar.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-filter') === filter));
    });
    if (announce && status) status.textContent = STATUS[lang()](shown);
  }

  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (btn) apply(btn.getAttribute('data-filter'), true);
  });

  document.addEventListener('bm:langchange', function () {
    if (status && status.textContent) apply(current, true);
  });

  bar.hidden = false;
  apply('all', false);
})();
