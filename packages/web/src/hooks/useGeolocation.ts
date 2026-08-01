import { useCallback, useRef, useState } from "react";

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
  const stampRef = useRef(0);
  const inFlightRef = useRef<Promise<UserPosition | null> | null>(null);

  const locate = useCallback(
    (options?: PositionOptions): Promise<UserPosition | null> => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("unavailable");
        return Promise.resolve(null);
      }
      // Rapid double-taps share one browser prompt rather than queueing a
      // second permission dialog behind the first.
      if (inFlightRef.current) return inFlightRef.current;

      setStatus("locating");
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
            resolve(next);
          },
          (err) => {
            setStatus(statusFromErrorCode(err.code));
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

  return { position, status, locate };
}
