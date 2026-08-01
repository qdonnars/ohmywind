/**
 * Remembers that the user turned down location sharing.
 *
 * The browser already remembers the permission, but it never tells us
 * whether it will prompt or refuse silently. Without our own record the app
 * would fire an automatic request on every first-visit-like session and, on
 * a device where the permission is denied at OS level, greet the user with
 * the same error bubble each time.
 *
 * This flag only ever suppresses the *automatic* request. An explicit tap on
 * the locate button always retries, because a user who changed their mind in
 * the browser settings must not be locked out by a stale flag of ours. A
 * successful fix clears it.
 */

const STORAGE_KEY = "ow_geoloc_declined_v1";

export function hasDeclinedGeolocation(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private browsing or storage disabled: behave as if nothing was
    // refused, the worst case being one prompt the user can dismiss.
    return false;
  }
}

export function rememberGeolocationDecline(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* storage unavailable: the flag is a convenience, not a requirement */
  }
}

export function clearGeolocationDecline(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
