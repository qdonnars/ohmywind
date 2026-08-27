// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Pulled out of PlanSidebar.tsx so that file exports components only: Fast
// Refresh bails on a module that mixes components with plain functions, which
// cost a full reload on every edit of the sidebar.

// Match the single-mode slider cap: Open-Meteo forecast tops out at ~today+15;
// we keep 14 d to leave 1 d of margin for clock skew / TZ crossings.
const SWEEP_HORIZON_DAYS = 14;
// Backend safety cap: 14 d × 24 h = 336 windows. Mirror it here so we can
// surface a friendly hint before sending an oversize request.
const MAX_SWEEP_WINDOWS = 336;

export interface SweepValidation {
  ok: boolean;
  message?: string;
}

export function validateSweep(earliest: string, latest: string, intervalHours: number): SweepValidation {
  if (!earliest || !latest) return { ok: false, message: "Renseignez une fenêtre de départ." };
  const e = new Date(earliest);
  const l = new Date(latest);
  if (Number.isNaN(e.getTime()) || Number.isNaN(l.getTime())) {
    return { ok: false, message: "Dates invalides." };
  }
  if (l.getTime() <= e.getTime()) {
    return { ok: false, message: "Le « plus tard » doit être après le « plus tôt »." };
  }
  const horizonMs = SWEEP_HORIZON_DAYS * 86_400_000;
  const now = new Date();
  if (l.getTime() - now.getTime() > horizonMs) {
    return {
      ok: false,
      message: `La météo n'est fiable que sur ${SWEEP_HORIZON_DAYS} jours. Choisissez une date plus tôt.`,
    };
  }
  const windows = Math.floor((l.getTime() - e.getTime()) / 3_600_000 / intervalHours) + 1;
  if (windows > MAX_SWEEP_WINDOWS) {
    return {
      ok: false,
      message: `Trop de créneaux à comparer (${windows}). Réduisez la fenêtre ou augmentez le pas.`,
    };
  }
  return { ok: true };
}
