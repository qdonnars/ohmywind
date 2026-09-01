// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useRef, useState } from "react";
import {
  clearGeolocationDecline,
  rememberGeolocationDecline,
} from "../config/geolocPreference";

export interface UserPosition {
  lat: number;
  lon: number;
  /** Horizontal accuracy radius in metres, as reported by the browser. */
  accuracyM: number;
  /** Monotonic id bumped on every fix. Consumers key their "fly to me"
      effects on it so a second tap on the locate button still recenters,
      even when the coordinates came back byte-identical to the previous
      fix (stationary user, cached position). */
  stamp: number;
}

export type GeolocStatus =
  | "idle"
  | "locating"
  | "ready"
  | "denied"
  | "unavailable"
  | "timeout";

/** Browser error code → status. Codes are the GeolocationPositionError
    constants (1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT);
    they are read numerically because the constants are unavailable in a
    non-DOM test environment. */
export function statusFromErrorCode(code: number): GeolocStatus {
  switch (code) {
    case 1:
      return "denied";
    case 3:
      return "timeout";
    default:
      return "unavailable";
  }
}

/** Status to surface after a failed request. A silent request (the app asked
    on its own, the user asked for nothing) swallows the failure and returns
    to idle: error bubbles are reserved for explicit taps. Notably, the very
    first launch of the Android TWA can fail with a technical "denied" before
    Chrome has registered the app for permission delegation, and that must
    not greet the user with an error they did nothing to cause. */
export function statusAfterFailure(code: number, silent: boolean): GeolocStatus {
  return silent ? "idle" : statusFromErrorCode(code);
}

/** User-facing French copy for the failure states. Returns null when there
    is nothing to say (idle, locating, ready). */
export function geolocMessage(status: GeolocStatus): string | null {
  switch (status) {
    case "denied":
      return "Position refusée. Autorisez la localisation dans les réglages de votre navigateur.";
    case "unavailable":
      return "Position indisponible. Vérifiez que la localisation est activée sur votre appareil.";
    case "timeout":
      return "La position met trop de temps à arriver. Réessayez.";
    default:
      return null;
  }
}

/** A locate() request that never rejects: failures resolve to null and are
    reflected in `status`. Geolocation denial is an ordinary outcome here,
    not an exception to handle at every call site. */
const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  // A minute-old fix is fine for framing a map. Anything older and we would
  // risk centering on the harbour the user left this morning.
  maximumAge: 60_000,
};

/**
 * Browser geolocation as a mechanism, with no policy of its own.
 *
 * Callers decide *when* to ask and *what* to do with a fix. `locate()`
 * resolves with the position so a page can act on that specific fix
 * (recenter, bias a search) without racing an effect on shared state.
 */
export function useGeolocation() {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [status, setStatus] = useState<GeolocStatus>("idle");
  /** Counts started requests. Lets the UI tell a dismissed failure from a
      fresh one, so retrying re-shows a message the user had closed. */
  const [attempt, setAttempt] = useState(0);
  const stampRef = useRef(0);
  const inFlightRef = useRef<Promise<UserPosition | null> | null>(null);
  /** Whether the in-flight request may fail without surfacing an error. */
  const silentRef = useRef(false);

  const locate = useCallback(
    (
      options?: PositionOptions,
      { silent = false }: { silent?: boolean } = {},
    ): Promise<UserPosition | null> => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus(silent ? "idle" : "unavailable");
        return Promise.resolve(null);
      }
      // Rapid double-taps share one browser prompt rather than queueing a
      // second permission dialog behind the first.
      if (inFlightRef.current) {
        // A manual tap joining an in-flight silent request lifts the
        // silence: the user now expects feedback for this very request.
        if (!silent) silentRef.current = false;
        return inFlightRef.current;
      }
      silentRef.current = silent;

      setStatus("locating");
      setAttempt((n) => n + 1);
      const request = new Promise<UserPosition | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            stampRef.current += 1;
            const next: UserPosition = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
              stamp: stampRef.current,
            };
            setPosition(next);
            setStatus("ready");
            // The user granted it, possibly after changing their mind in the
            // browser settings: a past refusal must not keep haunting them.
            clearGeolocationDecline();
            resolve(next);
          },
          (err) => {
            setStatus(statusAfterFailure(err.code, silentRef.current));
            // Only an outright refusal is remembered. A timeout or a
            // temporarily unavailable fix says nothing about consent and
            // must not silence the automatic request forever.
            if (statusFromErrorCode(err.code) === "denied") {
              rememberGeolocationDecline();
            }
            resolve(null);
          },
          { ...DEFAULT_OPTIONS, ...options },
        );
      }).finally(() => {
        inFlightRef.current = null;
      });

      inFlightRef.current = request;
      return request;
    },
    [],
  );

  return { position, status, attempt, locate };
}
