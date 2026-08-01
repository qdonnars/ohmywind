import { useEffect, useState } from "react";
import { checkForAppUpdate } from "./sw";

/**
 * Minimal client-side routing, no dependency.
 *
 * The app used to read `window.location.pathname` once at boot, so every
 * internal link was a full document load: React remounted, and the Leaflet
 * instance was destroyed and rebuilt. Switching between the forecast and the
 * planner went black and back, which reads as leaving the app rather than
 * changing view inside it.
 *
 * Links are intercepted at the document level rather than replaced by a
 * `<Link>` component. Ordinary `<a href="/plan">` markup keeps working, stays
 * middle-clickable and copyable, and still resolves if the script fails.
 */

/** GitHub Pages appended trailing slashes when a matching directory existed
    under public/. Strip it so route matching stays a plain comparison. */
function normalisePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function currentLocation(): { path: string; search: string } {
  return { path: normalisePath(window.location.pathname), search: window.location.search };
}

/** Whether this click should be handled in-app rather than by the browser. */
function isInAppNavigation(e: MouseEvent, anchor: HTMLAnchorElement): boolean {
  // Modified clicks mean "open elsewhere" and must reach the browser.
  if (e.defaultPrevented) return false;
  if (e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  // Same-origin absolute paths only. External links, anchors and mailto go
  // to the browser untouched.
  return !!href && href.startsWith("/") && !href.startsWith("//");
}

export function useRouter(): { path: string; search: string } {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const sync = () => {
      setLocation(currentLocation());
      // Navigations no longer hit the network, so this is now the only
      // regular occasion to notice a deploy. Throttled and best-effort.
      checkForAppUpdate();
    };

    const onPopState = () => sync();

    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !isInAppNavigation(e, anchor)) return;
      const href = anchor.getAttribute("href")!;
      e.preventDefault();
      // Re-clicking the current URL should do nothing rather than remount.
      if (href === window.location.pathname + window.location.search) return;
      window.history.pushState(null, "", href);
      window.scrollTo(0, 0);
      sync();
    };

    window.addEventListener("popstate", onPopState);
    // Bubble phase, so React's own handlers on the anchor (e.g. remembering
    // the page to return to from /config) have already run.
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return location;
}

export { normalisePath };
