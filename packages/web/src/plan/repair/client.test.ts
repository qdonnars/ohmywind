// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RepairOutcome } from "./repair";
import type { RepairReply, RepairRequest } from "./worker";

const DRAWN: [number, number][] = [
  [48.38, -4.49],
  [48.46, -5.1],
];

/** A worker that answers each request with what `reply` says, or never. */
class FakeWorker {
  static reply: ((request: RepairRequest) => RepairReply | null) | null = null;
  static started = 0;
  static terminated = 0;
  onmessage: ((event: MessageEvent<RepairReply>) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeWorker.started++;
  }

  postMessage(request: RepairRequest): void {
    const reply = FakeWorker.reply?.(request) ?? null;
    if (reply !== null) queueMicrotask(() => this.onmessage?.({ data: reply } as MessageEvent));
  }

  terminate(): void {
    FakeWorker.terminated++;
  }
}

async function load() {
  vi.resetModules();
  return import("./client");
}

function answering(outcome: RepairOutcome, cost = { ms: 200, requests: 5, bytes: 21_000 }): void {
  FakeWorker.reply = (request) => ({ id: request.id, ok: true, outcome, cost });
}

beforeEach(() => {
  FakeWorker.reply = null;
  FakeWorker.started = 0;
  FakeWorker.terminated = 0;
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prepareRoute", () => {
  it("gives the route the browser repaired, in the shape the plan holds a repair in", async () => {
    answering({
      kind: "repaired",
      points: [
        { lat: 48.38, lon: -4.49 },
        { lat: 48.33, lon: -4.6 },
        { lat: 48.46, lon: -5.1 },
      ],
      added: [1],
      notices: [{ code: "route.leg_retraced", leg: 1, retracedNm: "30.9", straightNm: "24.5" }],
    });
    const route = await (await load()).prepareRoute(DRAWN, true);
    expect(route.waypoints).toEqual([
      [48.38, -4.49],
      [48.33, -4.6],
      [48.46, -5.1],
    ]);
    expect(route.repaired).toEqual({
      waypoints: [
        { lat: 48.38, lon: -4.49 },
        { lat: 48.33, lon: -4.6, by_server: true },
        { lat: 48.46, lon: -5.1 },
      ],
      changes: [
        {
          code: "route.leg_retraced",
          params: { leg: 1, retraced_nm: "30.9", straight_nm: "24.5" },
          message: "",
        },
      ],
    });
  });

  it.each(["unchanged", "refused", "uncovered"] as const)(
    "plans the route as drawn when the browser says %s",
    async (kind) => {
      answering({ kind });
      expect(await (await load()).prepareRoute(DRAWN, true)).toEqual({ waypoints: DRAWN });
    },
  );

  it("plans the route as drawn when the worker fails, and says why", async () => {
    FakeWorker.reply = (request) => ({ id: request.id, ok: false, error: "land tiles 404" });
    const client = await load();
    expect(await client.prepareRoute(DRAWN, true)).toEqual({ waypoints: DRAWN });
    expect(client.repairReport()?.last).toMatchObject({ kind: "failed", error: "land tiles 404" });
  });

  it("plans the route as drawn where there is no worker at all", async () => {
    vi.stubGlobal("Worker", undefined);
    const client = await load();
    expect(await client.prepareRoute(DRAWN, true)).toEqual({ waypoints: DRAWN });
    expect(FakeWorker.started).toBe(0);
    expect(client.repairReport()?.last.kind).toBe("failed");
  });

  it("stops a search past its time, and the next route gets a fresh worker", async () => {
    vi.useFakeTimers();
    const client = await load();
    const pending = client.prepareRoute(DRAWN, true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual({ waypoints: DRAWN });
    expect(FakeWorker.terminated).toBe(1);
    answering({ kind: "unchanged" });
    await client.prepareRoute(DRAWN, true);
    expect(FakeWorker.started).toBe(2);
    expect(client.repairReport()?.last.kind).toBe("unchanged");
  });

  it("repairs nothing when the reader went back to their own route", async () => {
    answering({ kind: "refused" });
    const client = await load();
    expect(await client.prepareRoute(DRAWN, false)).toEqual({ waypoints: DRAWN });
    expect(FakeWorker.started).toBe(0);
    expect(client.repairReport()).toBeNull();
  });

  it("keeps the cost of the last repair and the total of the session", async () => {
    const client = await load();
    const heard = vi.fn();
    const stop = client.subscribeRepairReport(heard);
    answering({ kind: "unchanged" }, { ms: 210, requests: 5, bytes: 21_000 });
    await client.prepareRoute(DRAWN, true);
    answering({ kind: "unchanged" }, { ms: 12, requests: 0, bytes: 0 });
    await client.prepareRoute(DRAWN, true);
    expect(client.repairReport()).toEqual({
      last: { kind: "unchanged", ms: 12, requests: 0, bytes: 0 },
      session: { routes: 2, requests: 5, bytes: 21_000 },
    });
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });
});
