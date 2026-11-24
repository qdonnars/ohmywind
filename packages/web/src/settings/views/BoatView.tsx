// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { BoatEditor } from "../../components/BoatEditor";

/**
 * « Bateau ». For now the "Bateau" tab of /config as it is; its own design
 * (grouped rows, « Mon bateau › » and « Avancé › » as views of their own)
 * replaces this file's content in a later lot.
 */
export function BoatView() {
  return (
    <div className="ow-settings-legacy">
      <BoatEditor />
    </div>
  );
}
