# What's new in OhMyWind

Every OhMyWind release, newest first. The ohmywind.fr site and the MCP server share one version number; the Android app keeps its own on the Play Store.

This is a translation of [CHANGELOG.md](CHANGELOG.md), the French text being the reference. Each release is also published on the repository's [Releases](https://github.com/qdonnars/ohmywind/releases) page, and the app shows this log on its "What's new" page.

## 1.9.0 · 2026-10-12 · Sail and oar dinghies, and a What's new page

### New

- A new boat type, the sail and oar dinghy (about 5 m), covers small open boats without a cabin (#447).
- A What's new page traces OhMyWind's releases. It opens from the "i" button, where a discreet dot flags a new version (#466, #469).

### Fixes

- A plan beyond the seven days of forecast, or a comparison restored in the past, is computed by the server instead of failing, and GFS is always kept as the last resort (#462).
- Spots are easier to tap, the Explore pills are readable in the light theme, "Add a spot" is visible on Compare and the step strip fits the screen width (#463).
- The methodology points to the Boat tab for polars and tells the web app, the API and the MCP server apart (#460).
- The Explore hourly tables line up with the model column: no half-hidden column or day label after scrolling, and the line between two days keeps the same colour on every row; the boat picker in the plan shows readable names (#465).
- On Compare, the place search measures its distances from your spots; a departure yesterday reads "Yesterday", not "Today"; an arrival on the next day shows its day (#467).
- The boat picker button shows the boat's name, not its identifier; after "Cancel" on a route being drawn, the back button closes the comparison without leaving the plan (#469).

### Behind the scenes

- Dead code is caught in continuous integration and the missing licence headers are added (#461).
- The GitHub agents get more room to carry a fix through (#448).

## 1.8.0 · 2026-10-11 · Tidal currents: the right source, or "unknown"

### New

- Tidal currents come from a cascade of atlases that reaches beyond France: BSH in the German Bight, Copernicus in the North Sea, along the Iberian coast and in the Mediterranean (#426, #428, #430).
- When no reliable source knows the current (the Rance, the tidal Seine, the edge of an atlas, a pass too narrow for the source), the plan shows "unknown current" rather than a wrong number (#450, #454).
- Offshore, where the tide is weak, the general circulation from the Copernicus global model answers instead (#453).
- A warning flags strong-current areas that the source in use describes poorly (#426, #435, #436).
- The methodology gains a Tidal currents sub-page, with a full-screen map of what the app uses at each point and the register of sources (#438, #440, #441, #442).
- On that map, a point's card shows the server's exact decision and the sources it set aside (#433, #456).

### Fixes

- A passage outside the AROME domain, at Gibraltar, in Portugal or in the Strait of Messina, no longer fails on a request error (#429).
- A point on land is reported as such instead of being given a current (#434).
- The card on the tidal map is readable on a phone (#427).
- The methodology map shows exactly what the server serves, unknown-current areas included (#452, #458).

### Behind the scenes

- Computed currents are checked against real observations, HF radars and current meters (#457).
- Norway and Iceland were explored, then left outside the served area, and Gibraltar is cut out of the Copernicus atlases (#437, #439, #451).

## 1.7.0 · 2026-09-18 · Compare this passage

### New

- At the bottom of the results, "Compare this passage" tries other departure times or up to three routes between the same points (#406, #407, #408, #410).
- A discovery card introduces both comparisons after your first plan (#410, #416).
- When Open-Meteo's free quota runs out, the message says which counter is reached and when it resets (#405).
- A Press page gathers the articles published about OhMyWind, and the About panel is reorganised (#403, #404).

### Fixes

- The computation's warnings are translated into the five languages (#414).
- Renaming a spot no longer reloads the page, and the day shown in the Explore table no longer lags behind (#414).
- A step's speed breakdown no longer passes tacking off as an effect of the sea (#415).
- Going back from a comparison returns to the plan without a pointless extra step (#417).

## 1.6.0 · 2026-09-12 · A menu, Compare my spots and clearer results

### New

- A menu at the top left leads to Explore, to Plan and to the new Compare my spots page, which sets your favourites side by side (#379).
- Plan results are redesigned: distance, duration and arrival at the head of the drawer, and the map cleared after computing (#397).
- On a phone, the plan map responds better to the finger: an accidental touch no longer adds a point, a removed point comes back with one tap and a point moves after a short hold (#401).
- Near the Atlantic coast, the SHOM atlas is only used within 500 m of its points, MARC takes over beyond, and the source is named under the currents table (#399).
- The Android app moves to version 1.1.0, with a monochrome icon for Android 13 themes and shortcuts to the planner and the settings (#305, #306, #307, #347, #386).

### Fixes

- The tide chart has an opaque background, high and low waters to the minute and a legend for the zero (#394).

### Behind the scenes

- The privacy policy names the Libramer association as data controller (#396).

## 1.5.0 · 2026-09-06 · Five languages, and the iPhone properly framed

### New

- The interface speaks French, English, German, Italian and Spanish, picked on the Configuration page (#368, #369, #374).
- The privacy policy is translated into the five languages, the methodology into English, and numbers follow the conventions of the chosen language (#369, #372).
- When the weather server wakes up, the computation restarts on its own (#376).
- The convention notes under the tables and in the plan make room for the data, the convention staying explained in the methodology (#367).
- The timeline can be dragged with the mouse as with a finger (#375).

### Fixes

- On iPhone, the search bar no longer slides under the camera, the status bar takes the theme's colour and the bottom of the screen has no empty band (#377, #378, #380, #381, #382).
- The iOS home screen icon is sharp (#371).
- Under engine, the speed breakdown shows the engine and not "polar + sea" (#373).
- Typing an upwind angle no longer changes the value mid-keystroke, and tables are no longer cut off at the bottom in Firefox on Mac (#375).
- The five languages fit on one line in the picker, abbreviated on a small screen (#383).

## 1.4.0 · 2026-09-03 · The steps of a leg, and the map offline

### New

- A leg unfolds into steps, as an average or in detail, in the panel as on the map (#351).
- A leg's average compass carries one ring for the wind and another for the current, and a step's alerts are raised on the average (#362, #363, #364, #365).
- Offline, the app says so and keeps the basemap already browsed (#349).
- Installing to the home screen shows screenshots of the app, and the page can be zoomed again (#352, #357).
- The Wind tab recalls the arrow convention (#358).

### Fixes

- A route draft gives way when you open the link to another route (#359).

### Behind the scenes

- Passage requests are sent compressed, and a single call covers the MARC currents of the whole corridor (#354, #355, #360, #361).
- The relay in front of the MCP server returns a readable error while the server sleeps, with a cache and metrics (#350).
- The interface colours rest on the design tokens (#356).

## 1.3.3 · 2026-09-02 · Faster, and Android's back button closes panels

### Fixes

- Android's back button closes the open panel instead of leaving the app (#314).
- An app update no longer reloads the page while you are using it (#316).
- The time offset shown is the one of the planned date, not of today (#310).
- The automatic location request fails silently instead of showing an error (#308).
- An unknown address shows a "not found" page instead of the map (#344).
- The search field is announced properly by screen readers (#328).

### Behind the scenes

- Computing a passage takes fewer requests, the fonts are served by OhMyWind and the documentation pages load on demand (#311, #312, #315, #318, #320, #321).
- The REST API becomes a package of its own, with a single marine adapter for REST and MCP, structured logging and bounded request costs (#317, #329, #331, #334, #337, #338).
- The passage engine is reorganised and the SHOM current prediction is vectorised (#335, #341, #345).

## 1.3.2 · 2026-09-01 · The app reopens on your last spot

### Fixes

- The app reopens on the last spot viewed instead of the first favourite (#302).
- The usage warning leaves the bottom of the plan for the About window, where it no longer takes the results' room (#299).

### Behind the scenes

- Commits are signed off automatically for the DCO (#304).

## 1.3.1 · 2026-08-27 · New OpenFreeMap basemap

### New

- A warning under each plan recalls that OhMyWind helps you decide without replacing navigation instruments (#292).

### Fixes

- The basemap moves to OpenFreeMap, with no key and no quota, since CARTO now stamps a watermark on its tiles for anonymous use (#295).
- In the dark theme, maritime boundaries are no longer drawn out at sea (#296).
- After a deployment, the app does switch to the new version instead of staying on the old one (#294).

### Behind the scenes

- The MCP tools remind assistants that waypoints must stay in the water, and every plan sent carries the usage warning (#287, #292).
- The cost of a window comparison is bounded: beyond it, the step widens instead of refusing (#293).
- The MCP server's home page shows a real session on video (#288, #290, #291).

## 1.3.0 · 2026-08-20 · Nautical chart, tacking and the AGPL licence

### New

- A nautical chart layer shows OpenSeaMap seamarks, and each waypoint gives the depth from EMODnet (#274).
- A leg tighter than your boat's upwind angle shows as "Close-hauled (tacking)" (#280, #282).
- The weather is read along the route at the pace of the boat's speed, no longer at a fixed 6 knots (#267).
- Engine speed can go up to 30 knots, and an out-of-range value is visibly clamped instead of being ignored (#265).
- The Android app moves to version 1.0.2, built for recent Android versions (#261, #273).

### Fixes

- The spinnaker douse threshold can be typed freely, without a stray zero (#270, #284).
- The plan drawer handle can be grabbed with a finger (#283).
- The model reordering help addresses you formally too, in French (#285).

### Behind the scenes

- The project moves to the AGPL-3.0-or-later licence, and contributions are made under the DCO (#263, #264).
- The triage and fix agents see images attached to issues (#271).

## 1.2.0 · 2026-08-14 · A more direct mobile plan, your custom polar first

### New

- On mobile, the plan panel opens straight on the results, with the actions folded above (#259).
- Your custom polar comes first in the boat picker (#258).
- The polar diagram extends down to a dead run, at 180° (#254).
- The boat's performance coefficient is shown on the plan page, with a revised default value (#248, #250).

### Fixes

- Points are centred in the visible part of the map, and the wind shows as soon as your position is known (#256, #257).
- A custom polar's boat takes precedence over the one remembered in the plan's address (#252).
- The page-switch button shrinks on small phones (#244).
- The whole French interface addresses you formally (#253).
- Icons have transparent corners, with a dedicated adaptive icon for Android (#249).

### Behind the scenes

- The Android app's signing fingerprints are up to date (#251, #255).

## 1.1.1 · 2026-08-13 · Full-screen Android app, licence and trademark

### Fixes

- The Android app installed from the Play Store opens full screen, without an address bar (#223).
- A long press on a value of the forecast table no longer takes you out of the app to Google search (#226).
- Spots and settings saved back in the OpenWind days are carried over automatically (#239).
- The banner announcing the name change goes away (#221).

### Behind the scenes

- The MIT licence is made explicit and a usage policy covers the OhMyWind trademark (#221).
- An automated agent triages new GitHub issues and proposes a fix when asked (#229, #233, #235, #237, #240, #245).

## 1.1.0 · 2026-08-07 · Import your boat's polar

### New

- You can import your boat's polar from a file, and download a sample file to see the format (#215, #217).
- The plan summary names the boat and where its polar comes from (#217).

### Fixes

- On mobile, the bottom of the screen is no longer hidden by the address bar, pinching outside the map no longer zooms the whole page and pulling down no longer reloads the app (#213).
- The guided tour says compass the right way in French (#216).

## 1.0.2 · 2026-08-06 · Weather models reordered with a finger

### New

- A Privacy page details the data the app processes, as the Play Store requires (#212).

### Fixes

- Weather models can be reordered with a finger on the Configuration page, Firefox Android included, by the handle or by a long press on the row (#206, #209).
- An installed app sees a new deployment at its next launch, instead of keeping the old version for up to four hours (#208).

### Behind the scenes

- The Android app declares its signing fingerprints ahead of the Play Store (#212).

## 1.0.1 · 2026-08-02 · OhMyWind in the official MCP registry

### New

- OhMyWind is listed in the official MCP server registry as fr.ohmywind/sailing-planner (#200).
- The description announces worldwide coverage thanks to ECMWF and GFS, the precision of the French atlases coming on top (#202).
- The installation guide covers clients that only speak stdio, through mcp-remote, and offers three sample questions (#198).
- The MCP tools are annotated as read-only, which helps assistants present them (#198).

### Behind the scenes

- The feedback tool, the server's only public write endpoint, is removed (#198).

## 1.0.0 · 2026-08-01 · OhMyWind's first public release

### New

- Draw a route on the map, pick a boat type or tune its polar, and OhMyWind estimates each leg's duration and its difficulty from 1 to 5, with the option to compare several departure times.
- For every point of the map, Explore shows wind, waves, tide and currents, with AROME by default and other weather models to rank on the Configuration page.
- On the French Atlantic coast, currents come from the SHOM and MARC atlases rather than the global model.
- The MCP server lets you ask your assistant (Claude, Le Chat and others) for a plan in plain language, with no account and no key.
- Place search favours what is near the map and finds sea names such as the Raz de Sein or the Goulet de Brest (#178).
- A "centre on me" button comes to the Explore and Plan maps, and your geolocation choice is remembered (#177, #180).
- Moving between Explore and Plan keeps the map view and happens without a reload (#182, #183).

### Fixes

- After too many requests, the message gives the real waiting time, and a limit reached at Open-Meteo no longer looks like a server outage (#186, #194).
- The plan banner responds to touch again (#187).

### Behind the scenes

- OpenWind becomes OhMyWind (#185, #193).
- The public server is hardened: rate limiting, bounded coordinates and security headers (#181, #187, #195).
- A Cloudflare Worker serves the MCP server under mcp.ohmywind.fr (#192).
