// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The product version from package.json, set by `define` in vite.config.ts.
    Read it through `APP_VERSION` in src/utils/version.ts. */
declare const __APP_VERSION__: string;
