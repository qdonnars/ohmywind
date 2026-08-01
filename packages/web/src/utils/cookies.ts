// Cookie helpers. Single place where the attribute string is built, so the
// security flags cannot drift between call sites.

// `Secure` restricts the cookie to HTTPS. It must be omitted on
// http://localhost: a browser silently drops a Secure cookie set over plain
// HTTP, which would make the local dev build behave differently from prod for
// no good reason. Evaluated per call rather than at module load so tests and
// SSR-less prerender paths never touch `window` at import time.
function attributes(maxAgeSeconds: number): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:" ? ";Secure" : "";
  return `max-age=${maxAgeSeconds};path=/;SameSite=Lax${secure}`;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)};${attributes(maxAgeSeconds)}`;
}

export function clearCookie(name: string): void {
  document.cookie = `${name}=;${attributes(0)}`;
}
