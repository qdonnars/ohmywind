// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useOnline } from "../hooks/useOnline";
import { useT } from "../i18n";

/**
 * One line under the header, only while the browser reports no network.
 *
 * Placed in the `Header`, which the explorer and the planner both mount, so
 * there is a single instance and a single wording. Discreet on purpose: the
 * shell, the map already loaded and a plan already computed all keep working
 * offline. What stops is the refresh of the forecasts, and that is what the
 * sentence says, rather than a blanket "no connection" that would suggest the
 * page is broken.
 *
 * `role="status"` and not `alert`: losing the network is worth announcing to
 * a screen reader once it is idle, not worth interrupting whatever it is
 * reading. Every colour comes from the warning tokens, so the banner follows
 * the light and dark themes without a hard-coded value.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();
  if (online) return null;
  return (
    <div
      role="status"
      className="max-w-screen-2xl mx-auto mt-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium flex items-center gap-2"
      style={{
        background: "var(--ow-warn-soft)",
        border: "1px solid var(--ow-warn-line)",
        color: "var(--ow-warn)",
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: "var(--ow-warn)" }}
      />
      {t("explore.offlineBanner.message")}
    </div>
  );
}
