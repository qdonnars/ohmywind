// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Worker tests, on the Node test runner and nothing else.
 *
 * `node --test tests/` from this directory. There is no dependency to install,
 * no wrangler, no login: the Worker only touches three globals (`fetch`,
 * `caches`, and the `ctx` it is handed), so stubbing them is enough to pin the
 * behaviours that are impossible to check by reading, and awkward to check in
 * production. What this cannot cover is the runtime itself: that `caches.default`
 * really honours `Cache-Control`, and that a Worker subrequest really throws
 * when the origin is unreachable. Those are verified with curl after a deploy.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import worker from "../src/index.js";

const DEV = "https://mcp-dev.ohmywind.fr";

/** Records what the Worker asked the edge cache and the origin to do. */
function harness({ upstream, cached = null } = {}) {
  const calls = { upstream: [], match: [], put: [], waitUntil: [] };

  globalThis.fetch = async (request) => {
    calls.upstream.push(request);
    if (typeof upstream === "function") return upstream(request);
    return upstream;
  };

  globalThis.caches = {
    default: {
      async match(request) {
        calls.match.push(request);
        return cached;
      },
      async put(request, response) {
        calls.put.push({ request, response });
      },
    },
  };

  const ctx = {
    waitUntil(promise) {
      calls.waitUntil.push(promise);
    },
  };

  return { calls, ctx };
}

/** Drain whatever the Worker deferred, so cache writes have happened. */
async function settle(calls) {
  await Promise.all(calls.waitUntil);
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

beforeEach(() => {
  delete globalThis.fetch;
  delete globalThis.caches;
});

describe("unknown host", () => {
  test("is refused instead of proxied somewhere unintended", async () => {
    const { ctx } = harness({ upstream: json({}) });
    const response = await worker.fetch(
      new Request("https://example.invalid/api/v1/archetypes"),
      {},
      ctx,
    );
    assert.equal(response.status, 404);
  });
});

describe("origin unreachable", () => {
  test("answers JSON 503 with Retry-After and readable CORS", async () => {
    const { ctx } = harness({
      upstream: () => {
        throw new TypeError("fetch failed");
      },
    });

    const response = await worker.fetch(
      new Request(`${DEV}/api/v1/passage`, {
        method: "POST",
        headers: { Origin: "https://dev.ohmywind.fr" },
      }),
      {},
      ctx,
    );

    assert.equal(response.status, 503);
    assert.equal(
      response.headers.get("Content-Type"),
      "application/json; charset=utf-8",
    );
    assert.equal(response.headers.get("Retry-After"), "30");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://dev.ohmywind.fr",
    );
    assert.match(response.headers.get("Vary") ?? "", /Origin/);
    assert.deepEqual(await response.json(), {
      error: "backend temporarily unavailable",
      code: "upstream_unavailable",
      retry_after: 30,
    });
  });

  test("falls back to a wildcard for an unlisted or absent Origin", async () => {
    const { ctx } = harness({
      upstream: () => {
        throw new Error("boom");
      },
    });

    const wildcard = await worker.fetch(new Request(`${DEV}/mcp`), {}, ctx);
    assert.equal(wildcard.headers.get("Access-Control-Allow-Origin"), "*");

    const foreign = await worker.fetch(
      new Request(`${DEV}/mcp`, { headers: { Origin: "https://evil.example" } }),
      {},
      ctx,
    );
    assert.equal(foreign.headers.get("Access-Control-Allow-Origin"), "*");
  });

  test("answers the preflight too, so the POST it gates is even attempted", async () => {
    const { ctx } = harness({
      upstream: () => {
        throw new Error("boom");
      },
    });

    const response = await worker.fetch(
      new Request(`${DEV}/api/v1/passage`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://dev.ohmywind.fr",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
      {},
      ctx,
    );

    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://dev.ohmywind.fr",
    );
    assert.match(
      response.headers.get("Access-Control-Allow-Methods") ?? "",
      /POST/,
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Headers"),
      "content-type",
    );
  });
});

