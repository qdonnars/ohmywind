// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_LIMIT,
  ALL_MODELS,
  MODEL_META,
  defaultConfig,
  loadModelConfig,
  saveModelConfig,
} from "../../config/modelConfig";
import { ModelsView } from "./ModelsView";

// jsdom ships no PointerEvent: a MouseEvent with the fields the drag hook
// reads (same seam as useDragReorder.test.tsx).
function pointer(type: string, clientY: number): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}

const ROW_H = 76;

function layOutRows(container: HTMLElement) {
  [...container.querySelectorAll("li")].forEach((row, i) => {
    row.getBoundingClientRect = () =>
      ({ top: i * ROW_H, height: ROW_H, bottom: (i + 1) * ROW_H, left: 0, right: 300, width: 300, x: 0, y: i * ROW_H, toJSON: () => ({}) }) as DOMRect;
  });
}

const rows = (container: HTMLElement) => [...container.querySelectorAll<HTMLLIElement>("li.ow-models-row")];
const handleOf = (row: HTMLElement) => row.querySelector<HTMLButtonElement>("button.ow-models-handle")!;
const label = (i: number) => MODEL_META[defaultConfig().order[i]].label;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ModelsView", () => {
  it("lists every model in the stored order, the shown ones ranked in the accent, the cut after the last of them", () => {
    const { container } = render(<ModelsView />);
    const list = rows(container);
    expect(list).toHaveLength(ALL_MODELS.length);
    list.forEach((row, i) => {
      expect(row.querySelector(".ow-models-rank")?.textContent).toBe(String(i + 1));
      expect(row.classList.contains(i < ACTIVE_LIMIT ? "is-shown" : "is-ignored")).toBe(true);
    });
    const cut = container.querySelectorAll(".ow-models-cut");
    expect(cut).toHaveLength(1);
    expect(list[ACTIVE_LIMIT - 1].contains(cut[0])).toBe(true);
    expect(cut[0].textContent).toBe("↑ Tableau · Ignorés ↓");
  });

  it("takes the number of shown models from ACTIVE_LIMIT in its intro", () => {
    render(<ModelsView />);
    expect(screen.getByText(`${ACTIVE_LIMIT} premiers`).tagName).toBe("B");
  });

  it("names each handle with the model, its rank and whether the table shows it", () => {
    const { container } = render(<ModelsView />);
    const list = rows(container);
    expect(handleOf(list[0]).getAttribute("aria-label")).toBe(`${label(0)}, rang 1, affiché`);
    expect(handleOf(list[ACTIVE_LIMIT]).getAttribute("aria-label")).toBe(
      `${label(ACTIVE_LIMIT)}, rang ${ACTIVE_LIMIT + 1}, ignoré`,
    );
    expect(handleOf(list[0]).getAttribute("aria-roledescription")).toBe("poignée de déplacement");
  });

  it("moves a model one rank with the arrows on its handle, saves it, and keeps the focus on it", () => {
    const { container } = render(<ModelsView />);
    const second = defaultConfig().order[1];
    const handle = handleOf(rows(container)[1]);
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(loadModelConfig().order.slice(0, 2)).toEqual([second, defaultConfig().order[0]]);
    expect(document.activeElement).toBe(handleOf(rows(container)[0]));
    expect(document.activeElement?.getAttribute("aria-label")).toBe(`${MODEL_META[second].label}, rang 1, affiché`);
    // Already first: nothing moves.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(loadModelConfig().order[0]).toBe(second);
  });

  it("says which model enters the table and which one leaves it", () => {
    const { container } = render(<ModelsView />);
    const firstIgnored = handleOf(rows(container)[ACTIVE_LIMIT]);
    fireEvent.keyDown(firstIgnored, { key: "ArrowUp" });
    expect(screen.getByText(`${label(ACTIVE_LIMIT)} affiché, ${label(ACTIVE_LIMIT - 1)} passe en ignorés`)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(container.querySelector(".ow-models-toast")).toBeNull();
  });

  it("reorders by drag, and a drop that crosses the cut toasts too", () => {
    const { container } = render(<ModelsView />);
    layOutRows(container);
    const last = rows(container)[ALL_MODELS.length - 1];
    const lastModel = defaultConfig().order[ALL_MODELS.length - 1];
    act(() => {
      last.dispatchEvent(pointer("pointerdown", (ALL_MODELS.length - 0.5) * ROW_H));
    });
    act(() => {
      last.dispatchEvent(pointer("pointermove", 0.5 * ROW_H));
    });
    act(() => {
      last.dispatchEvent(pointer("pointerup", 0.5 * ROW_H));
    });
    expect(loadModelConfig().order[0]).toBe(lastModel);
    expect(container.querySelector(".ow-models-toast")?.textContent).toBe(
      `${MODEL_META[lastModel].label} affiché, ${label(ACTIVE_LIMIT - 1)} passe en ignorés`,
    );
  });

  it("puts the default order back on reset", () => {
    saveModelConfig({ order: [...defaultConfig().order].reverse() });
    const { container } = render(<ModelsView />);
    expect(rows(container)[0].textContent).toContain(MODEL_META[defaultConfig().order.at(-1)!].label);
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser l'ordre" }));
    expect(loadModelConfig().order).toEqual(defaultConfig().order);
    expect(rows(container)[0].textContent).toContain(label(0));
    expect(screen.getByText("Ordre par défaut rétabli")).toBeTruthy();
  });
});
