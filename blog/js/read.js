/* Reading beacon for the blog's own statistics (workers/stats, privacy: /about/#privacy).
   Sends ONE small message when you leave a post: the post path, its word count, whether the end
   of the post was on screen, how far down the post you got (percent), how many seconds the post
   was on your screen, how many of those you were actively reading, and the host name of the site that linked here (only if it is another site),
   or the ?ref= tag of a link I shared myself. No cookies, no IDs.
   Nothing is sent when Global Privacy Control or Do Not Track is on, or when you switched
   "Reading statistics" off in the site settings (rw-stats = off in local storage). */
(function () {
  "use strict";
  var art = document.querySelector("article.article[data-read-endpoint]");
  var body = art && art.querySelector(".post-content");
  var end = document.getElementById("post-end");
  if (!art || !body || !end) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  function optedOut() { try { return localStorage.getItem("rw-stats") === "off"; } catch (e) { return false; } }
  if (optedOut()) return;
  if (location.hostname !== "remkoweijnen.nl") {
    console.info("read.js: not on remkoweijnen.nl, nothing is sent");
    return;
  }

  var IDLE = 30000;          // input older than this no longer counts as reading
  var active = 0;            // whole seconds
  var lastInput = Date.now();
  var endSeen = 0;
  var depth = 0;             // furthest point of the post body that was on screen, 0..100 percent
  var sent = false;
  // Time on page: seconds the tab was visible, measured with timestamps (timers can be throttled).
  var visibleMs = 0;
  var visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  function visibleSeconds() {
    return Math.round((visibleMs + (visibleSince === null ? 0 : Date.now() - visibleSince)) / 1000);
  }

  ["scroll", "keydown", "pointerdown", "pointermove", "touchstart", "wheel"].forEach(function (t) {
    addEventListener(t, function () { lastInput = Date.now(); }, { passive: true, capture: true });
  });
  setInterval(function () {
    if (document.visibilityState === "visible" && Date.now() - lastInput < IDLE) active++;
  }, 1000);

  function measure() {
    var r = body.getBoundingClientRect();
    if (r.height <= 0) return;
    var seen = Math.round(100 * (innerHeight - r.top) / r.height);
    if (seen > depth) depth = Math.min(100, seen);
  }
  var queued = false;
  addEventListener("scroll", function () {
    if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; measure(); }); }
  }, { passive: true });
  addEventListener("load", measure);
  measure();

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { endSeen = 1; depth = 100; io.disconnect(); }
    });
    io.observe(end);
  }

  // Source: a ?ref=<tag> on links I share myself (e.g. ?ref=linkedin; apps often send no referrer)
  // wins; otherwise the host name of the referring site, if it is another site.
  var ref = "";
  var tag = (new URLSearchParams(location.search).get("ref") || "").toLowerCase();
  if (/^[a-z0-9-]{1,40}$/.test(tag)) {
    ref = tag;
  } else {
    try {
      var r = document.referrer ? new URL(document.referrer).hostname : "";
      if (r && r !== location.hostname) ref = r;
    } catch (e) { /* unparsable referrer: leave empty */ }
  }

  function send() {
    if (sent) return;
    sent = true;
    if (optedOut()) return;   // switched off while this page was open
    measure();
    var payload = JSON.stringify({
      p: location.pathname, w: parseInt(art.getAttribute("data-words"), 10) || 0,
      e: endSeen, s: depth, v: Math.max(visibleSeconds(), active), a: active, r: ref, d: navigator.webdriver ? 1 : 0
    });
    navigator.sendBeacon(art.getAttribute("data-read-endpoint"), payload);
  }
  // Leaving the page: hidden fires reliably on mobile, pagehide on desktop navigation.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      if (visibleSince !== null) { visibleMs += Date.now() - visibleSince; visibleSince = null; }
      send();
    } else if (visibleSince === null) {
      visibleSince = Date.now();
    }
  });
  addEventListener("pagehide", send);
})();
