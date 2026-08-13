import { useState } from "react";
import type { Spot } from "../types";
import { migrateLegacyKey } from "../utils/localStorageMigration";

export const STORAGE_KEY = "ohmywind_custom_spots";
const LEGACY_STORAGE_KEY = "openwind_custom_spots";

function loadSpots(): Spot[] {
  migrateLegacyKey(LEGACY_STORAGE_KEY, STORAGE_KEY);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSpots(spots: Spot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
}

export function useCustomSpots() {
  const [customSpots, setCustomSpots] = useState<Spot[]>(loadSpots);

  function addSpot(spot: Spot) {
    const exists = customSpots.some(
      (s) => s.latitude === spot.latitude && s.longitude === spot.longitude
    );
    if (exists) return;
    const next = [...customSpots, spot];
    setCustomSpots(next);
    saveSpots(next);
  }

  function renameSpot(spot: Spot, name: string) {
    const next = customSpots.map((s) =>
      s.latitude === spot.latitude && s.longitude === spot.longitude
        ? { ...s, name }
        : s
    );
    setCustomSpots(next);
    saveSpots(next);
  }

  function removeSpot(spot: Spot) {
    const next = customSpots.filter(
      (s) => s.latitude !== spot.latitude || s.longitude !== spot.longitude
    );
    setCustomSpots(next);
    saveSpots(next);
  }

  function isCustom(spot: Spot) {
    return customSpots.some(
      (s) => s.latitude === spot.latitude && s.longitude === spot.longitude
    );
  }

  return { customSpots, addSpot, removeSpot, renameSpot, isCustom };
}
