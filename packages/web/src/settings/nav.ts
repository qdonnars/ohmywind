// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { createContext, useContext } from "react";
import type { SettingsViewId } from "./registry";

/**
 * Moving through the settings' stack of views, for the views themselves.
 *
 * - `push(id)`: opens a view over the current one; its header then offers
 *   « ‹ <current title> » to come back.
 * - `back()`: returns to the view under this one (a choice made in « Mon
 *   bateau » going back to « Bateau », say). At the root it closes.
 * - `close()`: closes the settings, from any depth.
 */
export interface SettingsNav {
  push: (id: SettingsViewId) => void;
  back: () => void;
  close: () => void;
}

export const SettingsNavCtx = createContext<SettingsNav>({
  push: () => {},
  back: () => {},
  close: () => {},
});

export function useSettingsNav(): SettingsNav {
  return useContext(SettingsNavCtx);
}
