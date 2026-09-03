# Datenschutzerklärung

*Diese Seite ist eine Übersetzung. Maßgeblich ist im Fall von Abweichungen die
französische Fassung ([/confidentialite](/confidentialite)).*

*Letzte Aktualisierung: 2. September 2026*

OhMyWind ist ein quelloffener Planer für Segeltörns, verfügbar unter
[ohmywind.fr](https://ohmywind.fr) und als Android-Anwendung. Herausgegeben wird er
privat und nicht gewerblich von Tinqueen. Bei Fragen zu dieser Erklärung:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

Der Grundsatz: **OhMyWind hat weder Benutzerkonten noch eine Datenbank noch ein
Werkzeug zur Reichweitenmessung**. Auf Servern von OhMyWind werden keine
personenbezogenen Daten aufbewahrt.

## Was die Anwendung nicht tut

- Kein Konto, keine Registrierung, keine Kennung.
- Keine Tracking-Cookies, keine Werbetracker.
- Kein SDK für Analytik, Reichweitenmessung oder Absturzberichte.
- Kein Verkauf und keine kommerzielle Weitergabe von Daten, an niemanden.

## Verarbeitete Daten

### Geografischer Standort

Wenn Sie es erlauben, dient Ihr Standort ausschließlich dazu, die Karte zu zentrieren
und die Vorhersagen in Ihrer Nähe abzurufen. Er wird für die Dauer der Beantwortung der
Anfrage an die unten aufgeführten Wetter- und Kartendienste übermittelt und von
OhMyWind niemals gespeichert. Die Berechtigung ist optional und jederzeit in den
Einstellungen Ihres Browsers oder von Android widerrufbar.

### Törnpläne und Einstellungen

Ihre Wegpunkte, Bootspolaren und Einstellungen werden **lokal auf Ihrem Gerät**
gespeichert (lokaler Speicher des Browsers oder der Anwendung). Sie verlassen Ihr Gerät
nur dann, wenn Sie eine Passageberechnung starten: Die Koordinaten der Wegpunkte werden
dann an das OhMyWind-Backend (gehostet bei Hugging Face) gesendet, um die Berechnung
durchzuführen, im Arbeitsspeicher verarbeitet und anschließend vergessen. Das Löschen
der Website-Daten in Ihrem Browser (oder der Anwendungsdaten unter Android) entfernt
alles.

## Drittdienste

Für ihren Betrieb ruft die Anwendung die folgenden Dienste direkt von Ihrem Gerät aus
auf. Wie bei jeder Internetanfrage sieht jeder von ihnen Ihre IP-Adresse; die Tabelle
nennt die darüber hinaus übermittelten Anwendungsdaten.

| Dienst | Übermittelte Daten | Zweck |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Abgefragte geografische Koordinaten | Vorhersagen zu Wind, Wellen und Gezeiten; Geokodierung |
| OhMyWind-Backend, gehostet von [Hugging Face](https://huggingface.co/privacy) | Koordinaten und Wegpunkte | Berechnung des Passageplans |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Geografische Koordinaten | Umgekehrte Geokodierung (angezeigter Ortsname) |
| [Photon (Komoot)](https://photon.komoot.io) | Text Ihrer Ortssuchen | Ortssuche |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Angezeigter Kartenausschnitt | Kartenhintergründe (Kacheln) |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nichts, außer wenn Sie bewusst auf den Unterstützungslink klicken | Spenden |

Diese Dienste sind unabhängige technische Auftragsverarbeiter und unterliegen ihren
eigenen Datenschutzerklärungen (Links in der Tabelle).

Die Schriftarten werden von ohmywind.fr ausgeliefert: Das Anzeigen einer Seite sendet
keine Anfrage an Google Fonts und damit auch keine IP-Adresse.

## Android-Berechtigungen

Die Android-Anwendung verlangt eine einzige Berechtigung: den **Standort**, der für die
oben beschriebenen Zwecke an die Website delegiert wird. Sie ist optional: Die
Anwendung funktioniert auch ohne sie, dann genügt es, einen Ort manuell zu suchen.

## Ihre Rechte

Gemäß der DSGVO haben Sie Rechte auf Auskunft, Berichtigung, Widerspruch und Löschung.
Da OhMyWind serverseitig keine personenbezogenen Daten aufbewahrt, wird das Wesentliche
unmittelbar auf Ihrem Gerät ausgeübt: Löschen Sie die Website-Daten oder die
Anwendungsdaten. Bei Fragen oder Anliegen:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Änderungen dieser Erklärung

Jede Änderung wird auf dieser Seite veröffentlicht, zusammen mit einer Aktualisierung
des Datums am Anfang des Dokuments.
