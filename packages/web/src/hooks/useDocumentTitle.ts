// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect } from "react";

/** The title of index.html, the one every other route shows. */
const SHELL_TITLE = "OhMyWind";

/**
 * The tab's title while the page is shown, the shell's once it is left.
 *
 * /confidentialite and /conditions are also served as HTML with their own
 * <title> (plugins/legalPages.ts). Navigation is in-app from there on, so
 * without this the next route would keep that title.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = SHELL_TITLE;
    };
  }, [title]);
}
