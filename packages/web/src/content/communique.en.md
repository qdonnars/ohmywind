## New: a sailor's conversation with AI assistants

OhMyWind plugs into AI assistants (Claude, ChatGPT, Le Chat…) through the open [MCP](https://modelcontextprotocol.io) protocol. Sailors describe their trip as they would to a crew member, "tomorrow, Marseille to Porquerolles on a Sun Odyssey 36, when should I leave?", and the assistant queries OhMyWind to answer. Version 1.10, released on 17 October 2026, turns it into a real tool for the boat:

- **A passage in a single view**: the list of possible departures first, then the route on a map and the leg-by-leg detail of the chosen departure, shown inside the conversation on assistants that support it, such as Claude and ChatGPT. Elsewhere, a link opens the same plan on ohmywind.fr.
- **Tide questions, without planning a passage**: the time of slack water at the entrance to a pass, the strength and direction of the stream, high and low water, the tidal coefficient.
- **Two options compared in a single request**: north or south of an island, to one destination or another, departure by departure.
- **Answers in ship's time**: given in the sailor's local time, with the day of the week, shorter and therefore faster.
- **A route that crosses land is rejected** before any calculation, and the assistant is asked to redraw it at sea.

Connecting takes a minute, with no OhMyWind account and no API key: just follow the [step-by-step guide](https://mcp.ohmywind.fr) with the address `https://mcp.ohmywind.fr/mcp`. The full list of changes is in the [release notes](/a-propos/nouveautes).

## Just what is needed: when to leave, which way to go

Navigation apps often do a great deal, and cost a lot, for needs that remain simple. OhMyWind focuses on just what is needed: not one more routing program, but answers to the questions sailors ask before a day sail or a short crossing. What time should we leave? Which way should we go?

The user [draws the route](/plan), picks a type of boat, and for every possible departure hour OhMyWind works out:

- the duration and arrival time, leg by leg, from the boat's polars;
- the wind, sea and current met on each leg;
- a complexity score from 1 to 5, with concrete warnings (fresh wind, rough sea, wind against tide).

Departure windows compare at a glance, and so do several routes for the same crossing. The [Compare my spots](/comparer) page also sets favourite spots side by side, hour by hour.

## Tidal currents, taken seriously

Tidal currents are computed over a large part of European waters: the English Channel, the Bay of Biscay, the North Sea, the German Bight and the Elbe. At each location, OhMyWind uses the most accurate tidal atlas available, from public producers (SHOM, Ifremer, BSH, Copernicus). These data have been checked against real measurements from coastal radars.

Where no reliable source exists, for instance in some narrow passes that the models do not resolve, the app shows "unknown current" rather than a misleading figure. A [coverage map](/methodologie/courants), available on the site, shows point by point which source is used.

## The best public weather models, chosen by the user

OhMyWind brings together the reference public weather models: Météo-France's AROME (1.3 km grid), ICON-EU, ECMWF and GFS. Users pick the model, or let the tool use the most accurate one available for their area. Sources, calculations and limits are set out in the [methodology](/methodologie).

## Available everywhere

- On the web, nothing to install: [ohmywind.fr](/)
- On Android, from the [Google Play Store](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- In five languages: French, English, German, Spanish and Italian
- In MCP-compatible AI assistants, such as Claude, ChatGPT or Le Chat

## An open project, backed by a non-profit

OhMyWind is developed by Quentin Donnars, an Arts et Métiers engineer, data scientist and sailing instructor. The project is backed by Libramer, a non-profit association under the French law of 1901 whose purpose is to make public data useful to sailors, and in time to build a cooperative database of tidal currents.

The [source code is public](https://github.com/qdonnars/ohmywind) ([AGPL licence](https://github.com/qdonnars/ohmywind/blob/main/LICENSE)). Funding relies on sponsorship from marine brands, with no influence whatsoever on the calculations or on the tool's recommendations.

> "Public weather and ocean data are of remarkable quality, but they remain hard for leisure sailors to get at. OhMyWind puts them to work on very concrete questions: when to leave, which way to go. We focus on just what is needed: not one more routing program, simply answers to sailors' questions."
>
> Quentin Donnars, founder of OhMyWind

## What OhMyWind is not

OhMyWind is a decision-support tool. It does not replace the official marine forecast, up-to-date charts, or the judgement of the skipper, who remains solely responsible for the passage.

## In the press

[Bateaux.com](https://www.boatnews.com/story/52477/ohmywind-the-open-source-project-that-aims-to-rethink-how-we-prepare-for-a-sailing-trip) (in English on boatnews.com, and in French, German, Spanish and Italian), [BOOTE](https://www.boote-magazin.de/en/equipment/technology/navigation-ohmywind-a-free-weather-planner-with-ai-functionality/), YACHT. All articles are gathered in the [press coverage](/presse).

## Press contact

Quentin Donnars, founder: [contact@ohmywind.fr](mailto:contact@ohmywind.fr)

Visuals (logo, screenshots) available on request.

## Useful links

- **Web app**: [ohmywind.fr](/)
- **Plan a passage**: [ohmywind.fr/plan](/plan)
- **Compare favourite spots**: [ohmywind.fr/comparer](/comparer)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- **Methodology**: [ohmywind.fr/methodologie](/methodologie)
- **Tidal current map**: [ohmywind.fr/methodologie/courants](/methodologie/courants)
- **What's new (version 1.10 and earlier)**: [ohmywind.fr/a-propos/nouveautes](/a-propos/nouveautes)
- **MCP server**: `https://mcp.ohmywind.fr/mcp`
- **Guide to connecting AI assistants (Claude, ChatGPT, Le Chat)**: [mcp.ohmywind.fr](https://mcp.ohmywind.fr)
- **Demo videos**: [ohmywind.fr/youtube](https://ohmywind.fr/youtube)
- **Other MCP clients (Cursor, VS Code, Goose…)**: [quick start](https://github.com/qdonnars/ohmywind#try-it-in-30-seconds)
- **MCP protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Source code**: [github.com/qdonnars/ohmywind](https://github.com/qdonnars/ohmywind)
- **Cap Innovation, Paris Nautic Show 2026**: [parisnauticshow.com/cap-innovation](https://www.parisnauticshow.com/cap-innovation/) (in French)
- **Press coverage**: [ohmywind.fr/presse](/presse)
- **Privacy**: [ohmywind.fr/confidentialite](/confidentialite)
- **Association**: Libramer, non-profit association under the French law of 1901
