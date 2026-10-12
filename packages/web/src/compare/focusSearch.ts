// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** Class that lights the field up, see `.search-spotlight` in index.css. */
export const SEARCH_SPOTLIGHT_CLASS = "search-spotlight";

/**
 * Hands the reader to the header's search field: on /comparer a picked
 * result becomes a favourite, which is how a spot gets added there.
 *
 * Focus alone was not enough. « Ajouter un spot » sits in the spots list,
 * the field at the top of the screen, and without a keyboard sliding
 * up (a desktop, a phone emulated in a browser) the only change was a thin
 * focus ring nobody was looking at: the button read as doing nothing
 * (#395). The field is lit up for a moment too, and its text selected, so
 * whatever is typed replaces the last place picked.
 */
export function focusSearch(): void {
  const input = document.querySelector<HTMLInputElement>('header input[role="combobox"]');
  if (!input) return;
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
