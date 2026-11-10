/* Feedback form at the end of new posts (layouts/partials/feedback.html -> workers/stats, POST /api/feedback).
   Sends only what the reader chose or typed, plus the post's path and the Turnstile token.
   Turnstile's script is loaded only when the form is opened. */
(function () {
  "use strict";
  var open = document.getElementById("fbOpen"), dlg = document.getElementById("fbDialog"),
      form = document.getElementById("fbForm");
  if (!open || !dlg || !form || typeof dlg.showModal !== "function") return;
  var status = form.querySelector(".form-status"), btn = form.querySelector(".form-submit");
  var widget = null, tsLoading = null;

  function say(text, kind) { status.textContent = text; status.className = "form-status" + (kind ? " " + kind : ""); }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { tsLoading = null; reject(new Error("load")); };
      document.head.appendChild(s);
    });
    return tsLoading;
  }
  function renderWidget() {
    return loadTurnstile().then(function () {
      if (widget === null) widget = window.turnstile.render("#fbTurnstile", { sitekey: form.dataset.sitekey, size: "flexible" });
    }).catch(function () {
      say("The verification could not be loaded (blocked by an extension or network?). Feedback can't be sent without it.", "err");
    });
  }

  open.addEventListener("click", function () { dlg.showModal(); renderWidget(); });
  document.getElementById("fbClose").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); }); // click on the backdrop

  // Every question is optional: clicking the chosen answer again clears it.
  form.querySelectorAll(".fb-chips input").forEach(function (r) {
    r.closest("label").addEventListener("pointerdown", function () { r.dataset.was = r.checked ? "1" : ""; });
    r.addEventListener("click", function () { if (r.dataset.was === "1") { r.checked = false; r.dataset.was = ""; } });
  });
  form.querySelectorAll("[data-count-for]").forEach(function (c) {
    var n = c.getAttribute("data-count-for");
    var f = form.querySelector('input[name="' + n + '"], textarea[name="' + n + '"]');
    var max = f.getAttribute("maxlength");
    f.addEventListener("input", function () { c.textContent = f.value.length + " / " + max; });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    // Read by selector, not form.elements[name]: a field called "length" would hit elements.length.
    var v = function (n) {
      var el = form.querySelector('input[name="' + n + '"]:checked') || form.querySelector('input[type="text"][name="' + n + '"], textarea[name="' + n + '"]');
      return el ? el.value : "";
    };
    var body = {
      p: location.pathname, solved: v("solved"), level: v("level"), length: v("length"),
      looking: v("looking").trim(), notes: v("notes").trim(),
      token: window.turnstile && widget !== null ? window.turnstile.getResponse(widget) || "" : ""
    };
    if (!body.solved && !body.level && !body.length && !body.looking && !body.notes) { say("Please answer at least one question.", "err"); return; }
    if (!body.token) { say("Please complete the verification first.", "err"); return; }
    btn.disabled = true; say("Sending...");
    fetch(form.dataset.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: "The feedback could not be sent (HTTP " + r.status + ")." }; }); })
      .then(function (res) {
        if (res.ok) {
          form.querySelectorAll(".fb-q, .fb-privacy, .field, .fb-turnstile, .fb-intro, .form-submit").forEach(function (el) { el.hidden = true; });
          say(res.message, "ok");
          open.disabled = true; open.textContent = "Thanks for your feedback.";
        } else {
          say(res.message, "err");
        }
      })
      .catch(function () { say("The feedback could not be sent. Please try again later.", "err"); })
      .finally(function () { btn.disabled = false; if (window.turnstile && widget !== null) window.turnstile.reset(widget); });
  });
})();
