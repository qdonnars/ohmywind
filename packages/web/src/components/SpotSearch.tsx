import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Spot } from "../types";
import { searchPlaces } from "../api/geocoding";
import type { PlaceResult } from "../api/places";
import { matchSavedSpots, formatDistance, normalizeForMatch } from "../api/places";
import { parseCoordinates, formatCoordinates } from "../api/coordinates";

interface SpotSearchProps {
  onSelect: (spot: Spot) => void;
  /** Reference point for the proximity bias, as primitives so a caller
      cannot retrigger the search by rebuilding an object every render. */
  nearLat?: number | null;
  nearLon?: number | null;
  /** Searched locally, before anything leaves the browser. */
  savedSpots?: Spot[];
}

/** Below this a query matches half the coastline and mostly returns noise
    (Photon happily answers "br" with a place literally named "br"). */
const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;
/** Bounded on purpose: an unbounded cache on a long session is a slow leak
    for no benefit, since only the recent queries are ever revisited. */
const CACHE_MAX = 40;

const searchCache = new Map<string, PlaceResult[]>();
/** Shared empty array: a fresh literal each render would defeat memoization. */
const NO_RESULTS: PlaceResult[] = [];

function cachePut(key: string, results: PlaceResult[]) {
  if (searchCache.size >= CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, results);
}

export function SpotSearch({ onSelect, nearLat, nearLon, savedSpots = [] }: SpotSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const near = useMemo(
    () => (nearLat != null && nearLon != null ? { lat: nearLat, lon: nearLon } : null),
    [nearLat, nearLon],
  );
  const cacheKey = useMemo(
    () =>
      `${normalizeForMatch(trimmed)}|${near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : ""}`,
    [trimmed, near],
  );

  // Remote state is keyed by the query it belongs to, so a late response for
  // an abandoned query can never be rendered as the answer to the current one.
  const [remote, setRemote] = useState<{
    key: string;
    status: "loading" | "done" | "error";
    results: PlaceResult[];
  } | null>(null);

  const cached = trimmed.length >= MIN_CHARS ? searchCache.get(cacheKey) : undefined;
  const current = remote?.key === cacheKey ? remote : null;
  // Memoized so the rows list below is not rebuilt on every unrelated render.
  const remoteResults = useMemo(
    () => cached ?? (current?.status === "done" ? current.results : NO_RESULTS),
    [cached, current],
  );
  const loading = !cached && current?.status === "loading";
  const failed = !cached && current?.status === "error";

  useEffect(() => {
    if (trimmed.length < MIN_CHARS) return;
    if (searchCache.has(cacheKey)) return;
    const controller = new AbortController();
    // Every state write happens inside the timer or a promise callback, never
    // synchronously in the effect body.
    const timer = setTimeout(() => {
      setRemote({ key: cacheKey, status: "loading", results: [] });
      searchPlaces(trimmed, { near, signal: controller.signal })
        .then((results) => {
          cachePut(cacheKey, results);
          setRemote({ key: cacheKey, status: "done", results });
        })
        .catch(() => {
          // An aborted request means the user kept typing; the newer query
          // owns the display now.
          if (controller.signal.aborted) return;
          setRemote({ key: cacheKey, status: "error", results: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, cacheKey, near]);

  const coordinates = useMemo(() => parseCoordinates(trimmed), [trimmed]);
  const savedMatches = useMemo(
    () => matchSavedSpots(savedSpots, trimmed, near),
    [savedSpots, trimmed, near],
  );

  const rows = useMemo<PlaceResult[]>(() => {
    const out: PlaceResult[] = [];
    if (coordinates) {
      out.push({
        id: "coords",
        name: formatCoordinates(coordinates.lat, coordinates.lon),
        latitude: coordinates.lat,
        longitude: coordinates.lon,
        context: "Aller à cette position",
        source: "coordinates",
      });
    }
    out.push(...savedMatches);
    // A saved spot already shown must not come back as a geocoder row.
    const seen = new Set(savedMatches.map((s) => normalizeForMatch(s.name)));
    out.push(...remoteResults.filter((r) => !seen.has(normalizeForMatch(r.name))));
    return out;
  }, [coordinates, savedMatches, remoteResults]);

  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      const dropdown = document.getElementById("ow-search-dropdown-portal");
      if (dropdown?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
    setOpen(value.trim().length >= MIN_CHARS || parseCoordinates(value.trim()) != null);
  }

  const handleSelect = useCallback(
    (r: PlaceResult) => {
      onSelect({ name: r.name, latitude: r.latitude, longitude: r.longitude });
      setQuery(r.name);
      setOpen(false);
    },
    [onSelect],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) handleSelect(row);
    }
  }

  const listboxId = "ow-search-listbox";
  const showDropdown = open && pos !== null;

  return (
    <div ref={containerRef} className="relative w-full max-w-md lg:max-w-lg">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ow-fg-2)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && rows[activeIndex] ? `ow-opt-${rows[activeIndex].id}` : undefined}
          aria-label="Rechercher un lieu"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (rows.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Port, cap, chenal ou coordonnées"
          className="ow-search-input w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-xl text-sm transition-all"
        />
      </div>
      {showDropdown && createPortal(
        <ul
          id="ow-search-dropdown-portal"
          role="listbox"
          aria-label="Résultats de recherche"
          className="ow-search-dropdown rounded-xl overflow-hidden animate-fade-in"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 1000 }}
        >
          {rows.map((r, idx) => {
            const distance = formatDistance(r.distanceNm);
            return (
              <li
                key={r.id}
                id={`ow-opt-${r.id}`}
                role="option"
                aria-selected={idx === activeIndex}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setActiveIndex(idx)}
                className="ow-search-item px-3 py-2.5 min-h-[44px] flex items-center gap-2 cursor-pointer text-sm transition-colors"
                style={idx === activeIndex ? { background: "var(--ow-accent-line)" } : undefined}
              >
                {r.source === "saved" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--ow-accent)', flexShrink: 0 }} aria-hidden="true">
                    <path d="M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z" />
                  </svg>
                )}
                {/* Two lines rather than one: on a phone the single row left
                    the name as "Br..." while the distance kept its full
                    width. The name owns the first line outright, the region
                    and the distance share the second, and min-w-0 is what
                    actually lets truncate work inside a flex child. */}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" style={{ color: 'var(--ow-fg-0)' }}>{r.name}</div>
                  {(r.context || distance) && (
                    <div className="flex items-baseline gap-1.5 text-xs" style={{ color: 'var(--ow-fg-2)' }}>
                      {r.context && <span className="truncate">{r.context}</span>}
                      {r.context && distance && <span className="shrink-0">·</span>}
                      {distance && <span className="shrink-0">{distance}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="px-3 py-2.5 text-sm" style={{ color: 'var(--ow-fg-2)' }} role="presentation">
              {loading
                ? "Recherche..."
                : failed
                  ? "Recherche indisponible. Vérifiez votre connexion."
                  : "Aucun lieu trouvé."}
            </li>
          )}
        </ul>,
        document.body
      )}
    </div>
  );
}
