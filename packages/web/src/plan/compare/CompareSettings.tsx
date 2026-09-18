// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "../session/planContext";
import { WindowChips } from "./WindowChips";
import { DepartureSettings } from "./DeparturePanel";

/** The settings of the axis on screen, at the top of its list: the window
    as chips on the departure axis, the frozen departure on the track axis. */
export function CompareSettings() {
  const { state } = usePlan();
  return state.compareAxis === "slots" ? <WindowChips /> : <DepartureSettings placement="below" />;
}
