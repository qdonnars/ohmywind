// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { externalHttpUrl, handleLinkClick, openExternalLinksInApp } from "./externalLinks";

const ORIGIN = "https://ohmywind.fr";
const BASE = "https://ohmywind.fr/plan?wpts=1";

describe("externalHttpUrl", () => {
  it("takes http(s) links to another origin", () => {
    expect(externalHttpUrl("https://ko-fi.com/ohmywind", BASE, ORIGIN)).toBe("https://ko-fi.com/ohmywind");
    expect(externalHttpUrl("http://example.com/", BASE, ORIGIN)).toBe("http://example.com/");
    expect(externalHttpUrl("https://dev.ohmywind.fr/plan", BASE, ORIGIN)).toBe("https://dev.ohmywind.fr/plan");
  });

  it("leaves the site's own pages to the app", () => {
    expect(externalHttpUrl("/config", BASE, ORIGIN)).toBeNull();
    expect(externalHttpUrl("https://ohmywind.fr/a-propos", BASE, ORIGIN)).toBeNull();
    expect(externalHttpUrl("#leg-2", BASE, ORIGIN)).toBeNull();
  });

  it("leaves mail, phone and other schemes to the system", () => {
    expect(externalHttpUrl("mailto:contact@ohmywind.fr", BASE, ORIGIN)).toBeNull();
    expect(externalHttpUrl("tel:+33100000000", BASE, ORIGIN)).toBeNull();
    expect(externalHttpUrl("intent://import#Intent;end", BASE, ORIGIN)).toBeNull();
    expect(externalHttpUrl("javascript:void(0)", BASE, ORIGIN)).toBeNull();
  });
});

function link(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  const span = document.createElement("span");
  a.appendChild(span);
  document.body.appendChild(a);
  return a;
}

function click(target: EventTarget, over: Partial<MouseEventInit> = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
    target,
    preventDefault: vi.fn(),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("handleLinkClick", () => {
  it("opens another site in the sheet and stops the navigation", () => {
    const open = vi.fn(() => Promise.resolve());
    const a = link("https://github.com/qdonnars/ohmywind", { target: "_blank" });
    const ev = click(a.firstChild!);
    expect(handleLinkClick(ev, BASE, ORIGIN, open)).toBe("https://github.com/qdonnars/ohmywind");
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("https://github.com/qdonnars/ohmywind");
  });

  it("lets in-app links, mailto and download links go", () => {
    const open = vi.fn(() => Promise.resolve());
    for (const a of [link("/plan"), link("mailto:a@b.fr"), link("https://example.com/f.gpx", { download: "" })]) {
      const ev = click(a);
      expect(handleLinkClick(ev, BASE, ORIGIN, open)).toBeNull();
      expect(ev.preventDefault).not.toHaveBeenCalled();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("respects a click already handled, a modifier or another button", () => {
    const open = vi.fn(() => Promise.resolve());
    const a = link("https://example.com/");
    expect(handleLinkClick(click(a, { ctrlKey: true }), BASE, ORIGIN, open)).toBeNull();
    expect(handleLinkClick(click(a, { button: 1 }), BASE, ORIGIN, open)).toBeNull();
    expect(handleLinkClick({ ...click(a), defaultPrevented: true }, BASE, ORIGIN, open)).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores clicks outside any link", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(handleLinkClick(click(div), BASE, ORIGIN, vi.fn())).toBeNull();
    expect(handleLinkClick(click(document), BASE, ORIGIN, vi.fn())).toBeNull();
  });

  it("survives a sheet that fails to open", async () => {
    const open = vi.fn(() => Promise.reject(new Error("no activity")));
    const a = link("https://example.com/");
    expect(() => handleLinkClick(click(a), BASE, ORIGIN, open)).not.toThrow();
    await Promise.resolve();
  });
});

describe("openExternalLinksInApp", () => {
  it("catches a click whose propagation a map control stops", () => {
    const open = vi.fn(() => Promise.resolve());
    openExternalLinksInApp(window, open);
    const control = document.createElement("div");
    control.addEventListener("click", (e) => e.stopPropagation());
    const a = document.createElement("a");
    a.href = "https://www.openstreetmap.org/copyright";
    control.appendChild(a);
    document.body.appendChild(control);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(ev);
    expect(open).toHaveBeenCalledWith("https://www.openstreetmap.org/copyright");
    expect(ev.defaultPrevented).toBe(true);
  });
});
