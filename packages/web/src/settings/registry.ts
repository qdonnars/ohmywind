// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ComponentType } from "react";
import type { Key } from "../i18n";
import { BoatAdvancedView } from "./views/BoatAdvancedView";
import { BoatTypeView } from "./views/BoatTypeView";
import { BoatView } from "./views/BoatView";
import { LanguageView } from "./views/LanguageView";
import { ModelsView } from "./views/ModelsView";
import { RootView } from "./views/RootView";

export interface SettingsViewDef {
  /** The view's title, centred in the header, and the « ‹ » label of the
      views opened over it. */
  title: Key;
  /** The view's content. It scrolls inside the settings' own body, which
      starts at the top every time the view is shown. */
  Component: ComponentType;
}

/**
 * Every view the settings can show, by id. A view is a file of its own under
 * `views/`; adding one, or swapping the component of one, is one line here.
 * The ids are what `useSettingsNav().push()` takes, checked by the compiler.
 */
export const SETTINGS_VIEWS = {
  root: { title: "common.nav.settings", Component: RootView },
  language: { title: "config.lang.label", Component: LanguageView },
  models: { title: "config.models.title", Component: ModelsView },
  boat: { title: "config.boat.title", Component: BoatView },
  boatType: { title: "config.boat.essentials.myBoat", Component: BoatTypeView },
  boatAdvanced: { title: "config.boat.advanced.title", Component: BoatAdvancedView },
} satisfies Record<string, SettingsViewDef>;

export type SettingsViewId = keyof typeof SETTINGS_VIEWS;
