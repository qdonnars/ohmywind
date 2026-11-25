// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { SEARCH_INPUT_ID, SEARCH_TRIGGER_ID } from "../components/SpotSearch";

/** Class that lights the field up, see `.search-spotlight` in index.css. */
export const SEARCH_SPOTLIGHT_CLASS = "search-spotlight";

/**
 * Hands the reader to the search floating over the map: on /comparer a
 * picked result becomes a favourite, which is how a spot gets added there.
 *
 * Below lg the field over the map is only a way in, and the search opens
 * over the whole screen (`SpotSearch` `fullscreen`): pressing it is the
 * hand-over, the field and the reader's spots come with it.
 *
 * From lg up the field is a real one, and focus alone was not enough.
 * « Ajouter un spot » sits in the spots list, the field at the top of the
 * screen, and without a keyboard sliding up the only change was a thin
 * focus ring nobody was looking at: the button read as doing nothing
 * (#395). The field is lit up for a moment too, and its text selected, so
 * whatever is typed replaces the last place picked.
 */
export function focusSearch(): void {
  const input = document.getElementById(SEARCH_INPUT_ID);
  if (!(input instanceof HTMLInputElement)) {
    document.getElementById(SEARCH_TRIGGER_ID)?.click();
    return;
  }
  input.focus();
  input.select();
  // Off, a reflow, on again: a second press restarts the halo instead of
  // landing on a class that is already there.
  input.classList.remove(SEARCH_SPOTLIGHT_CLASS);
  void input.offsetWidth;
  input.classList.add(SEARCH_SPOTLIGHT_CLASS);
  input.addEventListener("animationend", () => input.classList.remove(SEARCH_SPOTLIGHT_CLASS), {
    once: true,
  });
}
