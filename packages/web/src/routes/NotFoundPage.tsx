// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useT } from "../i18n";

/**
 * No route matched.
 *
 * The explore map used to be the fallback for every unknown path, so a typo,
 * a stale bookmark or a crawler landed on the app under an address that does
 * not exist, with nothing to say so and no way back except editing the URL.
 */
export function NotFoundPage() {
  const { t } = useT();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-1)" }}
    >
      <p
        className="text-5xl font-bold tabular-nums"
        style={{ color: "var(--ow-accent)", fontFamily: "var(--ow-font-mono)" }}
      >
        404
      </p>
      <h1 className="text-lg font-semibold" style={{ color: "var(--ow-fg-0)" }}>
        {t("config.notFound.title")}
      </h1>
      <p className="max-w-sm text-sm">{t("config.notFound.body")}</p>
      <a
        href="/"
        className="mt-2 min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center transition-all active:scale-[0.98]"
        style={{ background: "var(--ow-accent)", color: "var(--ow-bg-0)" }}
      >
        {t("config.notFound.back")}
      </a>
    </div>
  );
}
