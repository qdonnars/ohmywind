# Visual cahier des charges — what to shoot, not generated

I do not generate images. This file describes precisely what's missing,
what to capture, and the message each image should carry. Each block is
named after the filename it should land at in `docs/screenshots/`.

---

## 1. `plan.png` — refresh (REPLACE EXISTING)

**Why:** Current [`docs/screenshots/plan.png`](../docs/screenshots/plan.png)
is the hero image on three surfaces (root README, HF Space card, HF Space
landing). It predates PRs #57 (departure slider), #64 (Simuler/Comparer
toggle), and the current `/plan` header layout — see
[`MARKETING_AUDIT.md` § 5.2](MARKETING_AUDIT.md#52-freshness-check-on-planpng).

**Where to capture:**
[`packages/web/src/routes/PlanPage.tsx`](../packages/web/src/routes/PlanPage.tsx),
desktop viewport (1280×800 or 1440×900).

**What must be visible:**

- The current header: SpotSearch input centered, CopyLinkButton (🔗) and
  ThemeToggle on the right. No "Explore | Plan" tabs (those are gone).
- The compass-icon FAB top-left of the map (route-back affordance to
  `/`).
- The complete sidebar:
  - **Departure** with the 3-week slider visible (not the manual input
    fallback).
  - **Archetype dropdown** (showing one selected, e.g. `cruiser_30ft`
    with its English label like "Cruiser 30 ft" — confirm in
    [`PlanSidebar.tsx`](../packages/web/src/plan/PlanSidebar.tsx)).
  - **Mode toggle** Simuler / Comparer with "Simuler" active.
  - Distance / Durée / ETA / Complexité numbers.
  - Per-leg table (Heure / Allure / Vent / Vitesse).
  - "Recalculer" button (NOT "Refetch" — the old label).
- The map with 4-5 waypoints traced on it, polyline color-coded by
  per-leg complexity (green → orange).
- Theme: pick **light** for hero use (matches the cream/teal palette of
  README, less harsh thumbnail on github.com).

**Concrete passage to use** (matches the README's narrative example):
- Start: Marseille (Vieux Port, ~43.295°N, 5.370°E).
- Waypoint: Cap Sicié.
- Waypoint: Grand Ribaud.
- End: Porquerolles (Port-Cros area, ~43.000°N, 6.225°E).
- Departure: tomorrow morning.
- Archetype: `cruiser_30ft` with the displayed example
  (e.g. "Sun Odyssey 32" or whatever the dropdown surfaces).

**Message:** "From Marseille to Porquerolles, on a Sun Odyssey 32, ETA
21:24, complexity 3/5 — full per-leg breakdown."

**Format:** PNG, viewport-trimmed (no browser chrome). 16:9 if possible.
Keep file < 600 KB.

---

## 2. `compare-windows.png` — NEW

**Why:** The compare-windows / sweep mode is the largest UX feature
shipped in 2026 Q1 (PRs #58 → #69) and currently has zero visual
representation. See
[`MARKETING_AUDIT.md` § 8 action 3](MARKETING_AUDIT.md#3-promote-compare-windows--sweep-mode-as-a-first-class-feature).

**Where:** Same `/plan` view, but with the mode toggle set to **Comparer
les fenêtres** and a sweep already executed.

**What must be visible:**
- Sidebar: mode toggle on **Comparer**, sweep form filled (earliest +
  latest range, e.g. "Sat 10:00 → Mon 18:00", interval = 3 h), and the
  WindowsTable rendered below ([`WindowsTable.tsx`](../packages/web/src/plan/WindowsTable.tsx)).
- Map: stays as the same polyline; the sweep is over time, not over
  geometry.
- The WindowsTable showing ~10-12 candidate departures with sortable
  columns: Départ / Durée / ⚡ (complexity).
- One row visibly the "best" pick (lowest complexity), perhaps hovered.

**Concrete scenario:** Same route as `plan.png` (Marseille →
Porquerolles), departures sweep "next Saturday 06:00" → "next Monday
18:00", interval 3 h. That gives ~17 windows; user wants the calmest
weekend slot.

**Message:** "Compare every 3-hour departure across the weekend, sort by
complexity, pick the calmest window."

**Format:** Same as `plan.png`. Crop tighter on the sidebar if needed
since the map content is repetitive with `plan.png`.

---

## 3. `mobile-plan.png` — NEW

**Why:** PRs #44, #45, #61, #68 invested significantly in the mobile
layout (hero stats overlay, compact drawer, FAB sizing). No public
surface shows the mobile experience.

**Where:** `/plan` route, viewport 390×844 (iPhone 14) or 414×896.

**What must be visible:**
- The hero-stats overlay floating above the map (ETA / Durée / Dist / Cx).
- The compass FAB in the corner, big and tappable.
- The sticky compact-drawer header at the bottom showing
  "X tronçons · Y nm" + "Recalculer" button.
- One leg row visible to hint at the pattern.

**Format:** PNG, mobile aspect ratio. Used in:
- HF Space landing page as a small inset showing "works on phone".
- README, possibly side-by-side with `plan.png`.

---

## 4. `mcp-widget-in-host.png` — NEW

**Why:** The README says repeatedly that `plan_passage` returns "an
HTML widget rendered inline" — but no public surface *shows* what that
looks like in a real MCP host (Claude Desktop / Le Chat / Goose). Without
the visual, the claim is abstract.

**Where:** Capture inside Claude Desktop (or claude.ai web with the
custom connector enabled), after asking the smoke-prompt:

> "Demain matin, Marseille → Porquerolles, sur un Sun Odyssey 36. Bonne
> idée ? Combien de temps et c'est tendu comment ?"

**What must be visible:**
- Claude's speech bubble with the widget rendered inline (boat banner,
  ETA, complexity, per-leg list, "View full plan →" link to
  openwind.fr/plan).
- Just enough chat context above to make clear it's a real assistant
  conversation (the original question).

**Crop:** trim the host's chrome aggressively — aim for a clean
"floating card on neutral background" look.

**Caveat:** This visual is host-specific (Claude Desktop). Consider
shooting the same conversation in 2 hosts (Claude + Le Chat) for the
"works in any MCP client" claim.

**Format:** PNG, ~1000 px wide.

---

## 5. `viz.png` — DECIDE: reference or delete

**Why:** [`docs/screenshots/viz.png`](../docs/screenshots/viz.png) is in
the repo (untracked) but referenced by *zero* surface. Either it's the
explore-page screenshot the README never linked to (so add it), or it's a
leftover that should be removed.

**If kept:** name it `explore.png` (clearer), update
[`docs/screenshots/README.md`](../docs/screenshots/README.md) to mention
both files, and reference it from the root README as a "what the explore
page looks like" companion to `plan.png`.

**If removed:** just `git rm` it (currently it's untracked, so just
`rm`). Note it's listed in git status as untracked at session start.

---

## 6. `architecture.svg` — OPTIONAL upgrade

**Why:** [`docs/architecture.md`](../docs/architecture.md) currently uses
ASCII for the architecture diagram. ASCII is fine for technical readers
but doesn't render well on github.com mobile and is invisible on the HF
Space card.

**Suggested:** an SVG (~1000×500) showing:
- MCP client (Claude Desktop / Le Chat / Cursor / Goose) on the left.
- HTTP/MCP arrow to `qdonnars-openwind-mcp.hf.space/mcp`.
- That box decomposes into `openwind-mcp-core` and `openwind-data`.
- Outbound HTTPS arrow to Open-Meteo.
- Side branch: `openwind.fr` (web) reading from the same `/api/v1/`.

**Optional** — only worth shooting once the architecture doc itself is
refreshed (action D in
[`marketing-drafts/wording-suggestions.md`](wording-suggestions.md#d-docsarchitecturemd--stale-tool-list-factual-fix)).

---

## Notes on file management

- All visuals live in [`docs/screenshots/`](../docs/screenshots/).
- The HF Space landing references images via
  `https://raw.githubusercontent.com/qdonnars/openwind/main/docs/screenshots/...`.
  So the moment a new image is on `main`, it's live everywhere.
- Keep file sizes < 600 KB for hero images so the HF cold-start isn't
  hurt by image weight.
- Update [`docs/screenshots/README.md`](../docs/screenshots/README.md)
  when adding/replacing files. The current text mentions only `plan.png`
  and references "plan.gif (animated demo) later" — update that
  expectation if the GIF plan is dropped.
