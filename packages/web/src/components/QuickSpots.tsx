// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Spot } from "../types";
import { QUICK_SPOTS } from "../spots";

interface QuickSpotsProps {
  current: Spot | null;
  customSpots: Spot[];
  onSelect: (spot: Spot) => void;
  onSave: (spot: Spot) => void;
  onRemove: (spot: Spot) => void;
  isCustom: (spot: Spot) => boolean;
  isBuiltIn: (spot: Spot) => boolean;
}

export function QuickSpots({
  current,
  customSpots,
  onSelect,
  onSave,
  onRemove,
  isCustom,
  isBuiltIn,
}: QuickSpotsProps) {
  const allSpots = [...QUICK_SPOTS, ...customSpots];
  const canSave =
    current && !isBuiltIn(current) && !isCustom(current);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allSpots.map((spot) => {
        const isActive =
          current?.latitude === spot.latitude &&
          current?.longitude === spot.longitude;
        const custom = isCustom(spot);
        return (
          <div key={`${spot.latitude},${spot.longitude}`} className="flex items-center">
            <button
              onClick={() => onSelect(spot)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                custom ? "rounded-l-full" : "rounded-full"
              } ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {spot.name}
            </button>
            {custom && (
              <button
                onClick={() => onRemove(spot)}
                className={`px-1.5 py-1.5 text-xs rounded-r-full transition-colors ${
                  isActive
                    ? "bg-blue-700 text-blue-200 hover:bg-red-600 hover:text-white"
                    : "bg-gray-800 text-gray-500 hover:bg-red-600 hover:text-white"
                }`}
                title="Supprimer"
              >
                x
              </button>
            )}
          </div>
        );
      })}
      {canSave && (
        <button
          onClick={() => onSave(current)}
          className="px-3 py-1.5 rounded-full text-sm bg-gray-800 text-green-400 hover:bg-green-800 hover:text-green-200 transition-colors border border-dashed border-gray-600"
        >
          + Sauvegarder {current.name}
        </button>
      )}
    </div>
  );
}
