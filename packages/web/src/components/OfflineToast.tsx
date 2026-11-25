// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useSyncExternalStore } from "react";
import { useOnline } from "../hooks/useOnline";
import { useT } from "../i18n";
import {
  dismissOfflineNotice,
  offlineNoticeShown,
  subscribeOfflineNotice,
} from "../offline/offlineNotice";

function WifiOffIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M12 20h.01" />
      <path d="M8.5 16.43a5 5 0 0 1 7 0" />
      <path d="M5 12.86a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.86a10 10 0 0 0-2-1.52" />
      <path d="M2 8.82a15 15 0 0 1 4.18-2.64" />
      <path d="M22 8.82a15 15 0 0 0-11.29-3.76" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

/**
 * « Hors ligne : mise à jour impossible », for a few seconds, when a request
 * the reader made could not go out (`offline/offlineNotice.ts`).
 *
 * Mounted once per page, where the offline banner used to be: under the
 * search floating over a full-screen map (`MapTopBar`, `floating`), centred
 * on the part of the map left visible and never as wide as the column of
 * round controls on the right (`.ow-offline-toast-slot` in index.css); under
 * the header of a page that keeps one (`Header`), centred on the page, over
 * the content rather than pushing it down. One line while the width allows,
 * two centred lines on the narrowest phones.
 *
 * Neutral surface, not the warning colours: losing the network at sea is
 * ordinary, and the toast only says why nothing new came. The live region
 * stays in the tree so the text is heard when it appears (`role="status"`,
 * polite). Taken down as soon as the browser reports the network back.
 */
export function OfflineToast({ floating = false }: { floating?: boolean }) {
  const { t } = useT();
  const online = useOnline();
  const shown = useSyncExternalStore(subscribeOfflineNotice, offlineNoticeShown, () => false);
  useEffect(() => {
    if (online) dismissOfflineNotice();
  }, [online]);
  const visible = shown && !online;
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        floating
          ? "ow-offline-toast-slot flex justify-center pointer-events-none"
          : "absolute inset-x-0 top-full mt-2 flex justify-center px-4 pointer-events-none"
      }
    >
      {visible && (
        <p
          className="animate-fade-in flex items-center justify-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-[13px] leading-snug font-medium text-center text-balance"
          style={{
            background: "var(--ow-surface-pop)",
            border: "1px solid var(--ow-line-2)",
            color: "var(--ow-fg-1)",
            boxShadow: "var(--ow-shadow-2)",
          }}
        >
          <WifiOffIcon />
          {t("common.offline.toast")}
        </p>
      )}
    </div>
  );
}
