// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Smoke-test probe, inlined into the web build's index.html by
// inject-probe.mjs in the mobile-smoke workflow only. Never part of a
// deployed build.
//
// It reports what the page sees from inside the native shell to a collector
// on the CI runner (collector.mjs), a few times per page load because the
// service worker settles over several seconds. Inline rather than a separate
// file so it is precached with index.html and still runs when the site is
// served by the service worker with the server down.
(function () {
  "use strict";

  var COLLECTOR = "__OHMYWIND_PROBE_COLLECTOR__";
  var DELAYS_MS = [1500, 4000, 8000, 15000, 25000, 40000];
  var loadId = Math.random().toString(36).slice(2, 10);
  var errors = [];

  window.addEventListener("error", function (event) {
    errors.push("error: " + String(event.message || event));
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    errors.push("unhandledrejection: " + String((reason && reason.message) || reason));
  });

  function safeAreaInsets() {
    var el = document.createElement("div");
    el.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.documentElement.appendChild(el);
    var cs = window.getComputedStyle(el);
    var insets = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
    el.remove();
    return insets;
  }

  // A round trip through the native bridge, to prove the plugins answer.
  function appInfo(cap) {
    if (!cap) return Promise.resolve(null);
    var call =
      cap.Plugins && cap.Plugins.App && cap.Plugins.App.getInfo
        ? cap.Plugins.App.getInfo()
        : cap.nativePromise
          ? cap.nativePromise("App", "getInfo", {})
          : null;
    if (!call) return Promise.resolve({ error: "no bridge call available" });
    return Promise.resolve(call).then(
      function (info) {
        return info;
      },
      function (err) {
        return { error: String((err && err.message) || err) };
      },
    );
  }

  function registration() {
    var sw = navigator.serviceWorker;
    if (!sw) return Promise.resolve(null);
    return sw.getRegistration().then(
      function (reg) {
        return reg || null;
      },
      function (err) {
        errors.push("getRegistration: " + String((err && err.message) || err));
        return null;
      },
    );
  }

  function snapshot(seq) {
    var cap = window.Capacitor;
    return Promise.all([registration(), appInfo(cap)]).then(function (results) {
      var reg = results[0];
      var sw = navigator.serviceWorker;
      var root = document.getElementById("root");
      var shellImport = null;
      try {
        shellImport = window.localStorage.getItem("ow_shell_import_v1");
      } catch (e) {
        shellImport = "unreadable: " + String(e);
      }
      return {
        loadId: loadId,
        seq: seq,
        sinceLoadMs: Math.round(performance.now()),
        href: window.location.href,
        native: !!(cap && cap.isNativePlatform && cap.isNativePlatform()),
        platform: cap && cap.getPlatform ? cap.getPlatform() : null,
        appInfo: results[1],
        sw: {
          supported: !!sw,
          controlled: !!(sw && sw.controller),
          registered: !!reg,
          active: reg && reg.active ? reg.active.state : null,
          waiting: !!(reg && reg.waiting),
          scope: reg ? reg.scope : null,
        },
        appMounted: !!(root && root.childElementCount > 0),
        title: document.title,
        insets: safeAreaInsets(),
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        shellImport: shellImport,
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        errors: errors.slice(0, 20),
      };
    });
  }

  function send(report) {
    // text/plain keeps this a simple request: no CORS preflight.
    return fetch(COLLECTOR, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(report),
    }).catch(function () {
      /* the collector is the test's business, never the page's */
    });
  }

  DELAYS_MS.forEach(function (delay, seq) {
    window.setTimeout(function () {
      snapshot(seq)
        .then(send)
        .catch(function () {
          /* idem */
        });
    }, delay);
  });
})();
