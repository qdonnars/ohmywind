// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useRouter } from "./router";
import { getLocation, navigate, normalisePath } from "./navigation";

// The router calls into the service worker on every navigation. That module
// registers a worker and imports a virtual one, neither of which belongs in a
// routing test.
vi.mock("./sw", () => ({
  checkForAppUpdate: vi.fn(),
  flushPendingUpdate: vi.fn(),
}));

function Probe() {
  const { path, search } = useRouter();
  return (
    <div>
      <span data-testid="path">{path}</span>
      <span data-testid="search">{search}</span>
      <a href="/plan">planifier</a>
      <a href="/config">réglages</a>
      <a href="https://example.org/ailleurs">dehors</a>
      <a href="/exemple.csv" download="exemple.csv">
        télécharger
      </a>
    </div>
  );
}

/** jsdom starts every file at the same URL; reset to "/" between cases. */
beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("normalisePath", () => {
  it("strips a trailing slash, except on the root", () => {
    expect(normalisePath("/plan/")).toBe("/plan");
    expect(normalisePath("/plan")).toBe("/plan");
    expect(normalisePath("/")).toBe("/");
  });
});

describe("getLocation", () => {
  it("keeps its identity while the URL does not change", () => {
    // useSyncExternalStore loops forever on a snapshot rebuilt every call.
    const first = getLocation();
    expect(getLocation()).toBe(first);
  });

  it("returns a new snapshot once the URL changes", () => {
    const first = getLocation();
    window.history.replaceState(null, "", "/config");
    const second = getLocation();
    expect(second).not.toBe(first);
    expect(second.path).toBe("/config");
  });
});

describe("useRouter", () => {
  it("reports the location at mount", () => {
    window.history.replaceState(null, "", "/plan?wpts=1,2");
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("path").textContent).toBe("/plan");
    expect(getByTestId("search").textContent).toBe("?wpts=1,2");
  });

  it("follows a push", () => {
    const { getByTestId } = render(<Probe />);
    act(() => {
      navigate("/config");
    });
    expect(getByTestId("path").textContent).toBe("/config");
    expect(window.location.pathname).toBe("/config");
  });

  it("follows a replace, which is the case the bug was about", () => {
    // On /plan without a query string, the mount rewrites the URL with the
    // restored route. Written straight to `history`, the router kept
    // `search: ""` and the page remounted at the next back press, dropping
    // the computed results.
    window.history.replaceState(null, "", "/plan");
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("search").textContent).toBe("");
    act(() => {
      navigate("/plan?wpts=43.29,5.37", { replace: true });
    });
    expect(getByTestId("search").textContent).toBe("?wpts=43.29,5.37");
  });

  it("stacks a push and replaces on a replace", () => {
    const before = window.history.length;
    act(() => {
      navigate("/config");
    });
    expect(window.history.length).toBe(before + 1);
    act(() => {
      navigate("/config?tab=polar", { replace: true });
    });
    expect(window.history.length).toBe(before + 1);
  });

  it("follows a back press", () => {
    const { getByTestId } = render(<Probe />);
    act(() => {
      navigate("/config");
    });
    expect(getByTestId("path").textContent).toBe("/config");
    // The back press itself is the browser's job, and jsdom traverses its
    // history on a queue we would have to race. What is ours is the listener:
    // the URL moves, `popstate` fires, and the router has to re-read.
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(getByTestId("path").textContent).toBe("/");
  });

  it("picks up a back press that only closes a panel, without losing the query", () => {
    // The exact sequence of the bug: /plan mounts, rewrites its own URL, then
    // a panel is opened and closed. The location the router reports after the
    // back press must be the rewritten one, unchanged since the rewrite.
    window.history.replaceState(null, "", "/plan");
    const { getByTestId } = render(<Probe />);
    act(() => {
      navigate("/plan?wpts=43.29,5.37", { replace: true });
    });
    act(() => {
      // A layer pushes an entry with no URL change, then pops it.
      window.history.pushState({ "ohmywind:layer": 1 }, "");
      window.history.replaceState(null, "", "/plan?wpts=43.29,5.37");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(getByTestId("path").textContent).toBe("/plan");
    expect(getByTestId("search").textContent).toBe("?wpts=43.29,5.37");
  });

  it("intercepts a same-origin link instead of leaving it to the browser", () => {
    const { getByText, getByTestId } = render(<Probe />);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      getByText("planifier").dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(getByTestId("path").textContent).toBe("/plan");
  });

  it("leaves an external link, a modified click and a download alone", () => {
    const { getByText, getByTestId } = render(<Probe />);
    const cases = [
      [getByText("dehors"), new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })],
      [getByText("télécharger"), new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })],
      [
        getByText("réglages"),
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: true }),
      ],
      [
        getByText("réglages"),
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 1 }),
      ],
    ] as const;
    for (const [el, event] of cases) {
      act(() => {
        el.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(getByTestId("path").textContent).toBe("/");
  });

  it("ignores a click on the URL already displayed", () => {
    window.history.replaceState(null, "", "/plan");
    const { getByText } = render(<Probe />);
    const before = window.history.length;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      getByText("planifier").dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(window.history.length).toBe(before);
  });

  it("stops listening once unmounted", () => {
    const { getByTestId, unmount } = render(<Probe />);
    const rendered = getByTestId("path");
    unmount();
    act(() => {
      navigate("/config");
    });
    // The detached node keeps the last value it was given, and no update was
    // attempted on an unmounted tree (React would warn).
    expect(rendered.textContent).toBe("/");
  });
});
