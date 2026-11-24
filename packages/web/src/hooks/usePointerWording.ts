// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LG_MEDIA_QUERY, useMediaQuery } from "./useMediaQuery";

/** Which verb a text about the map takes: « touchez » or « cliquez ». */
export type PointerWording = "touch" | "click";

/**
 * The wording that matches how the reader points at the map: the primary
 * pointer first, not the width, since an iPad in landscape gets the wide
 * layout and a narrow desktop window the phone one. The width decides only
 * when the device reports neither kind of pointer.
 */
export function usePointerWording(): PointerWording {
  const coarse = useMediaQuery("(pointer: coarse)");
  const fine = useMediaQuery("(pointer: fine)");
  const wide = useMediaQuery(LG_MEDIA_QUERY);
  if (coarse) return "touch";
  if (fine) return "click";
  return wide ? "click" : "touch";
}
