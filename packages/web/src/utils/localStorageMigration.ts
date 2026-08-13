// One-shot migration of a legacy localStorage key to its renamed successor.
// Runs at most once per key pair: if the new key is already present, the old
// value is never copied over it, so a returning user's fresher data always
// wins. Safe to call on every load — it is a no-op once migrated.
export function migrateLegacyKey(legacyKey: string, newKey: string): void {
  try {
    if (localStorage.getItem(newKey) !== null) return;
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue === null) return;
    localStorage.setItem(newKey, legacyValue);
    localStorage.removeItem(legacyKey);
  } catch {
    /* localStorage blocked (private browsing, quota) — no-op */
  }
}
