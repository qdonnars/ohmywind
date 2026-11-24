// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { prepareReturnUrl } from "../native/bridgeUrl";

/**
 * /transfert: the browser half of the storage bridge to the native app.
 *
 * The app opens this page in a Custom Tab, which shares Chrome's storage,
 * where the former Android app kept the reader's spots and settings. The
 * page reads them and sends them straight back to the app in the return URL.
 * No map, no forecast: it should be gone before anyone reads it.
 */

// Chrome may refuse to leave for an app without a user gesture. Past this
// delay the page assumes it did, and offers the tap that completes it.
const FALLBACK_DELAY_MS = 1500;

function currentReturnUrl(): string | null {
  try {
    return prepareReturnUrl(window.location.search, window.localStorage, {
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
    });
  } catch {
    // Storage blocked: nothing to read, so nothing to send either.
    return null;
  }
}

interface Props {
  /** How to leave for the return URL. Replaced in tests, which cannot
      follow an `intent:` navigation. */
  navigateTo?: (url: string) => void;
}

function leaveFor(url: string): void {
  window.location.assign(url);
}

export function TransferPage({ navigateTo = leaveFor }: Props) {
  const { t } = useT();
  const [returnUrl] = useState(currentReturnUrl);
  const [showButton, setShowButton] = useState(false);
  // StrictMode runs effects twice in development: one intent is enough.
  const sent = useRef(false);

  useEffect(() => {
    if (!returnUrl) return;
    if (!sent.current) {
      sent.current = true;
      navigateTo(returnUrl);
    }
    const timer = window.setTimeout(() => setShowButton(true), FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [returnUrl, navigateTo]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-1)" }}
    >
      {returnUrl ? (
        <>
          <p className="max-w-sm text-sm" role="status">
            {t("config.transfer.working")}
          </p>
          {showButton && (
            // A real link: the tap is the user gesture Chrome asks for, and
            // the router leaves non-path hrefs to the browser.
            <a
              href={returnUrl}
              className="mt-2 min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center transition-all active:scale-[0.98]"
              style={{ background: "var(--ow-accent)", color: "var(--ow-bg-0)" }}
            >
              {t("config.transfer.button")}
            </a>
          )}
        </>
      ) : (
        <>
          <p className="max-w-sm text-sm">{t("config.transfer.unavailable")}</p>
          <a
            href="/"
            className="mt-2 min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center transition-all active:scale-[0.98]"
            style={{ background: "var(--ow-accent)", color: "var(--ow-bg-0)" }}
          >
            {t("config.notFound.back")}
          </a>
        </>
      )}
    </div>
  );
}
