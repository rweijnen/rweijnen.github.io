/* Full-text search via Pagefind (built into /pagefind/ at deploy time).
   Supports a small filter syntax on top of free text:
     category:Citrix   tag:powershell   year:2014   "exact phrase"
   Filter values resolve case-insensitively to the indexed facet values. */
(function () {
  var pf = null, ready = null, fmap = null;
  var BASE = (window.RW_BASE || '/').replace(/\/$/, '');   // e.g. "/blog" (site path prefix)

  function load() {
    if (ready) return ready;
    ready = import(BASE + '/pagefind/pagefind.js').then(function (m) {
      pf = m;
      return pf.filters().then(function (f) {
        fmap = {};                                   // case-insensitive value lookup
        Object.keys(f).forEach(function (k) {
          fmap[k] = {};
          Object.keys(f[k]).forEach(function (v) { fmap[k][v.toLowerCase()] = v; });
        });
        return pf;
      });
    }).catch(function () { pf = false; });           // index missing (e.g. `hugo server`)
    return ready;
  }

  function parse(raw) {
    var filters = {};
    var query = raw.replace(/\b(category|tag|year):("[^"]+"|\S+)/gi, function (_, k, v) {
      k = k.toLowerCase();
      v = v.replace(/^"|"$/g, '');
      var canon = fmap && fmap[k] && fmap[k][v.toLowerCase()];
      (filters[k] = filters[k] || []).push(canon || v);
      return ' ';
    }).trim();
    return { query: query, filters: filters };
  }

  function esc(s) {
    return (s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function srItem(d, raw) {                           // one /search-page result <li>
    var dl = d.meta.date ? (window.rwFmtDate ? window.rwFmtDate(d.meta.date) : d.meta.date) : '';
    return '<li class="sr"><div class="sr-top"><span class="sr-h"><a href="' + hrefOf(d) + '">' + esc(d.meta.title) + '</a>' + simTag(d, raw) + '</span>'
         + (d.meta.date ? '<time datetime="' + esc(d.meta.date) + '">' + esc(dl) + '</time>' : '') + '</div>'
         + '<p class="sr-excerpt">' + d.excerpt + '</p></li>';
  }

  // Pagefind indexes the un-nested build, so its URLs lack the /blog prefix — add it.
  function hrefOf(d) {
    return (d.url.charAt(0) === '/' && d.url.indexOf(BASE + '/') !== 0) ? BASE + d.url : d.url;
  }
  function metaLine(d) {                              // "Category · Year" for an overlay row
    var cat = (d.meta && d.meta.category) || '';
    var yr = (d.meta && d.meta.date) ? String(d.meta.date).slice(0, 4) : '';
    return [cat, yr].filter(Boolean).join(' · ');
  }
  // Pagefind stems queries (aes -> ae), so short/acronym terms also match unrelated
  // fragments (AERO, 0xAE, GUIDs). A result is "exact" when the typed term actually
  // appears in the title or a highlighted word; otherwise it's a looser stem match.
  function queryTerms(raw) {
    return (raw || '').toLowerCase()
      .replace(/\b(?:category|tag|year):("[^"]+"|\S+)/gi, ' ').replace(/"/g, ' ')
      .split(/\s+/).filter(Boolean);
  }
  function isExact(d, raw) {
    var terms = queryTerms(raw);
    if (!terms.length) return true;
    var marks = (d.excerpt.match(/<mark>(.*?)<\/mark>/g) || []).map(function (m) { return m.replace(/<\/?mark>/g, ''); });
    var hay = (d.meta.title + ' ' + marks.join(' ')).toLowerCase();
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }
  function simTag(d, raw) { return isExact(d, raw) ? '' : '<span class="s-tag">similar</span>'; }

  var RECENT_KEY = 'rw:recent';                       // last few queries (localStorage, functional)
  function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function pushRecent(q) {
    q = (q || '').trim(); if (!q) return;
    var r = getRecent().filter(function (x) { return x !== q; });
    r.unshift(q); r = r.slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) {}
  }
  var CHIPS = ['category:', 'year:', 'tag:', '"exact phrase"'];

  /* Global command-palette overlay — available on every page. */
  function initOverlay() {
    var back = document.getElementById('ovBackdrop');
    if (!back) return;
    var input = document.getElementById('ovInput');
    var body = document.getElementById('ovBody');
    var escBtn = document.getElementById('ovEsc');
    var token = 0, rows = [], active = -1, lastRaw = '';

    function isOpen() { return back.classList.contains('open'); }
    function open() {
      if (isOpen()) return;
      back.classList.add('open'); back.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
      input.value = ''; renderHints(); load();        // warm Pagefind on first open
      setTimeout(function () { input.focus(); }, 20);
    }
    function close() {
      back.classList.remove('open'); back.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      rows = []; active = -1;
    }

    function renderHints() {
      var rec = getRecent(), html = '';
      if (rec.length) {
        html += '<div class="ov-sec">Recent</div>' + rec.map(function (q) {
          return '<div class="ov-row js-recent" data-q="' + esc(q) + '"><div class="t">' + esc(q) + '</div></div>';
        }).join('');
      }
      html += '<div class="ov-sec">Search by</div><div class="ov-chips">' + CHIPS.map(function (c) {
        return '<button type="button" class="ov-chip" data-ins="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>';
      body.innerHTML = html; rows = []; active = -1;
    }
    function renderResults(datas, raw, total) {
      if (!datas.length) { body.innerHTML = '<div class="ov-empty">No results for &ldquo;' + esc(raw) + '&rdquo;</div>'; rows = []; active = -1; return; }
      var head = '<div class="ov-sec">' + total + ' result' + (total === 1 ? '' : 's')
               + (total > datas.length ? ' &middot; top ' + datas.length : '') + '</div>';
      body.innerHTML = head + datas.map(function (d, i) {
        var m = metaLine(d), tag = simTag(d, raw);
        return '<a class="ov-row' + (i === 0 ? ' active' : '') + '" href="' + hrefOf(d) + '">'
             + '<div class="t">' + esc(d.meta.title || 'Untitled') + '</div>'
             + ((m || tag) ? '<div class="m">' + esc(m) + (m && tag ? ' ' : '') + tag + '</div>' : '')
             + (d.excerpt ? '<div class="ov-ex">' + d.excerpt + '</div>' : '') + '</a>';   // Pagefind excerpt (has <mark>)
      }).join('');
      rows = Array.prototype.slice.call(body.querySelectorAll('.ov-row'));
      active = rows.length ? 0 : -1;
    }
    function setActive(i) {
      if (!rows.length) return;
      active = (i + rows.length) % rows.length;
      rows.forEach(function (r, j) { r.classList.toggle('active', j === active); });
      rows[active].scrollIntoView({ block: 'nearest' });
    }

    function run() {
      var raw = input.value.trim(); lastRaw = raw;
      if (!raw) { renderHints(); return; }
      var mine = ++token;
      load().then(function () {
        if (!pf) { body.innerHTML = '<div class="ov-empty">Search index isn’t built in dev preview.</div>'; return; }
        var p = parse(raw);
        return pf.search(p.query || null, { filters: p.filters }).then(function (s) {
          var total = s.results.length;
          return Promise.all(s.results.slice(0, 8).map(function (r) { return r.data(); }))
            .then(function (datas) { return { datas: datas, total: total }; });
        }).then(function (res) { if (mine === token && isOpen()) renderResults(res.datas, raw, res.total); });
      });
    }
    function goAll() {
      var raw = input.value.trim(); if (!raw) return;
      pushRecent(raw); location.href = BASE + '/search/?q=' + encodeURIComponent(raw);
    }
    function goActive() {
      if (active >= 0 && rows[active] && rows[active].tagName === 'A') {
        pushRecent(lastRaw); location.href = rows[active].getAttribute('href');
      } else { goAll(); }
    }
    function insertOp(op) {
      var v = input.value, quoted = op === '"exact phrase"';
      input.value = (v ? v.replace(/\s*$/, '') + ' ' : '') + (quoted ? '""' : op);
      input.focus();
      if (quoted) input.setSelectionRange(input.value.length - 1, input.value.length - 1);
      run();
    }

    Array.prototype.forEach.call(document.querySelectorAll('.js-search-open'), function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var dr = document.getElementById('drawer'); if (dr) dr.classList.remove('open');
        var db = document.getElementById('drawerBackdrop'); if (db) db.classList.remove('open');
        open();
      });
    });
    escBtn.addEventListener('click', close);
    var allBtn = document.getElementById('ovAll');
    if (allBtn) allBtn.addEventListener('click', goAll);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) goAll(); else goActive(); }
    });
    body.addEventListener('click', function (e) {
      var t = e.target;
      var chip = t.closest && t.closest('.ov-chip');
      if (chip) { insertOp(chip.getAttribute('data-ins')); return; }
      var rec = t.closest && t.closest('.js-recent');
      if (rec) { input.value = rec.getAttribute('data-q'); input.focus(); run(); return; }
      var row = t.closest && t.closest('.ov-row');
      if (row && row.tagName === 'A') pushRecent(lastRaw);   // record before navigation
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { close(); return; }
      if (e.key === '/' && !isOpen()) {
        var t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
        e.preventDefault(); open();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initOverlay();                                   // command-palette overlay (every page)
    var input = document.getElementById('search-input');
    if (!input) return;                              // the rest only acts on /search/
    var box = document.getElementById('search-results');
    var countEl = document.getElementById('search-count');
    var token = 0;

    function setCount(total) {
      if (countEl) countEl.textContent = total ? total + ' result' + (total === 1 ? '' : 's') : '';
    }
    // Results stream in batches as you scroll (matching the home page), so all 121
    // are reachable — not just the first screenful.
    var BATCH = 25, state = null, io = null;
    function teardown() {
      if (io) { io.disconnect(); io = null; }
      if (state && state.sentinel) { state.sentinel.remove(); state.sentinel = null; }
    }
    function loadMore() {
      if (!state || state.busy) return;
      var st = state, next = st.results.slice(st.rendered, st.rendered + BATCH);
      if (!next.length) { teardown(); return; }
      st.busy = true;
      Promise.all(next.map(function (r) { return r.data(); })).then(function (datas) {
        if (st.token !== token || !st.sentinel) return;      // superseded by a newer query
        st.rendered += next.length; st.busy = false;
        st.sentinel.insertAdjacentHTML('beforebegin', datas.map(function (d) { return srItem(d, st.raw); }).join(''));
        if (st.rendered >= st.results.length) teardown();
      });
    }
    function run() {
      var raw = input.value.trim();
      teardown();
      if (!raw) { box.innerHTML = ''; setCount(0); state = null; return; }
      var mine = ++token;
      load().then(function () {
        if (mine !== token) return;
        if (!pf) { box.innerHTML = '<li class="no-results">Search index isn’t built in dev preview — run a production build.</li>'; setCount(0); return; }
        var p = parse(raw);
        return pf.search(p.query || null, { filters: p.filters }).then(function (search) {
          if (mine !== token) return;
          setCount(search.results.length);
          if (!search.results.length) { box.innerHTML = '<li class="no-results">No results.</li>'; state = null; return; }
          box.innerHTML = '<li class="sr-sentinel" aria-hidden="true"></li>';
          state = { results: search.results, rendered: 0, token: mine, busy: false, raw: raw, sentinel: box.querySelector('.sr-sentinel') };
          io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '500px' });
          io.observe(state.sentinel);
          loadMore();
        });
      });
    }

    input.addEventListener('input', run);
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; run(); }
  });
})();
