// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useRef, type KeyboardEvent } from "react";
import { saveBoatEdit, withBase } from "../../config/boatEdits";
import { ARCHETYPE_LABELS, BASE_POLARS } from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { useT } from "../../i18n";
import { useSettingsNav } from "../nav";
import { SettingsNote } from "../parts";
import "./boat.css";

/**
 * « Mon bateau »: the boat types the app ships, each with the boats it
 * stands for, as its polar file lists them (`data/polars/*.json`). Picking
 * one stores it and goes back to « Bateau ».
 *
 * A radio group whose choice also closes the view: the arrow keys move the
 * focus between the boats without choosing, Enter, Space or a tap chooses.
 * Choosing with the arrows, as a plain radio group does, would leave the
 * view at the first key press.
 */
export function BoatTypeView() {
  const { t } = useT();
  const nav = useSettingsNav();
  const cfg = usePolarConfig();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const ids = Object.keys(ARCHETYPE_LABELS);

  const pick = (base: string) => {
    const next = withBase(cfg, base);
    if (next) saveBoatEdit(next);
    nav.back();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    refs.current[(index + step + ids.length) % ids.length]?.focus();
  };

  const label = t("config.boat.essentials.myBoat");
  return (
    <>
      <div role="radiogroup" aria-label={label} className="ow-settings-group">
        {ids.map((id, i) => {
          const checked = id === cfg.base;
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="ow-settings-row ow-boat-type"
              onClick={() => pick(id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="ow-settings-row-text">
                <span className="block">{ARCHETYPE_LABELS[id]}</span>
                <span className="ow-settings-row-sub">{BASE_POLARS[id].examples.join(", ")}</span>
              </span>
              {checked && (
                <svg className="ow-settings-check" width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1.5 7 6 11.5 15.5 1.5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <SettingsNote>{t("settings.boat.types.note")}</SettingsNote>
    </>
  );
}
