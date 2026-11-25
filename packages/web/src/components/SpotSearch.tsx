// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Spot } from "../types";
import { searchPlaces } from "../api/geocoding";
import type { PlaceResult } from "../api/places";
import { matchSavedSpots, formatDistance, normalizeForMatch, savedSpotsAsPlaces } from "../api/places";
import { parseCoordinates, formatCoordinates } from "../api/coordinates";
import { useBackDismiss } from "../hooks/useBackDismiss";
import { useT } from "../i18n";
import { useVisibleViewport } from "../viewport/visibleViewport";

interface SpotSearchProps {
  onSelect: (spot: Spot) => void;
  /** Reference point for the proximity bias, as primitives so a caller
      cannot retrigger the search by rebuilding an object every render. */
  nearLat?: number | null;
  nearLon?: number | null;
  /** Searched locally, before anything leaves the browser. */
  savedSpots?: Spot[];
  /**
   * "header": the field of a page header. "floating": the glass field of the
   * bar over a full-screen map, as tall as the bar (`--ow-chrome-size`).
   */
  appearance?: "header" | "floating";
  /**
   * On a phone, the field over the map is only a way in: touching it opens
   * the search over the whole screen, with « Annuler », the reader's saved
   * spots before anything is typed, and the results below the field once
   * something is. A suggestion list under a 48 px field, with the keyboard
   * up, left a few rows at best.
   */
  fullscreen?: boolean;
}

/** Below this a query matches half the coastline and mostly returns noise
    (Photon happily answers "br" with a place literally named "br"). */
const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;
/** Bounded on purpose: an unbounded cache on a long session is a slow leak
    for no benefit, since only the recent queries are ever revisited. */
const CACHE_MAX = 40;

/** Ids of the two halves of the combobox. Fixed rather than derived from
    useId because the dropdown is portalled to document.body and the outside
    click handler looks it up by id; a page mounts a single SpotSearch (in
    its header, or in the bar over its map). INPUT_ID also gives the field
    the `id` that Chrome and Lighthouse ask of every form control. */
const INPUT_ID = "ow-search-input";
const LISTBOX_ID = "ow-search-dropdown-portal";
const GROUP_TITLE_ID = "ow-search-group-title";
/** Gap kept between the suggestions and the keyboard (or the screen's edge),
    and the least the list shrinks to: two rows, still worth scrolling. */
const LIST_EDGE_GAP_PX = 8;
const LIST_MIN_PX = 112;

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

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

const StarGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z" />
  </svg>
);

const PinGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z" />
    <circle cx="12" cy="11" r="2.2" />
  </svg>
);

