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

  // Page geometry as the WebView lays it out: whether the document or the
  // page's own column (the h-dvh root of the map pages) is scrolled, and
  // where the header sits against the top safe-area inset. On /plan it also
  // opens the drawer to its highest setting (90 vh) for one synchronous
  // measure, restored before anything paints: the column must still fit the
  // screen, or an in-page scroll shifts the whole page up (iPhone, 2026-11).
  function layout() {
    var column = document.querySelector("#root .h-dvh");
    var header = document.querySelector(".app-header");
    var vv = window.visualViewport;
    function overflows() {
      return !!column && column.scrollHeight - column.clientHeight > 1;
    }
    var headerRect = header ? header.getBoundingClientRect() : null;
    var result = {
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      visualViewport: vv ? { height: vv.height, offsetTop: vv.offsetTop, pageTop: vv.pageTop } : null,
      docScrollHeight: document.documentElement.scrollHeight,
      column: column
        ? { clientHeight: column.clientHeight, scrollHeight: column.scrollHeight, scrollTop: column.scrollTop }
        : null,
      columnOverflows: overflows(),
      header: headerRect ? { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height } : null,
      shifted: window.scrollY !== 0 || (!!column && column.scrollTop !== 0) || (!!headerRect && headerRect.top < -0.5),
      planStress: null,
    };
    var handle = window.location.pathname === "/plan" ? document.querySelector('[role="separator"]') : null;
    var drawer = handle ? handle.parentElement : null;
    if (drawer) {
      var saved = drawer.style.height;
      drawer.style.height = "90vh";
      result.planStress = {
        drawerHeight: drawer.getBoundingClientRect().height,
        columnOverflows: overflows(),
      };
      drawer.style.height = saved;
    }
    return result;
  }

  // A stage of the test may ask for another page than the start URL: the
  // collector answers GET /goto with { path, storage } (see collector.mjs).
  function followGoto() {
    var origin;
    try {
      origin = new URL(COLLECTOR).origin;
    } catch (e) {
      return;
    }
    fetch(origin + "/goto", { cache: "no-store" })
      .then(function (res) {
        return res.ok ? res.json() : {};
      })
      .then(function (goto) {
        if (!goto || !goto.path) return;
        var target = new URL(goto.path, window.location.href);
        if (target.pathname === window.location.pathname) return;
        Object.keys(goto.storage || {}).forEach(function (key) {
          try {
            window.localStorage.setItem(key, goto.storage[key]);
          } catch (e) {
            /* the page then opens with its defaults */
          }
        });
        window.location.replace(target.href);
      })
      .catch(function () {
        /* no collector, no stage asking for a page */
      });
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

  // The plugins the site uses beside App, each called once per page load
  // straight through the bridge (nativePromise), so the answer does not
  // depend on the site having loaded its own plugin chunk yet. The rating
  // request is only checked for presence: calling it could show a sheet.
  function call(cap, plugin, method, options) {
    if (!cap || !cap.nativePromise) return Promise.reject(new Error("no bridge"));
    return Promise.resolve(cap.nativePromise(plugin, method, options || {}));
  }

  function outcome(promise) {
    return promise.then(
      function (value) {
        return value === undefined ? "ok" : value;
      },
      function (err) {
        return { error: String((err && err.message) || err) };
      },
    );
  }

  var pluginChecks = null;
  function plugins(cap) {
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return Promise.resolve(null);
    if (pluginChecks) return pluginChecks;
    var token = "probe-" + loadId;
    var prefs = call(cap, "Preferences", "set", { key: "ow_probe_roundtrip", value: token })
      .then(function () {
        return call(cap, "Preferences", "get", { key: "ow_probe_roundtrip" });
      })
      .then(function (res) {
        return call(cap, "Preferences", "remove", { key: "ow_probe_roundtrip" }).then(function () {
          return !!res && res.value === token;
        });
      });
    var keepAwake = call(cap, "KeepAwake", "keepAwake")
      .then(function () {
        return call(cap, "KeepAwake", "isKeptAwake");
      })
      .then(function (on) {
        return call(cap, "KeepAwake", "allowSleep")
          .then(function () {
            return call(cap, "KeepAwake", "isKeptAwake");
          })
          .then(function (off) {
            return { on: !!on && on.isKeptAwake === true, off: !!off && off.isKeptAwake === true };
          });
      });
    var backupCopy = call(cap, "Preferences", "get", { key: "ow_backup_v1" }).then(function (res) {
      return !!res && typeof res.value === "string" && res.value.length > 0;
    });
    pluginChecks = Promise.all([
      outcome(call(cap, "Haptics", "impact", { style: "LIGHT" })),
      outcome(prefs),
      outcome(keepAwake),
      outcome(backupCopy),
    ]).then(function (r) {
      return {
        haptics: r[0],
        preferencesRoundTrip: r[1],
        keepAwake: r[2],
        backupCopy: r[3],
        review: !!(cap.isPluginAvailable && cap.isPluginAvailable("InAppReview")),
        webWakeLock: !!(navigator.wakeLock && navigator.wakeLock.request),
      };
    });
    return pluginChecks;
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
    return Promise.all([registration(), appInfo(cap), plugins(cap)]).then(function (results) {
      var reg = results[0];
      var sw = navigator.serviceWorker;
      var root = document.getElementById("root");
      var backupMarker = null;
      try {
        backupMarker = window.localStorage.getItem("ow_native_backup_v1");
      } catch (e) {
        backupMarker = "unreadable: " + String(e);
      }
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
        plugins: results[2],
        backupMarker: backupMarker,
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
        layout: layout(),
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

  followGoto();

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
