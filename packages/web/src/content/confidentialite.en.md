# Privacy policy

*This page is a translation. The French version ([/confidentialite](/confidentialite))
is the reference in the event of any discrepancy.*

*Last updated: 24 November 2026*

OhMyWind is an open-source sailing passage planner, available at
[ohmywind.fr](https://ohmywind.fr) and as a mobile application. The data controller is
the association Libramer (non-profit association under the French law of 1901, RNA
W751285736), whose registered office is at 51 rue Fondary, 75015 Paris, France. For any question relating to this policy:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

The general principle: **OhMyWind keeps no file on you**. There is no user account, no
database and no audience measurement tool. What the application sends is used to answer
the request in progress; the only traces are technical logs, described below.

## What the application does not do

- No account, no sign-up, no identifier.
- No tracking cookies, no advertising trackers.
- No analytics, audience measurement or crash reporting SDK.
- No sale or commercial sharing of data, to anyone whatsoever.

## Data processed

### Geographic location

If you allow it, your location is used to centre the map, to display the forecasts at
that spot and to rank nearby places when you search. It is transmitted to the services
listed below for the time it takes to answer the request. It is kept in no database; its
coordinates may appear, for 7 days at most, in the technical log of the relay described
below. The permission is optional and can be revoked at any time in the settings of
your browser or of your phone.

### Passage plans and settings

Your spots, waypoints, boat polars and preferences are stored **locally on your
device** (local storage of the browser or of the application). Clearing the site data
in your browser (or the application data in your phone's settings) deletes everything.

What leaves your device, and why:

- **A place opened on the map**, or your location if you have allowed it: its
  coordinates are sent to Open-Meteo for the forecasts, and to the OhMyWind backend for
  the coastline, the tide and the currents.
- **A waypoint**, as soon as it is placed on the planner map: its coordinates are sent
  to EMODnet to display the sounding.
- **A route you estimate or compare**: its coordinates are sent to Open-Meteo and to
  the OhMyWind backend for the forecasts, the tide and the currents along the route. For
  a passage estimate, the backend also receives the departure or arrival date, the boat
  (boat type or polar), the performance coefficient and the models chosen, and performs
  the calculation in memory.

## Technical logs

The OhMyWind backend writes one line per request: the method, the path without its
parameters (for example `/api/v1/passage`), the status of the response, its duration,
its size, and a short fingerprint computed from the caller's address, used only to spot
abuse. It never writes an IP address, coordinates, search text or a route there. To
limit the number of requests per minute, the address is kept in memory for the duration of that limit, without being written anywhere.

The relay placed in front of the backend, operated by Cloudflare, keeps a technical log
of each request for 7 days at most: the web address requested, in full, and technical
information about the caller provided by Cloudflare, which may include its IP address.
For coastline, tide and current requests around a place, this web address contains the
coordinates of the place. The content of the requests is not in it: the waypoints, date
and boat of an estimate never appear there. This log is used to diagnose outages and
for nothing else; it erases itself.

## Third-party services

In order to work, the application relies on the following services. As with any
Internet request, each of them sees your IP address; the table states the application
data transmitted in addition.

| Service | Data transmitted | Purpose |
| --- | --- | --- |
| [Cloudflare](https://www.cloudflare.com/privacypolicy/) | Requests to the site and to the OhMyWind backend; log of the relayed requests, 7 days at most (see "Technical logs") | Hosting of the site; relay to the backend |
| OhMyWind backend, hosted by [Hugging Face](https://huggingface.co/privacy) | Coordinates of the places opened and of the routes consulted; for an estimate, waypoints, date, boat and settings | Coastline, tide and currents; passage plan calculation |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordinates of the places and routes consulted; text of your place searches, if Photon does not answer | Wind, wave and tide forecasts; fallback place search |
| [Photon (Komoot)](https://photon.komoot.io) | Text of your place searches and, when known, a rounded position (yours if you have allowed it, or a point of the map displayed) | Place search, ranked by proximity |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordinates of the point where you create a spot; map area displayed, on the rare devices that cannot display the usual base map | Name of the place (reverse geocoding); fallback base map |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Map area displayed | Base maps (tiles) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Map area displayed, when the sea-mark layer is on | Sea-mark overlay (buoys, beacons, lighthouses) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Coordinates of your waypoints | Sounding (depth) under each waypoint |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nothing, unless you deliberately click the support link | Donations |

These services are independent technical processors, governed by their own privacy
policies (links in the table). Some of them are operated by companies established
outside the European Union, notably Cloudflare and Hugging Face, in the United States.

The fonts are served from ohmywind.fr: displaying a page sends no request to Google
Fonts, and therefore no IP address.

## Mobile application permissions

The mobile application requests a single permission: **location**, delegated to the
website for the uses described above. It is optional: the application works without it,
in which case you simply search for a place manually.

## Your rights

In accordance with the GDPR, you have rights of access, rectification, objection and
erasure. As OhMyWind keeps no account and no file on you, and the relay's log
erases itself within 7 days at most, the essential part is exercised directly on your device: clear the site data or the
application data. For any question or request:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Changes to this policy

Any modification will be published on this page, with the date at the top of the
document updated accordingly.
