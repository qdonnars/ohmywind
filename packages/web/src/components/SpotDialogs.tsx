// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Spot } from "../types";

/**
 * The two modals a press on the spot map opens.
 *
 * `SpotEditDialog` follows a long press on a spot the user saved: rename, or
 * delete. `SpotNameDialog` follows a press on open water (create) and the
 * rename branch of the first (edit), which is why one component covers both:
 * the surface is identical down to the button, only the wording changes.
 *
 * Lifted out of `SpotMap` with their state left behind: the map owns what is
 * pending, these only render it. That is also how their copy finally got
 * translated, the markup having sat in English inside a 940-line component.
 */

/** What the name dialog is editing: a point on the water, plus the spot it
    replaces when the user came in through "Renommer". */
export interface PendingSpot {
  lat: number;
  lng: number;
  name: string;
  editingSpot?: Spot;
}

function DialogShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-[1000] bg-black/50 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-label={label}
    >
      <div className="ow-modal-surface backdrop-blur rounded-xl p-5 mx-4 w-full max-w-xs animate-modal-in">
        {children}
      </div>
    </div>
  );
}

export function SpotEditDialog({
  spot,
  onRename,
  onDelete,
  onCancel,
}: {
  spot: Spot;
  onRename: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogShell label="Options du spot">
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--ow-fg-0)" }}>
        {spot.name}
      </p>
      <p className="text-xs mb-4" style={{ color: "var(--ow-fg-1)" }}>
        {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
      </p>
      <div className="flex flex-col gap-2">
        <button
          className="ow-modal-btn w-full min-h-[44px] py-2.5 rounded-lg text-sm font-medium transition-all"
          onClick={onRename}
        >
          Renommer
        </button>
        <button
          className="w-full min-h-[44px] py-2.5 rounded-lg bg-red-700/80 text-white text-sm font-medium hover:bg-red-600 active:bg-red-500 active:scale-[0.98] transition-all"
          onClick={onDelete}
        >
          Supprimer
        </button>
        <button
          className="ow-modal-btn-outline w-full min-h-[44px] py-2.5 rounded-lg text-sm transition-all"
          onClick={onCancel}
        >
          Annuler
        </button>
      </div>
    </DialogShell>
  );
}

export function SpotNameDialog({
  pending,
  onNameChange,
  onConfirm,
  onCancel,
}: {
  pending: PendingSpot;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const renaming = pending.editingSpot != null;
  const title = renaming ? "Renommer le spot" : "Nouveau spot";
  return (
    <DialogShell label={title}>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--ow-fg-0)" }}>
        {title}
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--ow-fg-1)" }}>
        {pending.lat.toFixed(4)}, {pending.lng.toFixed(4)}
      </p>
      <input
        className="ow-modal-input w-full text-sm rounded-lg px-3 py-2.5 mb-4 transition-colors"
        value={pending.name}
        onChange={(e) => onNameChange(e.target.value)}
        autoFocus
        aria-label="Nom du spot"
      />
      <div className="flex gap-2">
        <button
          className="ow-modal-btn-outline flex-1 min-h-[44px] py-2.5 rounded-lg text-sm font-medium transition-all"
          onClick={onCancel}
        >
          Annuler
        </button>
        <button
          className="flex-1 min-h-[44px] py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 active:scale-[0.98] transition-all"
          onClick={onConfirm}
        >
          {renaming ? "Renommer" : "Créer"}
        </button>
      </div>
    </DialogShell>
  );
}
