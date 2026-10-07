/* =========================================================
   Contact page: preselect the topic from the URL.
   e.g. contact.html?topic=writeup  →  "Submit a write-up"
   Only values that exist in the <select> are accepted.
   ========================================================= */
(function () {
  'use strict';
  var select = document.getElementById('c-topic');
  if (!select) return;
  var topic = new URLSearchParams(window.location.search).get('topic');
  if (!topic) return;
  var valid = Array.prototype.some.call(select.options, function (o) { return o.value === topic; });
  if (valid) select.value = topic;
})();