export function SpotSearch({
  onSelect,
  nearLat,
  nearLon,
  savedSpots = [],
  appearance = "header",
  fullscreen = false,
}: SpotSearchProps) {
  const { t, lang } = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = useVisibleViewport();
  // Full-screen mode: whether the search covers the screen, and the name of
  // the place last picked, which the field over the map shows at rest.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const trimmed = query.trim();
  const near = useMemo(
    () => (nearLat != null && nearLon != null ? { lat: nearLat, lon: nearLon } : null),
    [nearLat, nearLon],
  );
  // The reference point of the geocoder is the one in force when the text
  // was typed, held with the text. Read live, it changes with every move of
  // the map (the pages hand the map's centre), and a text left in the field
  // was searched again at each pan (QA of 1.15.0, #579). The next keystroke
  // takes the new point. The saved spots, matched on the device, keep the
  // live one.
  const [queryNear, setQueryNear] = useState<{ lat: number; lon: number } | null>(null);
  // The language is part of the key: the geocoder answers in the reader's
  // language, so two languages are two different result sets.
  const cacheKey = useMemo(
    () =>
      `${lang}|${normalizeForMatch(trimmed)}|${queryNear ? `${queryNear.lat.toFixed(2)},${queryNear.lon.toFixed(2)}` : ""}`,
    [lang, trimmed, queryNear],
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
      searchPlaces(trimmed, { near: queryNear, signal: controller.signal })
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
  }, [trimmed, cacheKey, queryNear]);

  const coordinates = useMemo(() => parseCoordinates(trimmed), [trimmed]);
  const savedMatches = useMemo(
    () => matchSavedSpots(savedSpots, trimmed, near),
    [savedSpots, trimmed, near],
  );

  const results = useMemo<PlaceResult[]>(() => {
    const out: PlaceResult[] = [];
    if (coordinates) {
      out.push({
        id: "coords",
        name: formatCoordinates(coordinates.lat, coordinates.lon),
        latitude: coordinates.lat,
        longitude: coordinates.lon,
        context: t("explore.spotSearch.goToPosition"),
        source: "coordinates",
      });
    }
    out.push(...savedMatches);
    // A saved spot already shown must not come back as a geocoder row.
    const seen = new Set(savedMatches.map((s) => normalizeForMatch(s.name)));
    out.push(...remoteResults.filter((r) => !seen.has(normalizeForMatch(r.name))));
    return out;
  }, [coordinates, savedMatches, remoteResults, t]);

  // Full screen with nothing typed: the reader's own spots, the places they
  // come back to, before any search.
  const browsing = fullscreen && trimmed === "";
  const browseRows = useMemo(
    () => (browsing ? savedSpotsAsPlaces(savedSpots, near) : NO_RESULTS),
    [browsing, savedSpots, near],
  );
  const rows = browsing ? browseRows : results;

  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open || fullscreen) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, fullscreen, updatePos]);

  useEffect(() => {
    if (fullscreen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      const dropdown = document.getElementById(LISTBOX_ID);
      if (dropdown?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [fullscreen]);

  // Full screen, no row is picked out until the arrows move: the first saved
  // spot lit up at rest read as already chosen. Enter still takes the first.
  const restIndex = fullscreen ? -1 : 0;

  function handleChange(value: string) {
    setQuery(value);
    setQueryNear(near);
    setActiveIndex(restIndex);
    setOpen(value.trim().length >= MIN_CHARS || parseCoordinates(value.trim()) != null);
  }

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  // The back button closes the full-screen search rather than the page.
  useBackDismiss(sheetOpen, closeSheet);

  const handleSelect = useCallback(
    (r: PlaceResult) => {
      onSelect({ name: r.name, latitude: r.latitude, longitude: r.longitude });
      // The name of the place picked, searched from the place itself: the
      // page is about to centre on it.
      setQuery(r.name);
      setQueryNear({ lat: r.latitude, lon: r.longitude });
      setOpen(false);
      setPicked(r.name);
      setSheetOpen(false);
    },
    [onSelect],
  );

  // The list is on screen: under the field, or filling the full-screen search.
  const listShown = fullscreen ? sheetOpen && rows.length > 0 : open && pos !== null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (fullscreen) {
        e.preventDefault();
        closeSheet();
      } else {
        setOpen(false);
      }
      return;
    }
    if (!listShown || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[Math.max(activeIndex, 0)];
      if (row) handleSelect(row);
    }
  }

  const statusText = loading
    ? t("explore.spotSearch.searching")
    : failed
      ? t("explore.spotSearch.failed")
      : t("explore.spotSearch.empty");

  // The combobox itself, the same element in the header, in the bar over the
  // map and at the top of the full-screen search.
  const input = (className: string) => (
    <input
      type="text"
      id={INPUT_ID}
      name="spot-search"
      // The suggestion list is ours, rendered below. Without this, naming
      // the field lets the browser stack its own history dropdown on top
      // of it.
      autoComplete="off"
      enterKeyHint="search"
      role="combobox"
      aria-expanded={listShown}
      // Used to point at "ow-search-listbox", an id nothing carried, while
      // the list portalled into document.body is ow-search-dropdown-portal:
      // the relation was announced to assistive tech and resolved nowhere.
      aria-controls={LISTBOX_ID}
      aria-autocomplete="list"
      aria-activedescendant={listShown && rows[activeIndex] ? `ow-opt-${rows[activeIndex].id}` : undefined}
      aria-label={t("explore.spotSearch.label")}
      value={query}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={() => { if (!fullscreen && rows.length > 0) setOpen(true); }}
      onKeyDown={handleKeyDown}
      placeholder={t("explore.spotSearch.placeholder")}
      className={className}
    />
  );

  if (fullscreen) {
    return (
      <div ref={containerRef} className="relative w-full min-w-0 pointer-events-auto">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            // A new search each time: the field opens empty, on the saved
            // spots, rather than on the last place picked.
            setQuery("");
            setActiveIndex(-1);
            setSheetOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="ow-chrome-glass w-full flex items-center gap-2.5 px-4 rounded-full text-left cursor-pointer"
          style={{ height: "var(--ow-chrome-size)", color: "var(--ow-fg-2)" }}
        >
          <SearchIcon size={18} />
          {/* The label first, so the button's name holds the words on it
              (WCAG 2.5.3) and still says what it does. */}
          <span className="sr-only">{t("explore.spotSearch.label")}, </span>
          <span
            className="flex-1 min-w-0 truncate text-[15px]"
            style={{ color: picked ? "var(--ow-fg-0)" : "var(--ow-fg-2)" }}
          >
            {picked ?? t("explore.spotSearch.placeholder")}
          </span>
        </button>
        {sheetOpen && (
          <SearchSheet
            label={t("explore.spotSearch.label")}
            onClose={closeSheet}
            returnFocusTo={triggerRef}
            field={input("ow-search-input w-full h-11 pl-10 pr-11 rounded-xl text-[16px]")}
            hasQuery={query !== ""}
            onClear={() => handleChange("")}
            clearLabel={t("explore.spotSearch.clear")}
            cancelLabel={t("common.cancel")}
          >
            {rows.length > 0 && (
              <div className="mb-3.5">
                <div
                  id={GROUP_TITLE_ID}
                  className="px-1 pt-2 pb-2 text-[13px] font-semibold uppercase tracking-[0.6px]"
                  style={{ color: "var(--ow-fg-1)" }}
                >
                  {browsing ? t("explore.spotSearch.mySpots") : t("explore.spotSearch.results")}
                </div>
                <ul
                  id={LISTBOX_ID}
                  role="listbox"
                  aria-labelledby={GROUP_TITLE_ID}
                  className="rounded-[14px] overflow-hidden"
                  style={{ background: "var(--ow-bg-2)" }}
                >
                  {rows.map((r, idx) => (
                    <SheetRow
                      key={r.id}
                      row={r}
                      active={idx === activeIndex}
                      onPick={() => handleSelect(r)}
                      onHover={() => setActiveIndex(idx)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {!browsing && rows.length === 0 && (trimmed.length >= MIN_CHARS || coordinates) && (
              <p role="status" className="px-2 py-6 text-[15px] leading-normal" style={{ color: "var(--ow-fg-1)" }}>
                {statusText}
              </p>
            )}
          </SearchSheet>
        )}
      </div>
    );
  }

  const showDropdown = open && pos !== null;
  // The list stops above the keyboard and scrolls: grown to its natural
  // height, its last rows sat under the keys, out of reach (#569).
  const listMaxHeight = pos
    ? Math.max(LIST_MIN_PX, visible.top + visible.height - pos.top - LIST_EDGE_GAP_PX)
    : undefined;
  const floating = appearance === "floating";

  return (
    <div
      ref={containerRef}
      className={floating ? "relative w-full pointer-events-auto" : "relative w-full max-w-md lg:max-w-lg"}
    >
      <div className="relative">
        <span
          // Above the field: the glass of the floating field blurs its
          // backdrop, which paints it over a sibling placed before it.
          className={`absolute z-[1] top-1/2 -translate-y-1/2 pointer-events-none ${floating ? "left-[18px]" : "left-3"}`}
          style={{ color: "var(--ow-fg-2)" }}
        >
          <SearchIcon size={floating ? 18 : 16} />
        </span>
        {input(
          floating
            ? "ow-chrome-glass ow-search-floating w-full pl-12 pr-5 rounded-full text-[15px]"
            : "ow-search-input w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-xl text-sm transition-all",
        )}
      </div>
      {showDropdown && createPortal(
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label={t("explore.spotSearch.results")}
          className="ow-search-dropdown fixed rounded-xl overflow-y-auto overscroll-contain animate-fade-in"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: listMaxHeight, zIndex: 1000 }}
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
                  <span style={{ color: 'var(--ow-accent)', flexShrink: 0, width: 14, height: 14, display: "inline-flex" }}>
                    {StarGlyph}
                  </span>
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
              {statusText}
            </li>
          )}
        </ul>,
        document.body
      )}
    </div>
  );
}

/** One row of the full-screen search: a round glyph (a star for a saved
    spot, a pin for anything else), the name, and its context and distance. */
function SheetRow({
  row,
  active,
  onPick,
  onHover,
}: {
  row: PlaceResult;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  const distance = formatDistance(row.distanceNm);
  const saved = row.source === "saved";
  return (
    <li
      id={`ow-opt-${row.id}`}
      role="option"
      aria-selected={active}
      onClick={onPick}
      onMouseEnter={onHover}
      className="ow-search-item flex items-center gap-3 min-h-[56px] px-3.5 py-2 cursor-pointer"
      style={active ? { background: "var(--ow-accent-line)" } : undefined}
    >
      <span
        aria-hidden="true"
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: "var(--ow-bg-3)", color: saved ? "var(--ow-accent)" : "var(--ow-fg-1)" }}
      >
        {saved ? StarGlyph : PinGlyph}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[16px]" style={{ color: "var(--ow-fg-0)" }}>{row.name}</span>
        {(row.context || distance) && (
          <span className="flex items-baseline gap-1.5 text-[13px] mt-px" style={{ color: "var(--ow-fg-1)" }}>
            {row.context && <span className="truncate">{row.context}</span>}
            {row.context && distance && <span className="shrink-0">·</span>}
            {distance && <span className="shrink-0">{distance}</span>}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * The search over the whole screen: the field and « Annuler » at the top,
 * under the status bar, and the list below, which scrolls.
 *
 * Pinned to the part of the screen the keyboard leaves visible
 * (`.ow-visible-viewport`), so the list ends at the keys and scrolls to its
 * last row, while its background runs on behind them (#608). Rendered into `<body>`, and the page behind it made inert while
 * it is open: nothing behind it takes the focus or is read out.
 */
function SearchSheet({
  label,
  onClose,
  returnFocusTo,
  field,
  hasQuery,
  onClear,
  clearLabel,
  cancelLabel,
  children,
}: {
  label: string;
  onClose: () => void;
  /** The field over the map, given the focus back on closing: a click does
      not focus a button in Safari, so the one focused on opening may be
      none. */
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
  field: React.ReactNode;
  hasQuery: boolean;
  onClear: () => void;
  clearLabel: string;
  cancelLabel: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const opener = returnFocusTo;
    return () => {
      root?.removeAttribute("inert");
      opener.current?.focus();
    };
  }, [returnFocusTo]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
      // Over the page and the invitation to install (1100), like the
      // navigation drawer; under the settings (1200).
      className="ow-search-sheet ow-visible-viewport fixed inset-x-0 z-[1150] flex flex-col"
    >
      <div className="ow-search-sheet-head shrink-0 flex items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ow-fg-2)" }}>
            <SearchIcon size={18} />
          </span>
          {field}
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                onClear();
                panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
              }}
              aria-label={clearLabel}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center cursor-pointer"
              style={{ color: "var(--ow-fg-2)" }}
            >
              <span
                aria-hidden="true"
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                style={{ background: "var(--ow-line-2)", color: "var(--ow-fg-0)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 h-11 px-1.5 text-[16px] font-medium cursor-pointer"
          style={{ color: "var(--ow-accent)" }}
        >
          {cancelLabel}
        </button>
      </div>
      {/* `relative`: a scroll container is the containing block of what is
          positioned inside it (tests/scrollContainers.test.ts). */}
      <div className="ow-search-sheet-body relative flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
    </div>,
    document.body,
  );
}
