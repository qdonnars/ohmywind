// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, vi } from "vitest";
import { BackStack, isLayerEntry, type HistoryLike } from "./useBackDismiss";

/** Just enough of the history API to observe what the stack does to it. A
    real `back()` is asynchronous and fires `popstate`; here the test plays
    that part by calling `handlePop()` itself, which is also what the real
    listener does. */
class FakeHistory implements HistoryLike {
  entries: unknown[] = [null];
  index = 0;

  get state(): unknown {
    return this.entries[this.index];
  }

  pushState(data: unknown): void {
    this.entries.length = this.index + 1;
    this.entries.push(data);
    this.index += 1;
  }

  back(): void {
    if (this.index > 0) this.index -= 1;
  }
}

describe("isLayerEntry", () => {
  it("recognises the entries a layer pushes", () => {
    const history = new FakeHistory();
    new BackStack(history).open(() => {});
    expect(isLayerEntry(history.state)).toBe(true);
  });

  it("leaves every other entry alone", () => {
    // null is what the router pushes for a navigation, and what a plain page
    // load leaves behind.
    expect(isLayerEntry(null)).toBe(false);
    expect(isLayerEntry(undefined)).toBe(false);
    expect(isLayerEntry({})).toBe(false);
    expect(isLayerEntry({ scroll: 12 })).toBe(false);
  });
});

describe("BackStack", () => {
  it("spends one history entry per open layer", () => {
    const history = new FakeHistory();
    const stack = new BackStack(history);
    stack.open(() => {});
    stack.open(() => {});
    expect(history.entries).toHaveLength(3);
    expect(stack.depth).toBe(2);
  });

  it("dismisses the topmost layer only, innermost first", () => {
    const history = new FakeHistory();
    const stack = new BackStack(history);
    const outer = vi.fn();
    const inner = vi.fn();
    stack.open(outer);
    stack.open(inner);

    history.back();
    stack.handlePop();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    history.back();
    stack.handlePop();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("leaves the app once every layer is closed", () => {
    // Nothing left to dismiss: the press belongs to the browser, which takes
    // the user out of the app. The stack must not throw over it.
    const stack = new BackStack(new FakeHistory());
    expect(() => stack.handlePop()).not.toThrow();
  });

  it("drops its entry when the layer closes from inside the app", () => {
    // Seed: closing the infos modal with its ✕ used to leave a dead entry
    // behind, so the next back press did nothing visible.
    const history = new FakeHistory();
    const stack = new BackStack(history);
    const dismiss = vi.fn();
    const token = stack.open(dismiss);

    stack.close(token);
    expect(history.index).toBe(0);
    expect(stack.depth).toBe(0);

    // The back() above fires a popstate of its own; it must not be mistaken
    // for a user press and dismiss the next layer down.
    stack.handlePop();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("keeps history intact when the layer closed is not the current entry", () => {
    const history = new FakeHistory();
    const stack = new BackStack(history);
    const under = stack.open(() => {});
    stack.open(() => {});

    stack.close(under);
    expect(history.index).toBe(2);
    expect(stack.depth).toBe(1);
  });

  it("consumes a self-pop only once", () => {
    const history = new FakeHistory();
    const stack = new BackStack(history);
    const closed = vi.fn();
    const kept = vi.fn();
    const token = stack.open(closed);
    stack.close(token);
    stack.handlePop();

    stack.open(kept);
    history.back();
    stack.handlePop();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("forgets the layers of a page being left", () => {
    const history = new FakeHistory();
    const stack = new BackStack(history);
    const dismiss = vi.fn();
    stack.open(dismiss);

    stack.detachAll();
    stack.handlePop();
    expect(dismiss).not.toHaveBeenCalled();
    expect(stack.depth).toBe(0);
  });
});
