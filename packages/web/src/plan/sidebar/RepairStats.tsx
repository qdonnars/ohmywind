// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";
import { repairReport, subscribeRepairReport } from "../repair/client";

const FLAG_KEY = "ohmywind.repairStats";

/**
 * Whether this browser shows the readout: asked for once with
 * `?repair-stats=1` on any plan link (`=0` turns it off), then remembered,
 * since the plan rewrites its own URL as soon as it computes.
 */
function enabled(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("repair-stats");
    if (asked === "1") localStorage.setItem(FLAG_KEY, "1");
    if (asked === "0") localStorage.removeItem(FLAG_KEY);
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

const kb = (bytes: number): string => `${(bytes / 1000).toFixed(1)} ko`;

/** « 1 requête », « 5 requêtes ». */
const count = (n: number, word: string): string => `${n} ${word}${n > 1 ? "s" : ""}`;

const OUTCOMES: Record<string, string> = {
  repaired: "retracée",
  unchanged: "en mer, inchangée",
  refused: "non réparable",
  uncovered: "hors des tuiles",
  failed: "échec",
  drawn: "telle que tracée, à la demande",
};

/**
 * A measuring line for whoever tests the route repair on a device: what the
 * last repair did, how long the search took here, and what it had to fetch
 * (the index once, then each tile once), with the total since the page was
 * loaded. A tile the browser already had in its HTTP cache is counted too:
 * this counts what the page asked for, not what travelled.
 *
 * Not for readers: hidden unless asked for (see `enabled`), and in French
 * only, which is why it stays out of the dictionaries.
 */
export function RepairStats() {
  const report = useSyncExternalStore(subscribeRepairReport, repairReport, () => null);
  if (report === null || !enabled()) return null;
  const { last, session } = report;
  return (
    <div
      data-testid="repair-stats"
      className="font-mono"
      style={{
        fontSize: 11,
        lineHeight: 1.45,
        padding: "6px 16px",
        color: "var(--ow-fg-2)",
        borderBottom: "1px solid var(--ow-line)",
      }}
    >
      <div>
        Route {OUTCOMES[last.kind]}
        {last.kind === "drawn" ? "" : ` sur cet appareil en ${Math.round(last.ms)} ms`}
        {last.error ? ` (${last.error})` : ""}
      </div>
      <div>
        Tuiles : {count(last.requests, "requête")}, {kb(last.bytes)} · session :{" "}
        {count(session.routes, "route")}, {count(session.requests, "requête")}, {kb(session.bytes)}
      </div>
    </div>
  );
}
