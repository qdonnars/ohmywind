// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The route repair as the plan asks for it: computed here, in the browser.
 *
 * The server gives the app data, not answers: the land tiles come from it,
 * the search runs in a worker of this page, and the passage request that
 * follows always says `repair_route: false`. When the browser cannot repair
 * (no worker, tiles that did not come, a search past its time), the route
 * is planned as drawn; nobody else is asked.
 */

import type { Notice, RepairedRoute } from "../types";
import type { RepairNotice, RepairOutcome } from "./repair";
import type { RepairCost, RepairReply, RepairRequest } from "./worker";

/** Past this the route goes as drawn, and the worker is stopped: a search
    still running would hold the next route up behind it. */
const TIMEOUT_MS = 8000;

/** What the last repair did and cost, for whoever measures it
    (`RepairStats`): `failed` when the browser had no answer. */
export interface RepairReport {
  last: { kind: RepairOutcome["kind"] | "failed"; error?: string } & RepairCost;
  /** Since the page was loaded. */
  session: { routes: number; requests: number; bytes: number };
}

let report: RepairReport | null = null;
const listeners = new Set<() => void>();

export function subscribeRepairReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function repairReport(): RepairReport | null {
  return report;
}

function record(last: RepairReport["last"]): void {
  const session = report?.session ?? { routes: 0, requests: 0, bytes: 0 };
  report = {
    last,
    session: {
      routes: session.routes + 1,
      requests: session.requests + last.requests,
      bytes: session.bytes + last.bytes,
    },
  };
  for (const listener of listeners) listener();
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (reply: RepairReply | null) => void>();

function stopWorker(): void {
  worker?.terminate();
  worker = null;
  for (const resolve of waiting.values()) resolve(null);
  waiting.clear();
}

function startWorker(): Worker | null {
  if (worker !== null) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  worker.onmessage = (event: MessageEvent<RepairReply>) => {
    waiting.get(event.data.id)?.(event.data);
    waiting.delete(event.data.id);
  };
  worker.onerror = () => stopWorker();
  return worker;
}

/** The browser's repair of a route, null when it has no answer. */
function repairLocally(waypoints: [number, number][]): Promise<RepairOutcome | null> {
  const started = performance.now();
  const failed = (error: string): null => {
    record({ kind: "failed", error, ms: performance.now() - started, requests: 0, bytes: 0 });
    return null;
  };
  const target = startWorker();
  if (target === null) return Promise.resolve(failed("no worker"));
  const request: RepairRequest = {
    id: nextId++,
    points: waypoints.map(([lat, lon]) => ({ lat, lon })),
  };
  return new Promise((resolve) => {
    const timer = setTimeout(stopWorker, TIMEOUT_MS);
    waiting.set(request.id, (reply) => {
      clearTimeout(timer);
      if (reply === null) return resolve(failed("stopped"));
      if (!reply.ok) return resolve(failed(reply.error));
      record({ kind: reply.outcome.kind, ...reply.cost });
      resolve(reply.outcome);
    });
    target.postMessage(request);
  });
}

function toNotice(n: RepairNotice): Notice {
  // `message` is a server's sentence for a code this build does not know;
  // these codes are this build's own.
  return n.code === "route.leg_retraced"
    ? {
        code: n.code,
        params: { leg: n.leg, retraced_nm: n.retracedNm, straight_nm: n.straightNm },
        message: "",
      }
    : { code: n.code, params: { distance_m: n.distanceM }, message: "" };
}

export interface PreparedRoute {
  /** The route to plan: the drawn one, or the browser's repair of it. */
  waypoints: [number, number][];
  /** What the browser repaired, in the shape the plan holds a repair in. */
  repaired?: RepairedRoute;
}

/**
 * The route to plan for `waypoints`. `allowRepair` false is « Revenir à mon
 * tracé »: the route goes as drawn.
 */
export async function prepareRoute(
  waypoints: [number, number][],
  allowRepair: boolean,
): Promise<PreparedRoute> {
  if (!allowRepair) return { waypoints };
  const outcome = await repairLocally(waypoints);
  if (outcome === null || outcome.kind !== "repaired") return { waypoints };
  const added = new Set(outcome.added);
  return {
    waypoints: outcome.points.map((p): [number, number] => [p.lat, p.lon]),
    repaired: {
      waypoints: outcome.points.map((p, i) =>
        added.has(i) ? { lat: p.lat, lon: p.lon, by_server: true } : { lat: p.lat, lon: p.lon },
      ),
      changes: outcome.notices.map(toNotice),
    },
  };
}
