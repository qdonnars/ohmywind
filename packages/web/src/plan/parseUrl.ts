// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { t } from "../i18n";
import { MOTOR_MAX_KN, MOTOR_SPEED_MIN_KN } from "../config/polarConfig";

/**
 * Engine and efficiency carried by a `/plan` link (#534).
 *
 * A link may say how the plan it describes was computed: `motor=<threshold>,
 * <speed>` in knots (under `threshold` kn of boat speed under sail, the boat
 * motors at `speed` kn) and `eff=<efficiency>`, the fraction sent to the API
 * as `efficiency`. Those settings belong to that plan only: they win over
 * the /config preferences while the plan is on screen and are never written
 * to them. A value the page cannot honour is dropped in silence, the plan
 * still opens on the reader's own settings for that field.
 */
export interface LinkSettings {
  motor: { thresholdKn: number; speedKn: number } | null;
  efficiency: number | null;
}

export interface ParsedPlanParams {
  waypoints: [number, number][];
  departure: string;
  archetype: string;
  /** Optional map center hint, propagated from the home compass FAB when the
      user had a spot selected. Used only when the plan has no waypoints yet. */
  center: [number, number] | null;
  /** Settings the link carries for this plan, null when it carries none. */
  link: LinkSettings | null;
}

export type ParseResult = ParsedPlanParams | { error: string };

function parseCenter(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const [latStr, lonStr] = raw.split(",");
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (isNaN(lat) || isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lat, lon];
}

/** A plain decimal ("4", "5.5", "0.85", ".85"), nothing else: `parseFloat`
    would read "4abc" as 4, and `Number` would read "" as 0 and "1e1" as 10. */
function parseDecimal(raw: string): number {
  return /^(\d+(\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
}

/** `motor=<threshold>,<speed>`: both numbers or nothing, within the domain's
    bounds (threshold in ]0 ; 30], speed in [0.5 ; 30], as the API's
    `validate_motor`). Half a motor would plan 100 % sail while the panel
    announced an engine. */
export function parseMotorParam(raw: string | null): LinkSettings["motor"] {
  if (raw === null) return null;
  const parts = raw.split(",");
  if (parts.length !== 2) return null;
  const thresholdKn = parseDecimal(parts[0].trim());
  const speedKn = parseDecimal(parts[1].trim());
  if (!(thresholdKn > 0 && thresholdKn <= MOTOR_MAX_KN)) return null;
  if (!(speedKn >= MOTOR_SPEED_MIN_KN && speedKn <= MOTOR_MAX_KN)) return null;
  return { thresholdKn, speedKn };
}

/** `eff=<efficiency>`: a fraction in ]0 ; 1], the unit of the API field. */
export function parseEffParam(raw: string | null): number | null {
  if (raw === null) return null;
  const eff = parseDecimal(raw.trim());
  return eff > 0 && eff <= 1 ? eff : null;
}

function parseLinkSettings(p: URLSearchParams): LinkSettings | null {
  const motor = parseMotorParam(p.get("motor"));
  const efficiency = parseEffParam(p.get("eff"));
  return motor === null && efficiency === null ? null : { motor, efficiency };
}

export function parsePlanUrl(search: string): ParseResult {
  const p = new URLSearchParams(search);
  const wpts = p.get("wpts");
  const departure = p.get("departure") ?? "";
  const archetype = p.get("archetype") ?? "";
  const center = parseCenter(p.get("center"));
  const link = parseLinkSettings(p);

  // No wpts at all → fresh empty plan (valid, not an error)
  if (!wpts) return { waypoints: [], departure, archetype, center, link };

  try {
    const parts = wpts.split(";").filter(Boolean);
    if (parts.length < 2) return { error: t("plan.url.errors.tooFewWaypoints") };
    const waypoints = parts.map((wp): [number, number] => {
      const [latStr, lonStr] = wp.split(",");
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (isNaN(lat) || isNaN(lon)) {
        throw new Error(t("plan.url.errors.invalidWaypoint", { value: wp }));
      }
      if (lat < -90 || lat > 90) {
        throw new Error(t("plan.url.errors.latitudeOutOfRange", { value: lat }));
      }
      if (lon < -180 || lon > 180) {
        throw new Error(t("plan.url.errors.longitudeOutOfRange", { value: lon }));
      }
      return [lat, lon];
    });
    return { waypoints, departure, archetype, center, link };
  } catch (e) {
    return {
      error: t("plan.url.errors.invalidWaypoints", {
        detail: e instanceof Error ? e.message : String(e),
      }),
    };
  }
}

export function isParsedOk(r: ParseResult): r is ParsedPlanParams {
  return !("error" in r);
}

/** The query tail of the link settings, empty when there are none. Kept on
    every rewrite of the address bar while they apply, so the link the reader
    shares from the page is still the plan they are looking at. */
function linkSettingsQuery(link: LinkSettings | null | undefined): string {
  if (!link) return "";
  let q = "";
  if (link.motor) q += `&motor=${link.motor.thresholdKn},${link.motor.speedKn}`;
  if (link.efficiency !== null) q += `&eff=${link.efficiency}`;
  return q;
}

export function buildPlanUrl(
  waypoints: [number, number][],
  departure: string,
  archetype: string,
  link: LinkSettings | null = null,
): string {
  const wpts = waypoints.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(";");
  return `/plan?wpts=${wpts}&departure=${encodeURIComponent(departure)}&archetype=${encodeURIComponent(archetype)}${linkSettingsQuery(link)}`;
}
