## Eine einfache Frage: Wann losfahren?

Navigations-Apps können oft sehr viel und kosten viel, für Bedürfnisse, die einfach bleiben. OhMyWind geht von der Praxis aus: Für einen Tagestörn oder eine kurze Überfahrt braucht man kein vollständiges Wetterrouting, sondern muss wissen, welches Abfahrtsfenster das richtige ist.

Man [zeichnet die Route](/plan), wählt einen Bootstyp, und OhMyWind berechnet für jede mögliche Abfahrtsstunde:

- die Dauer und die Ankunftszeit, Etappe für Etappe, aus den Polaren des Boots;
- Wind, Seegang und Strömung auf jedem Abschnitt;
- eine Komplexitätsnote von 1 bis 5, mit konkreten Warnungen (frischer Wind, grobe See, Wind gegen Strom).

Die Abfahrtsfenster lassen sich auf einen Blick vergleichen, ebenso mehrere Routen für dieselbe Überfahrt. Die Seite [Meine Spots vergleichen](/comparer) stellt außerdem die Lieblingsspots Stunde für Stunde nebeneinander.

## In KI-Assistenten: ein Gespräch unter Seglern

OhMyWind lässt sich über das offene Protokoll [MCP](https://modelcontextprotocol.io) an KI-Assistenten anbinden (Claude, ChatGPT, Le Chat…). Man beschreibt den Törn wie einem Crewmitglied, „morgen von Marseille nach Porquerolles mit einer Sun Odyssey 36, wann soll ich los?“, und der Assistent fragt OhMyWind, um zu antworten. Version 1.10, veröffentlicht am 17. Oktober 2026, macht daraus ein echtes Bordwerkzeug:

- **Ein Törn in einer einzigen Ansicht**: zuerst die Liste der möglichen Abfahrten, dann die Route auf einer Karte und das Detail Abschnitt für Abschnitt für die gewählte Abfahrt, direkt im Gespräch angezeigt bei Assistenten, die das unterstützen, etwa Claude und ChatGPT. Anderswo öffnet ein Link denselben Plan auf ohmywind.fr.
- **Gezeitenfragen, ohne einen Törn zu planen**: die Uhrzeit des Stillwassers an der Einfahrt einer Engstelle, Stärke und Richtung des Stroms, Hoch- und Niedrigwasser, der Gezeitenkoeffizient.
- **Zwei Varianten in einer einzigen Anfrage verglichen**: nördlich oder südlich um eine Insel, zum einen oder zum anderen Ziel, Abfahrt für Abfahrt.
- **Antworten in Bordzeit**: in der Ortszeit des Seglers, mit Wochentag, kürzer und damit schneller.
- **Eine Route über Land wird abgelehnt**, bevor gerechnet wird, und der Assistent wird gebeten, sie auf See neu zu zeichnen.

Die Verbindung dauert eine Minute, ohne OhMyWind-Konto und ohne API-Schlüssel: einfach der [Schritt-für-Schritt-Anleitung](https://mcp.ohmywind.fr) mit der Adresse `https://mcp.ohmywind.fr/mcp` folgen. Alle Änderungen stehen in den [Neuigkeiten](/a-propos/nouveautes).

## Gezeitenströme, ernst genommen

Die Gezeitenströme werden für einen großen Teil der europäischen Gewässer berechnet: Ärmelkanal, Golf von Biskaya, Nordsee, Deutsche Bucht und Elbe. An jedem Ort nutzt OhMyWind den genauesten verfügbaren Gezeitenatlas öffentlicher Herausgeber (SHOM, Ifremer, BSH, Copernicus). Diese Daten wurden mit realen Messungen von Küstenradaren abgeglichen.

Wo es keine verlässliche Quelle gibt, etwa in manchen engen Durchfahrten, die die Modelle nicht auflösen, zeigt die App „Strömung unbekannt“ statt einer irreführenden Zahl. Eine [Abdeckungskarte](/methodologie/courants) auf der Website zeigt Punkt für Punkt, welche Quelle verwendet wird.

## Die besten öffentlichen Wettermodelle, nach Wahl

OhMyWind bündelt die maßgeblichen öffentlichen Wettermodelle: AROME von Météo-France (Gitter von 1,3 km), ICON-EU, ECMWF und GFS. Man wählt das Modell selbst oder überlässt dem Werkzeug das genaueste für das jeweilige Revier. Quellen, Berechnungen und Grenzen sind in der [Methodik](/methodologie) beschrieben.

## Überall verfügbar

- Im Web, ohne Installation: [ohmywind.fr](/)
- Auf Android, über den [Google Play Store](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- In fünf Sprachen: Französisch, Englisch, Deutsch, Spanisch und Italienisch
- In MCP-fähigen KI-Assistenten wie Claude, ChatGPT oder Le Chat

## Ein offenes Projekt, getragen von einem Verein

OhMyWind wird von Quentin Donnars entwickelt, Ingenieur (Arts et Métiers), Data Scientist und Segellehrer. Getragen wird das Projekt von Libramer, einem Verein ohne Erwerbszweck nach dem französischen Vereinsgesetz von 1901, dessen Ziel es ist, öffentliche Daten für Segler nutzbar zu machen und langfristig eine genossenschaftliche Datenbank der Gezeitenströme aufzubauen.

Der [Quellcode ist öffentlich](https://github.com/qdonnars/ohmywind) ([AGPL-Lizenz](https://github.com/qdonnars/ohmywind/blob/main/LICENSE)). Die Finanzierung beruht auf dem Sponsoring durch Marken aus dem Wassersport, ohne jeden Einfluss auf die Berechnungen oder die Empfehlungen des Werkzeugs.

> „Die öffentlichen Wetter- und Meeresdaten sind von bemerkenswerter Qualität, für Freizeitsegler aber schwer zugänglich. OhMyWind stellt sie in den Dienst einer ganz konkreten Frage: Wann losfahren, damit der Törn gut verläuft?“
>
> Quentin Donnars, Gründer von OhMyWind

## Was OhMyWind nicht ist

OhMyWind ist eine Entscheidungshilfe. Es ersetzt weder den amtlichen Seewetterbericht noch aktuelle Seekarten noch das Urteil des Skippers, der allein für seinen Törn verantwortlich bleibt.

## In der Presse

[BOOTE](https://www.boote-magazin.de/ausruestung/technik/ohmywind-wetterrouting-open-source/), YACHT, [Bateaux.com](https://www.boote.com/artikel/52477/ohmywind-das-open-source-projekt-das-die-vorbereitung-einer-segeltour-neu-konzipieren-will) (auf Deutsch bei boote.com, sowie auf Französisch, Englisch, Spanisch und Italienisch). Alle Artikel finden Sie im [Pressespiegel](/presse).

## Pressekontakt

Quentin Donnars, Gründer: [contact@ohmywind.fr](mailto:contact@ohmywind.fr)

Bildmaterial (Logo, Bildschirmfotos) auf Anfrage.

## Nützliche Links

- **Web-App**: [ohmywind.fr](/)
- **Einen Törn planen**: [ohmywind.fr/plan](/plan)
- **Lieblingsspots vergleichen**: [ohmywind.fr/comparer](/comparer)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- **Methodik**: [ohmywind.fr/methodologie](/methodologie)
- **Karte der Gezeitenströme**: [ohmywind.fr/methodologie/courants](/methodologie/courants)
- **Neuigkeiten (Version 1.10 und frühere)**: [ohmywind.fr/a-propos/nouveautes](/a-propos/nouveautes)
- **MCP-Server**: `https://mcp.ohmywind.fr/mcp`
- **Anleitung zur Verbindung mit KI-Assistenten (Claude, ChatGPT, Le Chat)**: [mcp.ohmywind.fr](https://mcp.ohmywind.fr) (auf Englisch)
- **Demovideos**: [ohmywind.fr/youtube](https://ohmywind.fr/youtube)
- **Andere MCP-Clients (Cursor, VS Code, Goose…)**: [Schnellstart](https://github.com/qdonnars/ohmywind#try-it-in-30-seconds) (auf Englisch)
- **MCP-Protokoll**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Quellcode**: [github.com/qdonnars/ohmywind](https://github.com/qdonnars/ohmywind)
- **Cap Innovation, Paris Nautic Show 2026**: [parisnauticshow.com/cap-innovation](https://www.parisnauticshow.com/cap-innovation/) (auf Französisch)
- **Pressespiegel**: [ohmywind.fr/presse](/presse)
- **Datenschutz**: [ohmywind.fr/confidentialite](/confidentialite)
- **Verein**: Libramer, Verein ohne Erwerbszweck nach dem französischen Vereinsgesetz von 1901
