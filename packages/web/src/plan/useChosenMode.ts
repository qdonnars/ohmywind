import { useEffect, useState } from "react";

const KEY = "openwind:plan:hasChosenMode";

// Tracks whether the user has explicitly picked a mode at least once
// (Simuler / Comparer). Used to show the mode-picker cards on first visit
// only — once a choice has been made, the regular form takes over.

export function useHasChosenMode(): [boolean, () => void] {
  const [chosen, setChosen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!chosen) return;
    try {
      window.localStorage.setItem(KEY, "true");
    } catch {
      // ignore (private mode, full storage)
    }
  }, [chosen]);

  return [chosen, () => setChosen(true)];
}
