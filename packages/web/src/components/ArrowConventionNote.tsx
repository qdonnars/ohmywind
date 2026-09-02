// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { MetricView } from "../types";

/**
 * Which way the arrows read, said out loud (issue #269).
 *
 * The rows do not share a convention, and nothing on screen said so. The arrow
 * always follows the movement, but the degrees follow the convention of the
 * source: a wind and a wave direction are where they come FROM, a current
 * direction is where the water sets TO. A reader comparing two numbers without
 * that key concludes the figures contradict each other.
 *
 * The note lived inside MarineTable and so covered every tab but the one the
 * app opens on. Wind is where the convention is least obvious, because the
 * arrow and the degrees disagree there too: `WindCell` rotates its glyph by
 * `direction + 180`, so it points where the wind blows while the figure says
 * where it comes from.
 */
export function ArrowConventionNote({ metric }: { metric: MetricView }) {
  const text = NOTES[metric];
  return (
    <p
      className="shrink-0 px-3 py-1.5 text-[10px] leading-snug border-t"
      style={{
        color: "var(--ow-fg-2)",
        borderColor: "var(--ow-line-2)",
        background: "var(--ow-bg-1)",
      }}
    >
      {text}
    </p>
  );
}

const NOTES: Record<MetricView, string> = {
  wind: "Les flèches suivent le déplacement du vent. Les degrés donnent la direction d'où il vient, convention TWD.",
  waves:
    "Les flèches suivent le déplacement de la houle. Les degrés donnent la direction d'où elle vient, comme le vent.",
  currents:
    "La flèche et les degrés donnent tous deux la direction vers laquelle le courant porte, à l'inverse du vent et des vagues qui se lisent d'où ils viennent.",
  tides: "Hauteurs d'eau au-dessus du niveau de référence indiqué.",
};
