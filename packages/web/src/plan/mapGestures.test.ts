// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { closestOnPolyline, TapGuard } from "./mapGestures";

describe("closestOnPolyline", () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 400 },
  ];

  it("choisit le segment par distance perpendiculaire, pas par milieu", () => {
    // Beside the long vertical leg, far from its midpoint (100, 200) but
    // closer to it than to the short leg's midpoint (50, 0)? No: (105, 40)
    // is 40 px from the short leg's end and 5 px from the long leg.
    const hit = closestOnPolyline(route, { x: 105, y: 40 });
    expect(hit?.segIdx).toBe(1);
    expect(hit?.point).toEqual({ x: 100, y: 40 });
    expect(hit?.distPx).toBeCloseTo(5);
  });

  it("projette sur la ligne : un tap à côté donne un point sur le segment", () => {
    const hit = closestOnPolyline(route, { x: 30, y: 9 });
    expect(hit?.segIdx).toBe(0);
    expect(hit?.point).toEqual({ x: 30, y: 0 });
    expect(hit?.distPx).toBeCloseTo(9);
  });

  it("borne la projection aux extrémités", () => {
    const hit = closestOnPolyline(route, { x: -20, y: 0 });
    expect(hit?.segIdx).toBe(0);
    expect(hit?.point).toEqual({ x: 0, y: 0 });
    expect(hit?.distPx).toBeCloseTo(20);
  });

  it("rend null sans segment", () => {
    expect(closestOnPolyline([{ x: 0, y: 0 }], { x: 1, y: 1 })).toBeNull();
    expect(closestOnPolyline([], { x: 1, y: 1 })).toBeNull();
  });
});

describe("TapGuard", () => {
  const down = (over: Partial<Parameters<TapGuard["pointerDown"]>[0]> = {}) => ({
    pointerId: 1,
    x: 100,
    y: 100,
    t: 1000,
    inside: true,
    onMarker: false,
    mouse: false,
    button: 0,
    ...over,
  });

  it("accepte un tap bref, immobile, dans la carte", () => {
    const g = new TapGuard();
    g.pointerDown(down());
    g.pointerMove({ pointerId: 1, x: 104, y: 103, t: 1080 });
    g.pointerUp({ pointerId: 1, x: 104, y: 103, t: 1120 });
    expect(g.acceptClick(1125)).toBe(true);
    // Consumed: the same verdict does not serve a second click.
    expect(g.acceptClick(1130)).toBe(false);
  });

  it("refuse un doigt qui s'attarde, mais pas une souris", () => {
    const finger = new TapGuard();
    finger.pointerDown(down());
    finger.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1600 });
    expect(finger.acceptClick(1605)).toBe(false);

    const mouse = new TapGuard();
    mouse.pointerDown(down({ mouse: true }));
    mouse.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1600 });
    expect(mouse.acceptClick(1605)).toBe(true);
  });

  it("refuse un déplacement au-delà du slop, même revenu au point de départ", () => {
    const g = new TapGuard();
    g.pointerDown(down());
    g.pointerMove({ pointerId: 1, x: 115, y: 100, t: 1050 });
    g.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1100 });
    expect(g.acceptClick(1105)).toBe(false);
  });

  it("refuse un geste commencé hors de la carte ou sur un marqueur", () => {
    const outside = new TapGuard();
    outside.pointerDown(down({ inside: false }));
    outside.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1050 });
    expect(outside.acceptClick(1055)).toBe(false);

    const marker = new TapGuard();
    marker.pointerDown(down({ onMarker: true }));
    marker.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1050 });
    expect(marker.acceptClick(1055)).toBe(false);
  });

  it("refuse un second doigt pendant le geste (pincement)", () => {
    const g = new TapGuard();
    g.pointerDown(down());
    g.pointerDown(down({ pointerId: 2, x: 300, y: 300, t: 1020 }));
    g.pointerUp({ pointerId: 2, x: 300, y: 300, t: 1040 });
    g.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1050 });
    expect(g.acceptClick(1055)).toBe(false);
  });

  it("refuse un clic sans geste, un clic tardif, un bouton secondaire, une annulation", () => {
    expect(new TapGuard().acceptClick(1000)).toBe(false);

    const late = new TapGuard();
    late.pointerDown(down());
    late.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1050 });
    expect(late.acceptClick(2000)).toBe(false);

    const right = new TapGuard();
    right.pointerDown(down({ mouse: true, button: 2 }));
    right.pointerUp({ pointerId: 1, x: 100, y: 100, t: 1050 });
    expect(right.acceptClick(1055)).toBe(false);

    const cancelled = new TapGuard();
    cancelled.pointerDown(down());
    cancelled.pointerCancel({ pointerId: 1, x: 100, y: 100, t: 1050 });
    expect(cancelled.acceptClick(1055)).toBe(false);
  });
});
