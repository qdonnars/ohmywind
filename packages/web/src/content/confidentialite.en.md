# Privacy policy

*This page is a translation. The French version ([/confidentialite](/confidentialite))
is the reference in the event of any discrepancy.*

*Last updated: 12 September 2026*

OhMyWind is an open-source sailing passage planner, available at
[ohmywind.fr](https://ohmywind.fr) and as an Android application. The data controller
is the association Libramer (non-profit association under the French law of 1901, RNA
W751285736), whose registered office is at 51 rue Fondary, 75015 Paris, France. The
Android application is published and distributed on Google Play by Quentin Donnars. For
any question relating to this policy: [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

The general principle: **OhMyWind has no user accounts, no database and no audience
measurement tool**. No personal data is kept on OhMyWind servers.

## What the application does not do

- No account, no sign-up, no identifier.
- No tracking cookies, no advertising trackers.
- No analytics, audience measurement or crash reporting SDK.
- No sale or commercial sharing of data, to anyone whatsoever.

## Data processed

### Geographic location

If you allow it, your location is used only to centre the map and to obtain the
forecasts near you. It is transmitted to the weather and mapping services listed below
for the time it takes to answer the request, and is never recorded by OhMyWind. The
permission is optional and can be revoked at any time in the settings of your browser
or of Android.

### Passage plans and settings

Your waypoints, boat polars and preferences are stored **locally on your device**
(local storage of the browser or of the application). Only the coordinates of the
waypoints leave your device: as soon as a waypoint is placed on the planner map, they
are sent to EMODnet to display the sounding; when you start a passage estimate, they
are sent to the OhMyWind backend (hosted on Hugging Face) to perform the calculation,
processed in memory, then forgotten. Clearing the site data in your browser (or the
application data in Android) deletes everything.

## Third-party services

In order to work, the application calls the following services directly from your
device. As with any Internet request, each of them sees your IP address; the table
states the application data transmitted in addition.

| Service | Data transmitted | Purpose |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Geographic coordinates consulted | Wind, wave and tide forecasts; geocoding |
| OhMyWind backend, hosted by [Hugging Face](https://huggingface.co/privacy) | Coordinates and waypoints | Passage plan calculation |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Geographic coordinates | Reverse geocoding (name of the place displayed) |
| [Photon (Komoot)](https://photon.komoot.io) | Text of your place searches | Place search |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Map area displayed | Base maps (tiles) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Map area displayed, when the sea-mark layer is on | Sea-mark overlay (buoys, beacons, lighthouses) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Coordinates of your waypoints | Sounding (depth) under each waypoint |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nothing, unless you deliberately click the support link | Donations |

These services are independent technical processors, governed by their own privacy
policies (links in the table).

The fonts are served from ohmywind.fr: displaying a page sends no request to Google
Fonts, and therefore no IP address.

## Android permissions

The Android application requests a single permission: **location**, delegated to the
website for the uses described above. It is optional: the application works without it,
in which case you simply search for a place manually.

## Your rights

In accordance with the GDPR, you have rights of access, rectification, objection and
erasure. As OhMyWind keeps no personal data on the server side, the essential part is
exercised directly on your device: clear the site data or the application data. For any
question or request: [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Changes to this policy

Any modification will be published on this page, with the date at the top of the
document updated accordingly.