describe("platform error pages", () => {
  test("an HTML 502 on /api/v1/ becomes the same JSON as an outage", async () => {
    const { ctx } = harness({
      upstream: new Response("<html>Error 1101</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    });

    const response = await worker.fetch(
      new Request(`${DEV}/api/v1/passage`, { method: "POST" }),
      {},
      ctx,
    );

    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, "upstream_unavailable");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  });

  test("a JSON 503 from the app itself is passed through untouched", async () => {
    const { ctx } = harness({
      upstream: json(
        { error: "upstream weather service did not respond in time", code: "upstream_timeout" },
        { status: 503 },
      ),
    });

    const response = await worker.fetch(
      new Request(`${DEV}/api/v1/passage`, { method: "POST" }),
      {},
      ctx,
    );

    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "upstream_timeout");
  });

  test("/mcp keeps the raw status the transport needs to see", async () => {
    const { calls, ctx } = harness({
      upstream: new Response("<html>502</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    });

    const response = await worker.fetch(
      new Request(`${DEV}/mcp`, { method: "POST" }),
      {},
      ctx,
    );

    assert.equal(response.status, 502);
    assert.equal(await response.text(), "<html>502</html>");
    assert.equal(calls.match.length, 0, "/mcp never consults the edge cache");
    assert.equal(response.headers.get("X-OhMyWind-Edge-Cache"), null);
  });
});

describe("edge cache", () => {
  test("a miss goes upstream, is stored, and says MISS", async () => {
    const { calls, ctx } = harness({
      upstream: json([{ slug: "cruiser_30ft" }], {
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
    });

    const response = await worker.fetch(
      new Request(`${DEV}/api/v1/archetypes`),
      {},
      ctx,
    );
    await settle(calls);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-OhMyWind-Edge-Cache"), "MISS");
    assert.equal(calls.upstream.length, 1);
    assert.equal(calls.put.length, 1);
    assert.equal(
      calls.put[0].request.url,
      `${DEV}/api/v1/archetypes`,
      "the cache key is the public URL, so mcp and mcp-dev never share entries",
    );
    assert.deepEqual(await response.json(), [{ slug: "cruiser_30ft" }]);
  });

  test("the stored copy carries no per-caller CORS header", async () => {
    const { calls, ctx } = harness({
      upstream: json([], {
        headers: {
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "http://localhost:5173",
        },
      }),
    });

    await worker.fetch(
      new Request(`${DEV}/api/v1/archetypes`, {
        headers: { Origin: "http://localhost:5173" },
      }),
      {},
      ctx,
    );
    await settle(calls);

    assert.equal(
      calls.put[0].response.headers.get("Access-Control-Allow-Origin"),
      null,
    );
  });

  test("a hit never reaches the origin and says HIT", async () => {
    const { calls, ctx } = harness({
      upstream: json([]),
      cached: json([{ slug: "cruiser_30ft" }], {
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
    });

    const response = await worker.fetch(
      new Request(`${DEV}/api/v1/marine/marc/coverage`, {
        headers: { Origin: "https://dev.ohmywind.fr" },
      }),
      {},
      ctx,
    );

    assert.equal(response.headers.get("X-OhMyWind-Edge-Cache"), "HIT");
    assert.equal(calls.upstream.length, 0);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://dev.ohmywind.fr",
      "CORS is re-stamped per caller, never served from the stored copy",
    );
    assert.match(
      response.headers.get("Access-Control-Expose-Headers") ?? "",
      /X-OhMyWind-Edge-Cache/,
    );
  });

  test("query strings are part of the key, so /marine/marc caches per window", async () => {
    const { calls, ctx } = harness({
      upstream: json({ steps: [] }, {
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
    });

    await worker.fetch(
      new Request(`${DEV}/api/v1/marine/marc?lat=48.02&lon=-4.55&n_steps=24`),
      {},
      ctx,
    );
    await settle(calls);

    assert.match(calls.put[0].request.url, /n_steps=24/);
  });

  test("nothing is stored without a public max-age, nor on a non-200", async () => {
    for (const upstream of [
      json([], { headers: { "Cache-Control": "no-store" } }),
      json([]),
      json({ error: "nope" }, {
        status: 500,
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
    ]) {
      const { calls, ctx } = harness({ upstream });
      const response = await worker.fetch(
        new Request(`${DEV}/api/v1/archetypes`),
        {},
        ctx,
      );
      await settle(calls);
      assert.equal(calls.put.length, 0);
      assert.equal(response.headers.get("X-OhMyWind-Edge-Cache"), "MISS");
    }
  });

  test("a POST is never cached, even on a cacheable path", async () => {
    const { calls, ctx } = harness({
      upstream: json([], { headers: { "Cache-Control": "public, max-age=86400" } }),
    });

    await worker.fetch(
      new Request(`${DEV}/api/v1/archetypes`, { method: "POST" }),
      {},
      ctx,
    );
    await settle(calls);

    assert.equal(calls.match.length, 0);
    assert.equal(calls.put.length, 0);
  });

  test("an uncacheable path is not consulted either", async () => {
    const { calls, ctx } = harness({ upstream: json({}) });
    await worker.fetch(new Request(`${DEV}/api/v1/_client`), {}, ctx);
    assert.equal(calls.match.length, 0);
    assert.equal(calls.put.length, 0);
  });
});

describe("what the origin depends on, unchanged", () => {
  test("X-Forwarded-For is collapsed and the edge secret replaced", async () => {
    const { calls, ctx } = harness({ upstream: json({}) });

    await worker.fetch(
      new Request(`${DEV}/api/v1/_client`, {
        headers: {
          "CF-Connecting-IP": "203.0.113.7",
          "X-Forwarded-For": "1.1.1.1, 2.2.2.2",
          "X-OhMyWind-Edge": "forged",
        },
      }),
      { EDGE_SHARED_SECRET: "real-secret" },
      ctx,
    );

    const sent = calls.upstream[0];
    assert.equal(sent.url, "https://qdonnars-openwind-mcp-dev.hf.space/api/v1/_client");
    assert.equal(sent.headers.get("X-Forwarded-For"), "203.0.113.7");
    assert.equal(sent.headers.get("X-OhMyWind-Edge"), "real-secret");
  });

  test("a forged attestation is stripped when we have no secret to set", async () => {
    const { calls, ctx } = harness({ upstream: json({}) });

    await worker.fetch(
      new Request(`${DEV}/api/v1/_client`, {
        headers: { "X-OhMyWind-Edge": "forged", "X-Forwarded-For": "1.1.1.1" },
      }),
      {},
      ctx,
    );

    assert.equal(calls.upstream[0].headers.get("X-OhMyWind-Edge"), null);
    assert.equal(calls.upstream[0].headers.get("X-Forwarded-For"), null);
  });

  test("a redirect to the Space is rewritten back to the public hostname", async () => {
    const { ctx } = harness({
      upstream: new Response(null, {
        status: 302,
        headers: {
          Location: "https://qdonnars-openwind-mcp-dev.hf.space/mcp",
        },
      }),
    });

    const response = await worker.fetch(new Request(`${DEV}/`), {}, ctx);
    assert.equal(response.headers.get("Location"), `${DEV}/mcp`);
  });
});

describe("keep-alive ping", () => {
  test("wakes every Space, direct, when a cron eventually fires", async () => {
    const { calls, ctx } = harness({ upstream: json([]) });

    await worker.scheduled({ cron: "*/30 * * * *" }, {}, ctx);

    assert.deepEqual(
      calls.upstream.map((request) => request.url ?? request),
      [
        "https://qdonnars-openwind-mcp.hf.space/api/v1/archetypes",
        "https://qdonnars-openwind-mcp-dev.hf.space/api/v1/archetypes",
      ],
    );
  });
});
