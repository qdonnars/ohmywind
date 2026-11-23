// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { decodePayload } from "../storage/transfer";
import { parseReturnUrl, prepareReturnUrl, returnUrlBuilder } from "./bridgeUrl";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const NONCE = "0123456789abcdef0123456789abcdef";

function storage(entries: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (k) => (k in entries ? entries[k] : null) };
}

/** What Android hands the app for an `intent:` URL: the scheme put back,
    the fragment gone. */
function asReceivedByApp(intentUrl: string): string {
  return intentUrl.replace(/^intent:/, "ohmywind:").replace(/#Intent;.*$/, "");
}

describe("returnUrlBuilder", () => {
  it("returns to the store app from production", () => {
    const build = returnUrlBuilder({ hostname: "ohmywind.fr", userAgent: ANDROID });
    expect(build?.(NONCE, "abc")).toBe(
      `intent://import?v=1&n=${NONCE}&d=abc#Intent;scheme=ohmywind;package=fr.ohmywind.app;end`,
    );
  });

  it("returns to the dev build from any other host", () => {
    for (const hostname of ["dev.ohmywind.fr", "localhost", "www.ohmywind.fr"]) {
      const url = returnUrlBuilder({ hostname, userAgent: ANDROID })?.(NONCE, "abc");
      expect(url).toContain(";package=fr.ohmywind.app.dev;");
    }
  });

  it("has no way back outside Android yet", () => {
    expect(returnUrlBuilder({ hostname: "ohmywind.fr", userAgent: IPHONE })).toBeNull();
    expect(returnUrlBuilder({ hostname: "ohmywind.fr", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBeNull();
  });
});

describe("prepareReturnUrl", () => {
  const env = { hostname: "ohmywind.fr", userAgent: ANDROID };

  it("carries the transferable storage back to the app", () => {
    const url = prepareReturnUrl(
      `?n=${NONCE}`,
      storage({ ow_theme: "dark", ow_last_simulation_v1: "{}" }),
      env,
    );
    const params = parseReturnUrl(asReceivedByApp(url!));
    expect(params).toMatchObject({ v: "1", n: NONCE });
    expect(decodePayload(params!.d)).toEqual({ items: { ow_theme: "dark" } });
  });

  it("still answers when there is nothing to bring across", () => {
    const url = prepareReturnUrl(`?n=${NONCE}`, storage({}), env);
    const params = parseReturnUrl(asReceivedByApp(url!));
    expect(decodePayload(params!.d)).toEqual({ items: {} });
  });

  it("refuses a missing or malformed nonce", () => {
    expect(prepareReturnUrl("", storage({}), env)).toBeNull();
    expect(prepareReturnUrl("?n=short", storage({}), env)).toBeNull();
    expect(prepareReturnUrl("?n=abc%26d%3Devil0000000000", storage({}), env)).toBeNull();
    expect(prepareReturnUrl(`?n=${"a".repeat(129)}`, storage({}), env)).toBeNull();
  });

  it("does nothing outside Android", () => {
    expect(prepareReturnUrl(`?n=${NONCE}`, storage({ ow_theme: "dark" }), { ...env, userAgent: IPHONE })).toBeNull();
  });
});

describe("parseReturnUrl", () => {
  it("reads the import URL", () => {
    expect(parseReturnUrl(`ohmywind://import?v=1&n=${NONCE}&d=e30`)).toEqual({ v: "1", n: NONCE, d: "e30" });
  });

  it("ignores any other URL", () => {
    expect(parseReturnUrl(`https://ohmywind.fr/import?v=1&n=${NONCE}&d=e30`)).toBeNull();
    expect(parseReturnUrl(`ohmywind://plan?v=1&n=${NONCE}&d=e30`)).toBeNull();
    expect(parseReturnUrl(`other://import?v=1&n=${NONCE}&d=e30`)).toBeNull();
    expect(parseReturnUrl(`ohmywind://import?v=1&n=${NONCE}`)).toBeNull();
    expect(parseReturnUrl("not a url")).toBeNull();
  });
});
