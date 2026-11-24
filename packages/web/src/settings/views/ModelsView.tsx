// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { ModelOrderEditor } from "../../components/ModelOrderEditor";

/**
 * « Modèles météo ». For now the "Modèles météo" tab of /config as it is;
 * its own design (grouped list, the cut between shown and ignored, toast)
 * replaces this file's content in the next lot.
 */
export function ModelsView() {
  return (
    <div className="ow-settings-legacy">
      <ModelOrderEditor />
    </div>
  );
}
