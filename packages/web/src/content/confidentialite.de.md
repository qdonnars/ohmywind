# Datenschutzerklärung

*Diese Seite ist eine Übersetzung. Maßgeblich ist im Fall von Abweichungen die
französische Fassung ([/confidentialite](/confidentialite)).*

*Letzte Aktualisierung: 24. November 2026*

OhMyWind ist ein quelloffener Planer für Segeltörns, verfügbar unter
[ohmywind.fr](https://ohmywind.fr) und als mobile Anwendung. Verantwortlicher für die
Verarbeitung ist der Verein Libramer (Verein ohne Erwerbszweck nach dem französischen
Vereinsgesetz von 1901, RNA W751285736) mit Sitz in 51 rue Fondary, 75015 Paris,
Frankreich. Bei Fragen zu dieser Erklärung:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

Der Grundsatz: **OhMyWind führt keine Akte über Sie**. Es gibt weder Benutzerkonten
noch eine Datenbank noch ein Werkzeug zur Reichweitenmessung. Was die Anwendung sendet,
dient der Beantwortung der laufenden Anfrage; die einzigen Spuren sind technische
Protokolle, die weiter unten beschrieben sind.

## Was die Anwendung nicht tut

- Kein Konto, keine Registrierung, keine Kennung.
- Keine Tracking-Cookies, keine Werbetracker.
- Kein SDK für Analytik, Reichweitenmessung oder Absturzberichte.
- Kein Verkauf und keine kommerzielle Weitergabe von Daten, an niemanden.

## Verarbeitete Daten

### Geografischer Standort

Wenn Sie es erlauben, dient Ihr Standort dazu, die Karte zu zentrieren, die Vorhersagen
an diesem Ort anzuzeigen und bei einer Suche nahe gelegene Orte nach vorne zu reihen. Er
wird für die Dauer der Beantwortung der Anfrage an die unten aufgeführten Dienste
übermittelt. Er wird in keiner Datenbank aufbewahrt; seine Koordinaten können
höchstens 7 Tage lang im technischen Protokoll der weiter unten beschriebenen
Weiterleitung stehen. Die Berechtigung ist optional und
jederzeit in den Einstellungen Ihres Browsers oder Ihres Telefons widerrufbar.

### Törnpläne und Einstellungen

Ihre Spots, Wegpunkte, Bootspolaren und Einstellungen werden **lokal auf Ihrem Gerät**
gespeichert (lokaler Speicher des Browsers oder der Anwendung). Das Löschen der
Website-Daten in Ihrem Browser (oder der Anwendungsdaten in den Einstellungen Ihres
Telefons) entfernt alles.

Was Ihr Gerät verlässt, und wozu:

- **Ein auf der Karte geöffneter Ort**, oder Ihr Standort, wenn Sie ihn freigegeben
  haben: Seine Koordinaten werden an Open-Meteo für die Vorhersagen gesendet und an das
  OhMyWind-Backend für Küstenlinie, Gezeiten und Strömungen.
- **Ein Wegpunkt**, sobald er auf der Planerkarte gesetzt wird: Seine Koordinaten werden
  an EMODnet gesendet, um die Wassertiefe anzuzeigen.
- **Eine Route, die Sie berechnen oder vergleichen**: Ihre Koordinaten werden an
  Open-Meteo und an das OhMyWind-Backend gesendet, für Vorhersagen, Gezeiten und
  Strömungen entlang der Strecke. Für eine Passageberechnung erhält das Backend außerdem
  das Abfahrts- oder Ankunftsdatum, das Boot (Bootstyp oder Polare), den Leistungsfaktor
  und die gewählten Modelle und führt die Berechnung im Arbeitsspeicher durch.

## Technische Protokolle

Das OhMyWind-Backend schreibt eine Zeile pro Anfrage: die Methode, den Pfad ohne seine
Parameter (zum Beispiel `/api/v1/passage`), den Status der Antwort, ihre Dauer, ihre
Größe und einen kurzen Fingerabdruck, der aus der Adresse des Aufrufers berechnet wird
und nur dazu dient, Missbrauch zu erkennen. Es schreibt dort niemals eine IP-Adresse,
Koordinaten, Suchtext oder eine Route. Um die Zahl der Anfragen pro Minute zu begrenzen,
wird die Adresse für die Dauer dieser Begrenzung im Arbeitsspeicher gehalten, ohne
irgendwo geschrieben zu werden.

Die dem Backend vorgeschaltete Weiterleitung, betrieben von Cloudflare, führt höchstens
7 Tage lang ein technisches Protokoll jeder Anfrage: die vollständige aufgerufene
Webadresse und technische Angaben zum Aufrufer, die Cloudflare liefert und die seine
IP-Adresse enthalten können. Bei Anfragen zu Küstenlinie, Gezeiten und Strömungen rund
um einen Ort enthält diese Webadresse die Koordinaten des Orts. Der Inhalt der Anfragen
steht nicht darin: Wegpunkte, Datum und Boot einer Berechnung erscheinen dort nie. Dieses
Protokoll dient der Fehlerdiagnose und wird für nichts anderes verwendet; es löscht sich
von selbst.

## Drittdienste

Für ihren Betrieb nutzt die Anwendung die folgenden Dienste. Wie bei jeder
Internetanfrage sieht jeder von ihnen Ihre IP-Adresse; die Tabelle nennt die darüber
hinaus übermittelten Anwendungsdaten.

| Dienst | Übermittelte Daten | Zweck |
| --- | --- | --- |
| [Cloudflare](https://www.cloudflare.com/privacypolicy/) | Anfragen an die Website und an das OhMyWind-Backend; Protokoll der weitergeleiteten Anfragen, höchstens 7 Tage (siehe „Technische Protokolle“) | Hosting der Website; Weiterleitung an das Backend |
| OhMyWind-Backend, gehostet von [Hugging Face](https://huggingface.co/privacy) | Koordinaten der geöffneten Orte und der abgefragten Routen; bei einer Berechnung Wegpunkte, Datum, Boot und Einstellungen | Küstenlinie, Gezeiten und Strömungen; Berechnung des Passageplans |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Koordinaten der abgefragten Orte und Routen; Text Ihrer Ortssuchen, wenn Photon nicht antwortet | Vorhersagen zu Wind, Wellen und Gezeiten; Ersatz für die Ortssuche |
| [Photon (Komoot)](https://photon.komoot.io) | Text Ihrer Ortssuchen und, sofern bekannt, eine gerundete Position (Ihre, wenn Sie sie freigegeben haben, oder ein Punkt der angezeigten Karte) | Ortssuche, nach Nähe sortiert |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Koordinaten des Punkts, an dem Sie einen Spot anlegen; angezeigter Kartenausschnitt, auf den seltenen Geräten, die den üblichen Kartenhintergrund nicht darstellen können | Ortsname (umgekehrte Geokodierung); Ersatz-Kartenhintergrund |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Angezeigter Kartenausschnitt | Kartenhintergründe (Kacheln) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Angezeigter Kartenausschnitt, wenn die Seezeichen-Ebene aktiv ist | Seezeichen-Overlay (Tonnen, Baken, Leuchttürme) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Koordinaten Ihrer Wegpunkte | Wassertiefe unter jedem Wegpunkt |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nichts, außer wenn Sie bewusst auf den Unterstützungslink klicken | Spenden |

Diese Dienste sind unabhängige technische Auftragsverarbeiter und unterliegen ihren
eigenen Datenschutzerklärungen (Links in der Tabelle). Einige werden von Unternehmen
mit Sitz außerhalb der Europäischen Union betrieben, insbesondere Cloudflare und Hugging
Face in den Vereinigten Staaten.

Die Schriftarten werden von ohmywind.fr ausgeliefert: Das Anzeigen einer Seite sendet
keine Anfrage an Google Fonts und damit auch keine IP-Adresse.

## Berechtigungen der mobilen Anwendung

Die mobile Anwendung verlangt eine einzige Berechtigung: den **Standort**, der für die
oben beschriebenen Zwecke an die Website delegiert wird. Sie ist optional: Die
Anwendung funktioniert auch ohne sie, dann genügt es, einen Ort manuell zu suchen.

## Ihre Rechte

Gemäß der DSGVO haben Sie Rechte auf Auskunft, Berichtigung, Widerspruch und Löschung.
Da OhMyWind weder ein Konto noch eine Akte über Sie führt und sich das
Protokoll der Weiterleitung nach höchstens 7 Tagen von selbst löscht, wird das Wesentliche unmittelbar auf Ihrem Gerät ausgeübt: Löschen Sie die
Website-Daten oder die Anwendungsdaten. Bei Fragen oder Anliegen:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Änderungen dieser Erklärung

Jede Änderung wird auf dieser Seite veröffentlicht, zusammen mit einer Aktualisierung
des Datums am Anfang des Dokuments.
