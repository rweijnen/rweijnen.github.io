(function () {
  var root = document.documentElement, mq = matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(v) {
    var resolved = (v === 'system') ? (mq.matches ? 'dark' : 'light') : v;
    root.dataset.theme = resolved;
    try { localStorage.setItem('rw-theme', v); } catch (e) {}
    mark('theme', v);
  }
  function applyFont(v) {
    root.style.setProperty('--font-scale', v + '%');
    try { localStorage.setItem('rw-font', v); } catch (e) {}
    mark('font', v);
  }
  // Accessibility flags: 'contrast' -> data-contrast="high", 'motion' -> data-motion="reduce".
  function applyFlag(kind, v) {
    var on = (v === 'on'), val = (kind === 'contrast') ? 'high' : 'reduce';
    if (on) root.dataset[kind] = val; else delete root.dataset[kind];
    try { localStorage.setItem('rw-' + kind, on ? 'on' : 'off'); } catch (e) {}
    mark(kind, v);
  }
  function mark(seg, v) {
    document.querySelectorAll('.seg[data-seg="' + seg + '"] button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.val === v);
    });
  }
  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }

  // ---- localized dates: rewrite <time datetime="YYYY-MM-DD"> to the visitor's
  // locale. One cached Intl formatter (creating it is the only real cost); parse
  // the ISO date as *local* so it never slips a day in western timezones.
  var DFMT, MDFMT;
  function dfmt() {
    if (DFMT === undefined) {
      try { DFMT = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
      catch (e) { DFMT = null; }
    }
    return DFMT;
  }
  function mdfmt() {   // month-day only (archive), cached so a 400-row list stays cheap
    if (MDFMT === undefined) {
      try { MDFMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }); }
      catch (e) { MDFMT = null; }
    }
    return MDFMT;
  }
  function localDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(iso) { var d = localDate(iso), f = dfmt(); return (d && f) ? f.format(d) : iso; }
  function localizeTimes(root) {
    var f = dfmt(); if (!f) return;
    (root || document).querySelectorAll('time[datetime]').forEach(function (t) {
      if (t.dataset.l) return;
      var d = localDate(t.getAttribute('datetime')); if (!d) return;
      var fm = (t.dataset.fmt === 'md' ? mdfmt() : f) || f;
      try { t.textContent = fm.format(d); t.dataset.l = '1'; } catch (e) {}
    });
  }
  window.rwFmtDate = fmtDate;          // for client-rendered dates (search results)
  window.rwLocalizeTimes = localizeTimes;

  document.addEventListener('DOMContentLoaded', function () {
    localizeTimes(document);
    mark('theme', get('rw-theme', 'system'));
    mark('font', get('rw-font', '100'));
    mark('contrast', get('rw-contrast', 'off'));
    mark('motion', get('rw-motion', 'off'));
    document.querySelectorAll('.seg').forEach(function (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var s = seg.dataset.seg, v = b.dataset.val;
        if (s === 'theme') applyTheme(v);
        else if (s === 'font') applyFont(v);
        else applyFlag(s, v);   // contrast | motion
      });
    });
    mq.addEventListener && mq.addEventListener('change', function () {
      if (get('rw-theme', 'system') === 'system') applyTheme('system');
    });

    // settings popover
    var cog = document.getElementById('cogBtn'), pop = document.getElementById('setPop'),
        sb = document.getElementById('setBackdrop');
    function setOpen(o) { if (pop) pop.classList.toggle('open', o); if (sb) sb.classList.toggle('open', o); }
    cog && cog.addEventListener('click', function () { setOpen(!pop.classList.contains('open')); });
    sb && sb.addEventListener('click', function () { setOpen(false); });

    // mobile drawer
    var ham = document.getElementById('hamBtn'), dr = document.getElementById('drawer'),
        db = document.getElementById('drawerBackdrop'), dc = document.getElementById('drawerClose');
    function drOpen(o) { if (dr) dr.classList.toggle('open', o); if (db) db.classList.toggle('open', o); }
    ham && ham.addEventListener('click', function () { drOpen(true); });
    dc && dc.addEventListener('click', function () { drOpen(false); });
    db && db.addEventListener('click', function () { drOpen(false); });

    // ("/" is handled by search.js, which opens the command-palette overlay.)

    // copy code button (delegated)
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]'); if (!b) return;
      var card = b.closest('.codecard'); var code = card && card.querySelector('.codebody');
      if (!code) return;
      (navigator.clipboard ? navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')) : Promise.reject())
        .then(function () { var p = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = p; }, 1200); })
        .catch(function () {});
    });

    // ---- "On this page" TOC: built from article-body headings only (never the
    // comments heading). Assigns stable ids, appends a "Comments (N)" entry, and
    // reveals the module only when the post has >=2 real headings — so the ~430
    // flat posts stay clean. A scroll-spy highlights the current section.
    (function () {
      var mod = document.getElementById('tocMod'), list = document.getElementById('tocList');
      if (!mod || !list) return;
      var body = document.querySelector('.post-content'); if (!body) return;
      var items = [];
      body.querySelectorAll('h2, h3').forEach(function (h) {
        var txt = (h.textContent || '').trim(); if (!txt) return;
        if (!h.id) {
          var base = txt.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
          var id = base, n = 1;
          while (document.getElementById(id)) id = base + '-' + (++n);
          h.id = id;
        }
        items.push({ id: h.id, text: txt, lvl: h.tagName === 'H3' ? 3 : 2 });
      });
      if (items.length < 2) return;   // not enough structure to warrant a TOC

      var frag = document.createDocumentFragment();
      items.forEach(function (it) {
        var a = document.createElement('a');
        a.href = '#' + it.id; a.textContent = it.text;
        a.className = 'toc-link lvl' + it.lvl;
        frag.appendChild(a);
      });
      var csec = document.querySelector('.comments'), ctarget = null;
      if (csec) {
        if (!csec.id) csec.id = 'comments';
        ctarget = csec;
        var chead = csec.querySelector('h1, h2, h3');
        var cm = chead && /(\d+)\s*comment/i.exec(chead.textContent || '');
        var a = document.createElement('a');
        a.href = '#' + csec.id; a.className = 'toc-link lvl2 toc-comments';
        a.textContent = cm ? 'Comments (' + cm[1] + ')' : 'Comments';
        frag.appendChild(a);
      }
      list.appendChild(frag);
      mod.hidden = false;

      if ('IntersectionObserver' in window) {
        var byId = {};
        list.querySelectorAll('.toc-link').forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
        var targets = items.map(function (it) { return document.getElementById(it.id); });
        if (ctarget) targets.push(ctarget);
        var cur = null;
        var obs = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var lnk = byId[e.target.id]; if (!lnk) return;
            if (cur) cur.classList.remove('active');
            lnk.classList.add('active'); cur = lnk;
          });
        }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
        targets.forEach(function (t) { if (t) obs.observe(t); });
      }
    })();

    // ---- "Random post": pick one from the build-time pool on load, and let the
    // reroll cycle it (static site can't randomise per request).
    (function () {
      var mod = document.getElementById('randomMod'); if (!mod) return;
      var raw = document.getElementById('randomPool'),
          link = document.getElementById('randomLink'),
          meta = document.getElementById('randomMeta'),
          btn = document.getElementById('rerollBtn');
      var pool = []; try { pool = JSON.parse(raw.textContent) || []; } catch (e) {}
      if (!pool.length || !link) return;
      var idx = -1;
      function pick() {
        if (pool.length < 2) idx = 0;
        else { var n; do { n = Math.floor(Math.random() * pool.length); } while (n === idx); idx = n; }
        var p = pool[idx];
        link.href = p.u; link.textContent = p.t;
        if (meta) meta.textContent = p.y + (p.c ? ' · ' + p.c : '');
      }
      pick();
      btn && btn.addEventListener('click', function (e) { e.preventDefault(); pick(); });
    })();

    // (post listing paginates with the "Show older posts" pager now — no infinite scroll.)
  });
})();
