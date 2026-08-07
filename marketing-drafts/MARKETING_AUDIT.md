# OpenWind — Marketing audit

**Original audit date:** 2026-04-29 against `c8c34f0`.
**Last updated:** 2026-04-30 against `a9e2bd6` on `docs/marketing-audit-sync`.
**Scope:** every public surface (root README, HF Space card, HF Space landing
HTML, web app, `docs/`) compared against the live source of truth (MCP tool
signatures, recent merged PRs).

> ## ⚠️ Post-audit update — PR #74 (MCP Apps support) reset half the action plan
>
> Between the original audit and this update, [PR #74](https://github.com/qdonnars/openwind/commit/81ddfc8)
> "MCP Apps support — iframe openwind.fr instead of inline HTML widget" landed
> on `main`, plus follow-up `a9e2bd6` "UI widget receives result via
> postMessage + tool-routing guidance". This invalidated chunks of the
> original copy:
>
> - `plan_passage` no longer returns an `html` field. It declares
>   `_meta.ui.resourceUri = ui://openwind/plan-passage` so MCP-Apps-aware
>   hosts (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman,
>   MCPJam) auto-render the live `openwind.fr/plan` view in a sandboxed
>   iframe. Hosts without MCP Apps support (Cursor, Le Chat, terminal) fall
>   back to a text summary + the `openwind_url` deep-link.
> - The "renders an inline preview card" / "ready-to-display HTML widget"
>   wording on the HF Space landing and the HF Space card was therefore
>   wrong post-#74 and has been updated everywhere to the host-aware framing.
> - Le Chat is now in the **fallback** bucket, not the rich-render bucket
>   (no MCP Apps support yet). The HF Space landing's Le Chat connector flow
>   now calls this out explicitly.
>
> **What was applied** (sections of the original audit that have been
> implemented as of `a9e2bd6` + the staged commit on this branch): all three
> factual fixes from § 0 (HF Space card tool table, HF Space landing tool
> count, `_METHODOLOGY` ECMWF) plus the auto-fallback chain everywhere, the
> dead-link removal, the Compare-windows / sweep / multi-window naming
> unification, the Window-aware "Why OpenWind" row, the host-aware copy in
> Try-it-in-30-seconds, the Mistral "Intelligence → Connecteurs" tutorial
> step the user flagged, and the hero `plan.png` refresh.
>
> **What's still pending** (call from the maintainer): the `mcp.openwind.fr`
> link-text vs `qdonnars-openwind-mcp.hf.space` href question
> ([`README.md:10`](README.md#L10) — see § I.3 in
> [`marketing-drafts/wording-suggestions.md`](marketing-drafts/wording-suggestions.md)),
> the `openwind.fr/` value-prop banner (§ H), and the new screenshots
> proposed in [`marketing-drafts/visuals-brief.md`](marketing-drafts/visuals-brief.md)
> (compare-windows, mobile, MCP-widget-in-host).
>
> The original audit text below is preserved as a historical snapshot — some
> action items are now closed; verify against current `main` if you re-read.

This report only **observes**. No file outside `MARKETING_AUDIT.md` and
`marketing-drafts/` was modified. Reword proposals live in
[`marketing-drafts/wording-suggestions.md`](marketing-drafts/wording-suggestions.md);
visual cahier des charges in
[`marketing-drafts/visuals-brief.md`](marketing-drafts/visuals-brief.md).

---

## 0. TL;DR

Two factual mismatches between "what we say" and "what the server does" need
fixing before any new traffic push:

1. **HF Space card** ([`packages/hf-space/README.md`](packages/hf-space/README.md))
   advertises **5 tools** including `estimate_passage` and `score_complexity`
   — those were merged into `plan_passage` in PR #58 (Mar 2026). It also
   describes `read_me` as "an HTML widget", which is wrong — `read_me` returns
   the calculation methodology as Markdown.
2. **HF Space landing HTML** ([`packages/hf-space/app.py:220-224`](packages/hf-space/app.py#L220-L224))
   says "Three tools" — undercounts: the server exposes **4** (it omits
   `read_me`).

A third one is internal but visible to anyone reading the docs:
[`docs/architecture.md`](docs/architecture.md) still describes the old
`estimate_passage` + `score_complexity` split (lines 23-24, 53, 57, 97).

A fourth one is a broken link in the HF Space card: it points to
`github.com/qdonnars/openwind/blob/main/plan/04-backlog.md`, but `plan/` is
gitignored ([`.gitignore:25`](.gitignore#L25)) and not on the remote.

The recently shipped **compare-windows / sweep mode** (PRs #58, #65, #66, #69
— a major UX feature) is virtually invisible on the public surfaces: the root
README mentions it in one sentence inside the tools table; the HF Space card
and HF landing don't mention it at all.

The hero screenshot [`docs/screenshots/plan.png`](docs/screenshots/plan.png) is
visually older than the current `/plan` UI — it shows tabs, button labels, and
a boat-card format that no longer exist in the React code.

Top 5 priority actions in [§ 6](#6-top-5-priority-actions).

---

## 1. Source of truth — what the product really does today

### 1.1 MCP tools actually exposed

From [`packages/mcp-core/src/openwind_mcp_core/server.py`](packages/mcp-core/src/openwind_mcp_core/server.py)
(`build_server()`):

| # | Tool | Signature highlights | Source |
|---|---|---|---|
| 1 | `read_me` | Returns Markdown methodology (polars, efficiency, VMG, derate, sweep, Med defaults). | [`server.py:175-188`](packages/mcp-core/src/openwind_mcp_core/server.py#L175-L188) |
| 2 | `list_boat_archetypes` | 5 archetypes with metadata; LLM does the mapping. | [`server.py:190-197`](packages/mcp-core/src/openwind_mcp_core/server.py#L190-L197) |
| 3 | `get_marine_forecast` | Wind + sea, multi-model, point/window. | [`server.py:199-248`](packages/mcp-core/src/openwind_mcp_core/server.py#L199-L248) |
| 4 | `plan_passage` | One call: timing + complexity + HTML widget + deep-link. **Includes sweep mode** when `latest_departure` is set. | [`server.py:250-431`](packages/mcp-core/src/openwind_mcp_core/server.py#L250-L431) |

Total: **4 tools.** `estimate_passage` and `score_complexity` no longer exist
as MCP tools (commit `b2fbe23`, PR #58).

### 1.2 Auto-fallback model chain

From [`packages/data-adapters/src/openwind_data/adapters/openmeteo.py`](packages/data-adapters/src/openwind_data/adapters/openmeteo.py)
`AUTO_FALLBACK_CHAIN`:

```
AROME 1.3km → ICON-EU 7km → ECMWF IFS 25km → GFS 25km
```

**ECMWF was added in PR #63 (commit `fda0b92`).** All public-facing copies of
the fallback chain still say "AROME → ICON-EU → GFS" (3 models, missing
ECMWF):

- [`README.md:46`](README.md#L46), [`README.md:136`](README.md#L136)
- [`README.md:309-310`](README.md#L309-L310) (in the `plan_passage` paragraph
  is in the docstring already, but README mirrors it)
- [`packages/mcp-core/README.md:106`](packages/mcp-core/README.md#L106)
- [`packages/hf-space/README.md:51`](packages/hf-space/README.md#L51)
- [`packages/mcp-core/src/openwind_mcp_core/server.py:23`](packages/mcp-core/src/openwind_mcp_core/server.py#L23) (server docstring)
- [`packages/mcp-core/src/openwind_mcp_core/server.py:131-133`](packages/mcp-core/src/openwind_mcp_core/server.py#L131-L133) (`_METHODOLOGY` constant — surfaced by `read_me` to the LLM)

### 1.3 Recent feature shipments (last ~2 months)

From `git log` since 2026-02-29, surface items that should appear in marketing:

| PR | Date (commit) | Feature | Communicated? |
|---|---|---|---|
| #69 | Apr 2026 (`b828deb`) | Per-window sweep tolerance + dual-thumb range slider | No |
| #68 | Apr 2026 (`41c17b3`) | Mobile controls always reachable + softer horizon msg | No |
| #67 | Apr 2026 (`9484cd2`) | Sweep form guardrails + friendly API errors | No |
| #66 | Apr 2026 (`708be24`) | **Compare windows + per-leg sea state + spot-map UX polish** | Partially — README mentions sweep in 1 line |
| #65 | Apr 2026 (`a991924`) | Wire compare-windows table | Partially |
| #64 | Apr 2026 (`179a653`) | Simuler/Comparer mode toggle + sweep form skeleton | Partially |
| #63 | Apr 2026 (`fda0b92`) | Clean horizon-error path + ECMWF in fallback chain | **No — docs still say only 3 models** |
| #62 | Apr 2026 (`6d1690f`) | Spot-arrow label collision push + leader lines | No |
| #59 | Apr 2026 (`9c7668a`) | Always surface Hs + sea-state warnings | No |
| #58 | Apr 2026 (`b2fbe23`) | **Multi-window sweep + VMG tacking correction + `read_me` tool** | Partially — `read_me` in main README, sweep barely |
| #57 | Mar 2026 (`4e7eb6a`) | 3-week departure slider | No |
| #54 | Mar 2026 (`72a9649`) | Click-to-trace waypoints + hover delete | No |
| #53/#52 | Mar 2026 | Aggregate sub-segments by leg + Heure/Allure/Vent/Vitesse columns | No |
| #50 | Mar 2026 (`d9e7444`) | Plan FAB + click-to-add first waypoints | No |
| #44 | Mar 2026 (`824412e`) | `/plan` mobile layout (hero stats overlay + compact drawer) | No |
| #38 | Mar 2026 (`c2e4568`) | Initial `/plan` route — progressive render + sidebar + complexity polyline | No (the `/plan` route is referenced as a deep-link only — its standalone usability isn't promoted) |
| #37 | Mar 2026 (`c6fa049`) | REST API v1 (`/api/v1/archetypes`, `/api/v1/passage`) | **No — undocumented public surface** |

The two highest-impact missing communications: **compare-windows mode**
(weekend-planning use case, multi-PR effort) and **`/plan` as a standalone tool**
that the user can drive directly from the web (waypoints, archetype, departure
slider) without ever opening an MCP client.

---

## 2. Surface inventory — where the product talks

| Surface | File | Audience | Updated last | Notes |
|---|---|---|---|---|
| Repo root README | [`README.md`](README.md) | Developers / curious sailors finding GitHub | 2026-04-29 (current branch) | Most accurate of the surfaces. |
| HF Space card (Markdown) | [`packages/hf-space/README.md`](packages/hf-space/README.md) | Anyone landing on `huggingface.co/spaces/qdonnars/openwind-mcp` | Pre-#58 wording | **Stale tool list (5 tools).** |
| HF Space landing HTML | [`packages/hf-space/app.py:62-235`](packages/hf-space/app.py#L62-L235) | Anyone hitting `https://qdonnars-openwind-mcp.hf.space/` in a browser | Recent — has Claude.ai / Le Chat / ChatGPT connector flows | Says "Three tools" (undercount). |
| Web app `/` | [`packages/web/src/App.tsx`](packages/web/src/App.tsx) | Anyone hitting `openwind.fr` | Current | **No marketing copy at all.** Lands directly on a wind-heatmap UI. |
| Web app `/plan` | [`packages/web/src/routes/PlanPage.tsx`](packages/web/src/routes/PlanPage.tsx) | Deep-linked from MCP responses, or direct entry from the FAB on `/` | Current | Functional UI, no copy. |
| Web app `<head>` SEO | [`packages/web/index.html`](packages/web/index.html) | Search engines, social sharing | Current | OG description promises features the explore page doesn't show. |
| Architecture doc | [`docs/architecture.md`](docs/architecture.md) | Contributors / re-implementers | **Pre-#58** | **Stale tool names**, ASCII diagram still shows old 4 tools. |
| `mcp-core` README | [`packages/mcp-core/README.md`](packages/mcp-core/README.md) | Devs running stdio locally | Recent | OK on tool list. Fallback chain stale (3 models). |
| `data-adapters` README | [`packages/data-adapters/README.md`](packages/data-adapters/README.md) | Devs editing the lib | Current | Internal — fine. |

---

## 3. Synchronisation features ↔ communication

### 3.1 Tool list

| Tool | Root README | HF Space card | HF landing HTML | docs/architecture.md | Status | Action |
|---|---|---|---|---|---|---|
| `read_me` | ✅ | ❌ described as "HTML widget" (wrong) | ❌ omitted ("Three tools") | ❌ absent | Inconsistent | **Fix HF Space card description; add to HF landing.** |
| `list_boat_archetypes` | ✅ | ✅ | ✅ | ✅ (still listed) | OK in card; OK in arch but next to stale tools | — |
| `get_marine_forecast` | ✅ | ✅ | ✅ | ✅ | OK | — |
| `plan_passage` (single mode) | ✅ | ❌ absent — split into two old tools | ✅ | ❌ absent | **HF card + arch stale** | **Replace `estimate_passage`+`score_complexity` rows with `plan_passage`.** |
| `plan_passage` (sweep mode) | ⚠️ 1-sentence mention | ❌ | ❌ | ❌ | Under-marketed major feature | **Promote to its own line/feature card.** |
| ~~`estimate_passage`~~ | — | ❌ still listed | — | ❌ still listed | **Phantom tool** | **Remove.** |
| ~~`score_complexity`~~ | — | ❌ still listed | — | ❌ still listed | **Phantom tool** | **Remove.** |

### 3.2 Auto-fallback model chain

| Surface | Current text | Reality (`AUTO_FALLBACK_CHAIN`) | Action |
|---|---|---|---|
| `README.md:46` | "AROME 1.3 km — ... Falls back to ICON-EU/GFS" | AROME → ICON-EU → ECMWF → GFS | Add ECMWF |
| `README.md:136` | "AROME 1.3 km ... Auto-falls back to ICON-EU (≤5 d) → GFS (≤16 d)" | same | Insert ECMWF (~10 d) |
| `mcp-core/README.md:106` | "AROME ... ICON-EU → GFS" | same | Insert ECMWF |
| `hf-space/README.md:51` | "AROME 1.3 km by default ... ICON-EU / GFS for longer reach" | same | Insert ECMWF |
| `mcp-core/.../server.py:23` (docstring) | "AROME (≤48h) → ICON-EU (≤5d) → GFS (≤16d)" | same | Insert ECMWF — also surfaced to LLMs via tool description |
| `mcp-core/.../server.py:131-133` (`_METHODOLOGY`, served by `read_me`) | "Auto-falls back to ICON-EU (<= 5 d) -> GFS (<= 16 d)" | same | **Critical** — this is what the LLM tells the user when asked "how does it work?" |

### 3.3 Boat archetype count

All surfaces consistently say **5 archetypes**. ✅ Matches
[`packages/data-adapters/src/openwind_data/routing/polars/`](packages/data-adapters/src/openwind_data/routing/polars/)
(`cruiser_30ft`, `cruiser_40ft`, `cruiser_50ft`, `racer_cruiser`, `catamaran_40ft`).

### 3.4 Deferred / unannounced surfaces

- **REST API v1** — `/api/v1/archetypes` and `/api/v1/passage` shipped in PR
  #37, are CORS-open (`allow_origins=["*"]`,
  [`hf-space/app.py:427`](packages/hf-space/app.py#L427)) and serve the web
  app. No public surface mentions them. Open question for the maintainer:
  *should* they be promoted? They'd give a "use OpenWind without MCP"
  on-ramp, but they aren't versioned-stable yet.
- **`/plan` standalone usability** — the React app on `openwind.fr/plan`
  works as a manual planner (click waypoints, pick archetype, drag the
  3-week departure slider, hit Recalculer or Comparer). On every public
  surface, `/plan` is presented only as the destination of an MCP-generated
  deep-link. There's no "plan it yourself, no LLM required" framing.

---

## 4. Wording quality by surface

### 4.1 Root README ([`README.md`](README.md))

**Value prop:** Strong. The lede ("Talk to your LLM. Cast off with confidence.")
plus the 3-step Try-it-in-30-seconds + the "Why OpenWind" table delivers the
audience and benefit fast.

**Hierarchy:** Good — endpoint URL above the fold; deep-link to openwind.fr
visible; calculation method moved below the fold.

**Jargon:** Accessible at the top. "MCP-capable assistant" is unavoidable for
the audience. Below the fold, `TWS/TWA/Hs/VMG/polar` are unexplained — fine
for the calculation section's audience (sailors + devs reading the formula),
which is sensibly gated behind an H2.

**CTA:** Clear ("add the endpoint", "ask in your own words"). The "First time
with MCP?" callout (lines 33-38) is a great defensive move for cold visitors.

**Concrete suggestions** (full text in
[`marketing-drafts/wording-suggestions.md`](marketing-drafts/wording-suggestions.md)):

- The tools table line for `plan_passage` mentions sweep mode in a
  parenthetical ("Optional sweep mode for multi-window departures."). Promote
  it to its own row, OR add a fifth row in the "Why OpenWind" table.
- The "Why OpenWind" row about the boat archetypes says "Five archetypes …
  efficiency knob" — the phrasing "efficiency knob" sounds quirky/insider.
  Two alternatives proposed.

### 4.2 HF Space card ([`packages/hf-space/README.md`](packages/hf-space/README.md))

**Critical:** the "Five tools" table is **factually wrong** (see § 3.1).

**Cold-start mention** at line 84-86 links to `plan/04-backlog.md` which is
**not on the public repo** — `plan/` is in `.gitignore` ([`.gitignore:25`](.gitignore#L25))
and not pushed. **Broken link.**

**Otherwise:** wording mirrors the root README's tone — fine.

### 4.3 HF Space landing HTML ([`packages/hf-space/app.py:62-235`](packages/hf-space/app.py#L62-L235))

This is the page a user sees if they navigate to
`https://qdonnars-openwind-mcp.hf.space/` in a browser. **Best surface in the
project right now.** The connector instructions for Claude.ai, Le Chat, and
ChatGPT are concrete, click-by-click, and tested.

**Issues:**

- "Three tools" (line 220) — wrong count, see § 0.
- Missing the Compare/sweep angle. The example query ("how long is the
  passage and how tricky is it?") is single-window. A second example showing
  "show me my best window between Friday and Monday" would teach users the
  highest-leverage feature they don't yet know exists.
- No mention of `openwind.fr/plan` as a standalone option for the
  LLM-shy / API-key-shy / curious user. They'll plug in a connector or
  bounce.

### 4.4 Web app `/` ([`packages/web/src/App.tsx`](packages/web/src/App.tsx))

This is `openwind.fr`'s landing. **There is no marketing copy.** A first-time
visitor sees a wind heatmap of the Rade de Marseille and a compass-icon FAB.
They must guess what the FAB does (tooltip says "Planifier un passage"
[`App.tsx:97`](packages/web/src/App.tsx#L97)) or click it to find out.

If the README/HF Space card is doing the heavy lifting on selling the MCP
story, the web app's job becomes **"convert the curious-but-tool-less user"**.
At minimum, surface:
1. What this site does (one sentence).
2. The two ways in: (a) the live MCP endpoint, (b) `/plan` directly.

The current `<head>` OG description ([`index.html:13`](packages/web/index.html#L13))
promises *"wind forecasts, passage estimates and complexity scores"* — the
landing only delivers the first.

### 4.5 Web app `/plan` ([`packages/web/src/routes/PlanPage.tsx`](packages/web/src/routes/PlanPage.tsx))

Functional, polished, French-only UI. No issues to flag — the audit scope is
landings, not the full UI. One observation: the app has zero discoverability
for the **Compare** mode unless the user already knows it exists; the
toggle `["compare", "Comparer les fenêtres"]` is in the sidebar but not
explained on a first visit.

### 4.6 Architecture doc ([`docs/architecture.md`](docs/architecture.md))

**Stale on three counts:**
- ASCII tool list (lines 23-24): `estimate_passage`, `score_complexity`.
- Step 3 (line 53): "`estimate_passage(waypoints, departure, archetype)`".
- Step 4 (line 57): "`score_complexity(...)`".
- Failure mode (line 97): "`estimate_passage` does not iterate".

Anyone landing on this doc — likely a contributor — gets a wrong mental
model.

### 4.7 Tone consistency cross-surface

The English voice ("Talk to your LLM. Cast off with confidence.") is
consistent across root README, HF card, HF landing. The web app is FR-only.
That's intentional given the V1 Mediterranean target, but the README/HF
materials don't acknowledge it — a French sailor landing on `openwind.fr`
gets the experience; an English sailor lands on a French UI with no toggle.
Worth flagging for the maintainer; no recommendation here without a product
call.

---

## 5. Visuals

### 5.1 Inventory

| File | Used in | Tracked? | Status |
|---|---|---|---|
| [`docs/screenshots/plan.png`](docs/screenshots/plan.png) | Root README hero, HF Space card hero, HF landing hero | ✅ | **Likely stale** (see § 5.2). |
| [`docs/screenshots/viz.png`](docs/screenshots/viz.png) | None — orphan | ❌ untracked (also untracked per gitstatus at session start) | Loose file. Either reference it from the README (no surface uses the explore screenshot) or delete it. |
| [`docs/screenshots/README.md`](docs/screenshots/README.md) | — | ✅ | Says only `plan.png` exists. Doesn't mention `viz.png`. Says "replace by `plan.gif` later" — still PNG. |

The HF Space landing also references `plan.png` via the GitHub raw URL on
`main`, so any update to `main` propagates everywhere — that's good plumbing.

### 5.2 Freshness check on `plan.png`

The screenshot shows:
- Top header with **"Explore | Plan" tabs** — current code's `/plan` header
  ([`PlanPage.tsx:380-392`](packages/web/src/routes/PlanPage.tsx#L380-L392))
  has no such tabs; it has a SpotSearch input + a CopyLinkButton (🔗) +
  ThemeToggle.
- A **"Refetch" button** label — current code labels the button "Recalculer"
  ([`PlanPage.tsx:133`](packages/web/src/routes/PlanPage.tsx#L133),
  [`PlanSidebar.tsx:809`](packages/web/src/plan/PlanSidebar.tsx#L809)).
- A **"Sun Odyssey 380" / "11.5m / Cruiser" boat-archetype card** — current
  sidebar has an archetype dropdown, not a card with a commercial model name
  formatted that way.
- No **mode toggle** ("Simuler / Comparer") visible — that toggle was added
  in PR #64 and is now in the sidebar.

**Conclusion: `plan.png` predates PRs #57 (slider), #64 (mode toggle), and
the SpotSearch header retrofit.** Anyone hitting `openwind.fr/plan` today
will see something materially different. The hero is the first impression
on three high-value surfaces and is misleading.

### 5.3 Coverage gaps

Currently zero visuals show:
- **Compare-windows mode** (the sweep table — best feature shipped this
  quarter).
- **Mobile UI** — significant investment in PRs #44, #45, #61, #68; not
  visible on any surface.
- **Inline rendered HTML widget** in an MCP host — the README *describes* it
  ("inline preview card") but never shows it.
- **Explore (`/`) — wind heatmap** — orphan `viz.png` exists but isn't
  referenced.

Detailed cahier des charges in
[`marketing-drafts/visuals-brief.md`](marketing-drafts/visuals-brief.md). I
do not generate images.

---

## 6. Tutorials walk-through

### 6.1 Root README ([`README.md`](README.md), "Try it in 30 seconds")

Walked through as a Claude Desktop / claude.ai user, nothing already known:

- Step 1 ("add the endpoint") — works for hosts that accept a remote URL.
  But the user has to figure out *where* to paste it. The README defers to
  `modelcontextprotocol.io/docs/develop/connect-remote-servers` (line 35),
  which is correct but adds a hop. The **HF Space landing** does this far
  better with copy-paste-ready 5-step lists per host.
- Step 2 (the prompt) — clear.
- Step 3 — assumes the host renders HTML inline. On a host that doesn't,
  the user gets the JSON payload with a `openwind_url` link — that fallback
  is documented in the docstring but not in the README's tutorial. **Friction
  point.**
- "Run locally" section ([`README.md:78-96`](README.md#L78-L96)) — the
  commands are correct as far as I can verify statically:
  - `uv sync --all-extras` from `packages/mcp-core/` → confirmed by
    [`packages/mcp-core/pyproject.toml`](packages/mcp-core/pyproject.toml).
  - `uv run pytest -x -q` → confirmed by test layout.
  - `uv run python app.py` from `packages/hf-space/` → matches
    [`packages/hf-space/app.py:447-448`](packages/hf-space/app.py#L447-L448).
  - `npm install` / `npm run dev` from `packages/web/` → matches
    [`packages/web/package.json`](packages/web/package.json).
  - **No Python version constraint stated** (`>= 3.x`?). For a "first-time
    contributor" reproducer, this is a gap.

### 6.2 mcp-core README ([`packages/mcp-core/README.md`](packages/mcp-core/README.md))

Goal: wire to a local stdio client (Claude Desktop / Claude Code / Goose).

- Path to the macOS / Windows config files — correct.
- Linux: "Claude Desktop is not officially supported — use Claude Code (CLI)
  MCP config or any other MCP client". Mentions Claude Code but **doesn't
  show the Claude Code config snippet**, only the Claude Desktop one. A
  Linux user has to translate.
- The sanity-check Python snippet (lines 50-63) **calls
  `await server.list_tools()` on the FastMCP instance**. I can't verify
  statically that this is the public API of FastMCP without running it —
  worth a smoke test before next public push.
- Expected output array `['read_me', 'list_boat_archetypes',
  'get_marine_forecast', 'plan_passage']` — matches `build_server()`
  registrations. ✅

### 6.3 HF Space card ([`packages/hf-space/README.md`](packages/hf-space/README.md))

No real "tutorial" beyond pasting the URL into an MCP client. The detailed
flows live in the HF landing HTML (§ 6.4) — the card just gives the URL.
That split is fine **if** the card is short. The current card is long
(~90 lines) but skips the step-by-step. Consider either pointing card readers
at the landing's connector flows, or de-duplicating.

### 6.4 HF Space landing HTML ([`packages/hf-space/app.py`](packages/hf-space/app.py))

**Best tutorial in the project.** Three `<details>` blocks (Claude.ai, Le
Chat, ChatGPT) with concrete UI steps and pasteable URL. Two improvements:

- The Le Chat flow's "Auth: None" instruction is current as of late 2025; it
  would be worth a re-test annually as Mistral's UI shifts.
- ChatGPT custom-connectors pricing tier (line 192) — the wording "ChatGPT
  Pro, Business, or Enterprise" is current; if Plus tier ever gets
  connectors, this needs a refresh.
- **No fallback for users who don't have any MCP host yet.** Add a single
  line directing them to `openwind.fr/plan` as a no-install option.

### 6.5 What a first-time visitor cannot do today

A non-developer sailor who lands on `openwind.fr` (top-of-funnel) cannot
discover the MCP angle without:
1. Clicking the compass FAB to land on `/plan`, OR
2. Looking at the GitHub link (no link visible from `/`!) → README → MCP
   instructions.

There is **no link from `openwind.fr` to either `github.com/qdonnars/openwind`
or `qdonnars-openwind-mcp.hf.space`** — checked
[`packages/web/src/components/Header.tsx`](packages/web/src/components/Header.tsx)
and [`packages/web/src/App.tsx`](packages/web/src/App.tsx). Top of funnel
leaks.

---

## 7. Cross-canal coherence

### 7.1 Same product, same name?

Yes — "OpenWind" everywhere. ✅

### 7.2 Same feature names?

Inconsistencies:

- "Sweep mode" (root README) vs "Compare windows" (web UI: `Comparer les
  fenêtres`) vs "multi-window" (server `mode` field: `"multi_window"`).
  Three names for the same thing. The user-facing name should be one.
- `read_me` is described as "calculation methodology" (root README,
  server docstring) vs "self-contained HTML widget for inline rendering"
  (HF Space card). The HF Space card is wrong; both these phrasings exist
  for *different* things — `plan_passage`'s `html` field is the widget,
  `read_me`'s return is the methodology Markdown.

### 7.3 Link integrity

Manually checked all internal cross-links from the public surfaces:

| Source → target | Status |
|---|---|
| `README.md` → `mcp.openwind.fr` (line 10) | ⚠️ The display text is `mcp.openwind.fr`, the link target is `qdonnars-openwind-mcp.hf.space`. The `mcp.openwind.fr` subdomain is not yet wired (HF custom-domain is gated behind PRO, per [`hf-space/app.py:9-10`](packages/hf-space/app.py#L9-L10)). User-readable text suggests the prettier domain is live; clicking still works thanks to the `href`, but the visible text is slightly misleading. |
| `README.md` → `docs/architecture.md` (line 76) | ✅ resolves to a tracked file (but the file is stale — § 4.6) |
| `README.md` → `plan/` (line 102) | ❌ folder is gitignored; on GitHub this is a 404. Says "(local)" so semantically OK, but the link itself is dead. |
| `hf-space/README.md` → `plan/04-backlog.md` (line 86) | ❌ **404 on github.com** (gitignored). |
| `docs/screenshots/README.md` → `packages/hf-space/app.py` (line 11) | ✅ resolves. |
| `mcp-core/README.md` → `../../README.md#calculation-method` (line 109) | ✅ anchor `## Calculation method` exists in the root README. |
| `README.md` hero image | Local relative path; resolves on github.com. ✅ |
| HF Space card hero image | Absolute `raw.githubusercontent.com/.../main/docs/screenshots/plan.png` — resolves as long as `main` has the file. ✅ |
| HF Space landing image | Same absolute URL — same status. ✅ |

### 7.4 What's promised vs delivered, by entry point

| Entry | Top-of-page promise | Delivered on that page |
|---|---|---|
| `github.com/qdonnars/openwind` | "passage planner via MCP, free, keyless" | Yes. |
| `huggingface.co/.../openwind-mcp` (card) | "Mediterranean sailing planner for any MCP client" | Yes (with stale tool list). |
| `qdonnars-openwind-mcp.hf.space/` (landing) | "Talk to your LLM" + connector flows | Yes. |
| `openwind.fr/` (web) | OG: "wind forecasts + passage estimates + complexity scores" | **No** — only wind heatmap is on `/`. The other two live on `/plan`. |
| `openwind.fr/plan` (deep-link target) | (no top-of-page text) | Functional planner, but no copy. |

---

## 8. Top 5 priority actions

Ordered by impact ÷ effort. Effort key: **S** (≤30 min), **M** (≤2 h),
**L** (half-day+).

### 1. Fix the HF Space card tool list (factual error, public surface)

- **Effort:** S
- **Impact:** Reliability / trust. This is the second-most-visited surface
  (after the root README) for an MCP-curious user. Right now it advertises
  two non-existent tools.
- **Files:** [`packages/hf-space/README.md`](packages/hf-space/README.md)
  (lines 56-64 — replace with the 4-tool table from
  [`README.md:54-60`](README.md#L54-L60)). Also fix the `read_me`
  description ("Returns the calculation methodology as Markdown"). Also
  fix the dead link to `plan/04-backlog.md` at line 86 — either remove the
  parenthetical or repoint to a tracked file.

### 2. Update the auto-fallback chain copy everywhere (incl. `_METHODOLOGY`)

- **Effort:** S
- **Impact:** Reliability / honesty. ECMWF is the model the server actually
  uses for ~5–10 d horizons; right now we pretend it doesn't exist.
  Critically, the `read_me` tool ships the wrong list to the LLM, so when a
  user asks "how does it work?" the LLM repeats the wrong fallback chain
  back to them.
- **Files:** [`README.md:46`](README.md#L46), [`README.md:136`](README.md#L136),
  [`packages/mcp-core/README.md:106`](packages/mcp-core/README.md#L106),
  [`packages/hf-space/README.md:51`](packages/hf-space/README.md#L51),
  [`packages/mcp-core/src/openwind_mcp_core/server.py:23`](packages/mcp-core/src/openwind_mcp_core/server.py#L23) (server docstring),
  [`packages/mcp-core/src/openwind_mcp_core/server.py:131-133`](packages/mcp-core/src/openwind_mcp_core/server.py#L131-L133) (`_METHODOLOGY` constant).

### 3. Promote Compare-windows / sweep mode as a first-class feature

- **Effort:** M (copy + 1 visual)
- **Impact:** Visibility / conversion. Largest UX feature shipped this
  quarter; near-zero discoverability today. The "best sailing window between
  Friday and Monday" is the killer query for a weekend sailor.
- **Files:**
  - [`README.md`](README.md) — add a row to "Why OpenWind" or carve a small
    H2 "Plan a single passage **or compare a weekend's worth of windows**".
  - [`packages/hf-space/README.md`](packages/hf-space/README.md) — same.
  - [`packages/hf-space/app.py:204-206`](packages/hf-space/app.py#L204-L206)
    (LANDING_HTML) — add a second example query ("show me my best window
    between Saturday and Monday").
  - **New screenshot needed** — see
    [`marketing-drafts/visuals-brief.md`](marketing-drafts/visuals-brief.md)
    item "compare-windows.png".

### 4. Refresh `plan.png` (hero image is stale)

- **Effort:** M (re-shoot the screenshot; no design work — UI is final)
- **Impact:** First-impression quality. Same image is the hero on three
  surfaces; a misleading hero erodes trust on hover.
- **Files:** Replace [`docs/screenshots/plan.png`](docs/screenshots/plan.png)
  with a current capture showing the SpotSearch header, the
  3-week departure slider, the "Recalculer" / "Comparer" buttons, and an
  archetype dropdown selection. Cahier des charges in
  [`marketing-drafts/visuals-brief.md`](marketing-drafts/visuals-brief.md).

### 5. Give `openwind.fr/` a one-line value prop + outbound links

- **Effort:** M
- **Impact:** Conversion (top-of-funnel leak fix). A first-time visitor
  hitting `openwind.fr` sees a wind map and can't get from there to the MCP
  story without clicking blind.
- **Files:** [`packages/web/src/components/Header.tsx`](packages/web/src/components/Header.tsx)
  or [`packages/web/src/App.tsx`](packages/web/src/App.tsx) — add either a
  thin top banner ("Plan a passage with your AI assistant — talk to it →
  [Connect MCP]") or a tiny footer with three pills (Github · MCP server ·
  Roadmap). Two wording options proposed in
  [`marketing-drafts/wording-suggestions.md`](marketing-drafts/wording-suggestions.md).

---

## Appendix — methodology

- All wording observations cross-referenced against current `main` HEAD on
  branch `fix/web-windowstable-undefined-fields` (commit `c8c34f0`).
- Tool surface verified by reading
  [`packages/mcp-core/src/openwind_mcp_core/server.py`](packages/mcp-core/src/openwind_mcp_core/server.py)
  rather than the documentation. Documentation is the audited surface,
  never the source.
- "Recent" features = last 60 days of `git log` on `main`.
- No live request was made to `openwind.fr` or `qdonnars-openwind-mcp.hf.space`
  — all observations are from source. A live smoke pass against the deployed
  HF Space is recommended after applying actions #1, #2, #3 (per the
  post-deploy smoke convention).
- I do not generate visuals. Cahiers des charges in
  [`marketing-drafts/visuals-brief.md`](marketing-drafts/visuals-brief.md)
  describe what to shoot.
