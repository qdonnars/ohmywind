# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The landing page's words, one dictionary per language.

``static/landing.html`` holds the layout and a ``{{t:<key>}}`` slot for every
piece of text; this module fills them. English is the reference: every other
language carries exactly its keys, and ``routes/landing.py`` refuses to import
otherwise, so a missing or stray translation cannot ship.

Values are HTML fragments. The links they carry come from the ``_A_*``
openers below rather than being typed five times, which is what keeps the
same links in every language (``tests/test_landing.py`` checks it on the
rendered pages).

Interface labels of the assistants (Vibe, Mistral's former Le Chat) are the ones
their users see in that language, taken from each vendor's localized help.
A label that could not be checked in a language stays in English, quoted,
with ``lang="en"`` (see ``_en_label``), rather than being translated by hand
into something the reader will not find on screen.

House rules for every language: no em dash, the formal register (vous, Sie,
usted; the impersonal infinitive in Italian, as in the web app), wind speeds
in knots.
"""

from __future__ import annotations

_BLANK = 'target="_blank" rel="noopener"'
_A_YOUTUBE = f'<a href="https://ohmywind.fr/youtube" {_BLANK}>'
_A_MISTRAL = f'<a href="https://chat.mistral.ai" {_BLANK}>'
_A_APPS_SPEC = f'<a href="https://modelcontextprotocol.io/extensions/client-matrix" {_BLANK}>'
_A_SITE = '<a href="https://ohmywind.fr">'
_A_PLAN = '<a href="https://ohmywind.fr/plan">'
_A_OPEN_METEO = '<a href="https://open-meteo.com">'
_A_GITHUB = '<a href="https://github.com/qdonnars/ohmywind">'

_TOOLS = (
    "<code>list_boat_archetypes</code>, <code>get_marine_forecast</code>, "
    "<code>get_tidal_stream</code>, <code>read_me</code>"
)

# The name each language goes by in the picker, written in that language.
LANGUAGE_NAMES = {
    "en": "English",
    "fr": "Français",
    "de": "Deutsch",
    "it": "Italiano",
    "es": "Español",
}

_QUOTES = {
    "fr": ("«\u00a0", "\u00a0»"),
    "de": ("„", "“"),
    "it": ("«", "»"),
    "es": ("«", "»"),
}


def _en_label(lang: str, label: str) -> str:
    """An interface label left in English, quoted the way ``lang`` quotes."""
    opening, closing = _QUOTES[lang]
    return f'{opening}<strong lang="en">{label}</strong>{closing}'


def _fr(label: str) -> str:
    return _en_label("fr", label)


def _de(label: str) -> str:
    return _en_label("de", label)


def _it(label: str) -> str:
    return _en_label("it", label)


def _es(label: str) -> str:
    return _en_label("es", label)


EN = {
    "title": "OhMyWind MCP : talk to your LLM, cast off with confidence",
    "meta_description": "OhMyWind MCP. Free, keyless sailing passage planner for any coast, with high-precision tides on the French Atlantic.",
    "og_description": "Talk to your LLM. Cast off with confidence. Free, keyless sailing planner via MCP.",
    "language_nav": "Language",
    "badge": "running",
    "lede_tagline": "Talk to your LLM. Cast off with confidence.",
    "lede_body": "A free, keyless, open-source sailing planner for any coast, with high-precision tidal currents on the French Atlantic. Exposed as an MCP server so any compatible assistant can use it.",
    "video_label": "Play the demo video, in French (loads the YouTube player)",
    "video_alt": "Le Four ou le Fromveur ? A passage from L'Aber Wrac'h to Camaret drawn on a chart of the Iroise sea.",
    "video_caption": "A real session, in French: tomorrow, L&rsquo;Aber Wrac&rsquo;h to Camaret, through the Chenal du Four or the Fromveur? The assistant compares both routes departure by departure and, with a gale on the way, says to stay in port. Only the waiting is sped up. The YouTube player loads when you press play.",
    "video_more": f"More demos on the {_A_YOUTUBE}OhMyWind YouTube channel</a>.",
    "video_frame_title": "OhMyWind demo video",
    "connect_title": "Connect it to your assistant",
    "connect_intro": "Pick yours below (under a minute, no install, no API key).",
    "claude_cta": "Add to Claude",
    "chatgpt_cta": "Add to ChatGPT",
    "vibe_cta": "Connect to Vibe: show the steps",
    "vibe_step_open": f"Open {_A_MISTRAL}chat.mistral.ai</a> and sign in.",
    "vibe_step_menu": "In the left sidebar, open <strong>Intelligence</strong> &rarr; <strong>Connecteurs</strong> (in English: <strong>Intelligence</strong> &rarr; <strong>Connectors</strong>), then click <strong>Add MCP server</strong>.",
    "vibe_step_name": "Set <strong>Name</strong>: <code>OhMyWind</code> &middot; <strong>Auth</strong>: <code>None</code>.",
    "vibe_step_url": "Paste this in <strong>URL</strong>:",
    "vibe_step_enable": "Save, then enable the OhMyWind toggle inside any conversation.",
    "vibe_step_apps": f"Vibe doesn&rsquo;t (yet) support the MCP Apps spec, so the widget won&rsquo;t render inline: the assistant will hand you an {_A_SITE}ohmywind.fr</a> deep-link instead.",
    "other_assistant": "Another assistant? Give it this MCP server address:",
    "ask_title": "Then ask, in your own words",
    "ask_example": "I'm leaving Marseille tomorrow morning for Porquerolles on a Sun Odyssey 36. How long is the passage and how tricky is it?",
    "ask_body": f"Your assistant calls the OhMyWind tools and answers in plain language. On hosts that support the {_A_APPS_SPEC}MCP Apps spec</a> (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam), the live {_A_SITE}ohmywind.fr</a> plan view also renders inline as a sandboxed iframe. On hosts that don&rsquo;t (Cursor, Vibe, terminal), the assistant hands you the same plan as a deep-link instead.",
    "ask_window_intro": "Or to compare a whole weekend&rsquo;s worth of departure windows in one shot:",
    "ask_window_example": "Marseille &rarr; Porquerolles, same boat. Show me the calmest departure between Saturday morning and Monday evening.",
    "why_title": "Why OhMyWind",
    "perk_free": f"<strong>Free &amp; keyless.</strong> Wind + sea via {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0).",
    "perk_models": "<strong>Mediterranean-tuned.</strong> AROME 1.3 km by default; ICON-EU &rarr; ECMWF &rarr; GFS for longer reach.",
    "perk_boats": "<strong>Boat-aware.</strong> Eight archetypes from a 16 ft sail-and-oar dinghy to 50 ft cruisers, real polars, an <code>efficiency</code> parameter for trim and crew level.",
    "perk_windows": "<strong>Window-aware.</strong> One call sweeps up to 14 days of hourly departures so the LLM can pick the calmest slot.",
    "perk_clients": "<strong>Client-agnostic.</strong> One HTTP MCP endpoint. No vendor lock-in.",
    "perk_open_source": "<strong>Open source, AGPL.</strong> Self-host on Fly, Modal, your VPS.",
    "tools_title": "Five tools",
    "tools_body": f"The workhorse is <code>plan_passage</code>: one call returns timing, a 1-5 complexity score, and an {_A_SITE}ohmywind.fr</a> deep-link. It declares an MCP Apps UI resource, so supporting hosts also render the live plan view in a sandboxed iframe. Pass <code>latest_departure</code> and it walks every hourly window up to 14 days out so the LLM can compare side-by-side. The other four tools ({_TOOLS}) let the assistant pick a boat, sample the forecast at a point, read the tidal stream through a pass, or explain the math behind a result.",
    "tools_by_hand": f"Don&rsquo;t want to wire an MCP host? You can also drive everything by hand at {_A_PLAN}ohmywind.fr/plan</a>: click your route, pick a boat, slide the departure.",
    "source_title": "Source",
    "source_body": f"Project site: {_A_SITE}ohmywind.fr</a> &middot; GitHub: {_A_GITHUB}qdonnars/ohmywind</a> (AGPL-3.0).",
    "footnote": "First request after inactivity may take a few seconds (HF Spaces cold-start).",
}

# Vibe's « Intelligence → Connecteurs » is the French interface the English
# page already quoted; the rest of Vibe stays in English.
FR = {
    "title": "OhMyWind MCP : parlez à votre LLM, larguez les amarres en confiance",
    "meta_description": "OhMyWind MCP. Planificateur de navigation gratuit et sans clé pour toutes les côtes, avec des marées de haute précision sur l'Atlantique français.",
    "og_description": "Parlez à votre LLM. Larguez les amarres en confiance. Planificateur de navigation gratuit et sans clé, via MCP.",
    "language_nav": "Langue",
    "badge": "en ligne",
    "lede_tagline": "Parlez à votre LLM. Larguez les amarres en confiance.",
    "lede_body": "Un planificateur de navigation gratuit, sans clé et open source pour toutes les côtes, avec des courants de marée de haute précision sur l'Atlantique français. Exposé comme serveur MCP, il est utilisable par tout assistant compatible.",
    "video_label": "Lancer la vidéo de démonstration, en français (charge le lecteur YouTube)",
    "video_alt": "Le Four ou le Fromveur ? Un trajet de L'Aber Wrac'h à Camaret tracé sur une carte de la mer d'Iroise.",
    "video_caption": "Une vraie session, en français : demain, de L'Aber Wrac'h à Camaret, par le chenal du Four ou par le Fromveur ? L'assistant compare les deux routes départ par départ et, avec un coup de vent annoncé, conseille de rester au port. Seule l'attente est accélérée. Le lecteur YouTube ne se charge que lorsque vous lancez la lecture.",
    "video_more": f"D'autres démos sur la {_A_YOUTUBE}chaîne YouTube d'OhMyWind</a>.",
    "video_frame_title": "Vidéo de démonstration d'OhMyWind",
    "connect_title": "Branchez-le sur votre assistant",
    "connect_intro": "Choisissez le vôtre ci-dessous (moins d'une minute, rien à installer, pas de clé d'API).",
    "claude_cta": "Ajouter à Claude",
    "chatgpt_cta": "Ajouter à ChatGPT",
    "vibe_cta": "Brancher sur Vibe : afficher les étapes",
    "vibe_step_open": f"Ouvrez {_A_MISTRAL}chat.mistral.ai</a> et connectez-vous.",
    "vibe_step_menu": f"Dans la barre latérale gauche, ouvrez <strong>Intelligence</strong> &rarr; <strong>Connecteurs</strong>, puis cliquez sur {_fr('Add MCP server')}.",
    "vibe_step_name": f"Renseignez {_fr('Name')} : <code>OhMyWind</code> &middot; {_fr('Auth')} : <code>None</code>.",
    "vibe_step_url": "Collez cette adresse dans le champ <strong>URL</strong> :",
    "vibe_step_enable": "Enregistrez, puis activez OhMyWind dans n'importe quelle conversation.",
    "vibe_step_apps": f"Vibe ne prend pas (encore) en charge la spécification MCP Apps, le widget ne s'affiche donc pas dans la conversation : l'assistant vous donne à la place un lien direct vers {_A_SITE}ohmywind.fr</a>.",
    "other_assistant": "Un autre assistant ? Donnez-lui cette adresse de serveur MCP :",
    "ask_title": "Puis demandez, avec vos mots",
    "ask_example": "Je pars de Marseille demain matin pour Porquerolles sur un Sun Odyssey 36. Combien de temps dure la traversée, et à quel point est-elle délicate ?",
    "ask_body": f"Votre assistant appelle les outils d'OhMyWind et vous répond en langage courant. Sur les clients compatibles avec la {_A_APPS_SPEC}spécification MCP Apps</a> (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam), la vue du plan d'{_A_SITE}ohmywind.fr</a> s'affiche aussi en direct dans la conversation, dans une iframe isolée. Sur les autres (Cursor, Vibe, terminal), l'assistant vous donne le même plan sous forme de lien direct.",
    "ask_window_intro": "Ou pour comparer d'un coup toutes les fenêtres de départ d'un week-end :",
    "ask_window_example": "Marseille &rarr; Porquerolles, même bateau. Quel est le départ le plus calme entre samedi matin et lundi soir ?",
    "why_title": "Pourquoi OhMyWind",
    "perk_free": f"<strong>Gratuit et sans clé.</strong> Vent et mer via {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0).",
    "perk_models": "<strong>Réglé pour la Méditerranée.</strong> AROME 1,3 km par défaut ; ICON-EU &rarr; ECMWF &rarr; GFS pour voir plus loin.",
    "perk_boats": "<strong>Selon votre bateau.</strong> Huit archétypes, du dériveur voile-aviron de 16 pieds aux croiseurs de 50 pieds, de vraies polaires et un paramètre <code>efficiency</code> pour le réglage et le niveau de l'équipage.",
    "perk_windows": "<strong>Selon la fenêtre.</strong> Un seul appel balaie jusqu'à 14 jours de départs heure par heure, pour que le LLM choisisse le créneau le plus calme.",
    "perk_clients": "<strong>Indépendant du client.</strong> Un seul point d'accès MCP en HTTP. Aucun enfermement chez un fournisseur.",
    "perk_open_source": "<strong>Open source, AGPL.</strong> Hébergez-le vous-même sur Fly, Modal ou votre VPS.",
    "tools_title": "Cinq outils",
    "tools_body": f"L'outil principal est <code>plan_passage</code> : un seul appel renvoie la durée, un score de complexité de 1 à 5 et un lien direct vers {_A_SITE}ohmywind.fr</a>. Il déclare une ressource d'interface MCP Apps, si bien que les clients compatibles affichent aussi la vue du plan en direct, dans une iframe isolée. Passez-lui <code>latest_departure</code> et il parcourt chaque créneau horaire jusqu'à 14 jours, pour que le LLM les compare côte à côte. Les quatre autres outils ({_TOOLS}) permettent à l'assistant de choisir un bateau, de lire la prévision en un point, de lire le courant de marée dans une passe ou d'expliquer le calcul derrière un résultat.",
    "tools_by_hand": f"Pas envie de brancher un client MCP ? Vous pouvez aussi tout faire à la main sur {_A_PLAN}ohmywind.fr/plan</a> : tracez votre route, choisissez un bateau, faites glisser le départ.",
    "source_title": "Code source",
    "source_body": f"Site du projet : {_A_SITE}ohmywind.fr</a> &middot; GitHub : {_A_GITHUB}qdonnars/ohmywind</a> (AGPL-3.0).",
    "footnote": "La première requête après une période d'inactivité peut prendre quelques secondes (démarrage à froid de HF Spaces).",
}

DE = {
    "title": "OhMyWind MCP: Sprechen Sie mit Ihrem LLM, legen Sie mit Zuversicht ab",
    "meta_description": "OhMyWind MCP. Kostenloser Törnplaner ohne Schlüssel für jede Küste, mit hochpräzisen Gezeiten an der französischen Atlantikküste.",
    "og_description": "Sprechen Sie mit Ihrem LLM. Legen Sie mit Zuversicht ab. Kostenloser Törnplaner ohne Schlüssel, über MCP.",
    "language_nav": "Sprache",
    "badge": "in Betrieb",
    "lede_tagline": "Sprechen Sie mit Ihrem LLM. Legen Sie mit Zuversicht ab.",
    "lede_body": "Ein kostenloser Open-Source-Törnplaner ohne Schlüssel für jede Küste, mit hochpräzisen Gezeitenströmen an der französischen Atlantikküste. Als MCP-Server bereitgestellt, damit jeder kompatible Assistent ihn nutzen kann.",
    "video_label": "Demovideo abspielen, auf Französisch (lädt den YouTube-Player)",
    "video_alt": "Le Four ou le Fromveur ? Ein Törn von L'Aber Wrac'h nach Camaret, eingezeichnet auf einer Karte der Iroise.",
    "video_caption": "Eine echte Sitzung, auf Französisch: morgen von L'Aber Wrac'h nach Camaret, durch den Chenal du Four oder den Fromveur? Der Assistent vergleicht beide Routen Abfahrt für Abfahrt und rät, da ein Sturm aufzieht, im Hafen zu bleiben. Nur das Warten ist beschleunigt. Der YouTube-Player lädt erst, wenn Sie auf Wiedergabe drücken.",
    "video_more": f"Weitere Demos auf dem {_A_YOUTUBE}YouTube-Kanal von OhMyWind</a>.",
    "video_frame_title": "Demovideo von OhMyWind",
    "connect_title": "Verbinden Sie es mit Ihrem Assistenten",
    "connect_intro": "Wählen Sie unten Ihren aus (unter einer Minute, keine Installation, kein API-Schlüssel).",
    "claude_cta": "Zu Claude hinzufügen",
    "chatgpt_cta": "Zu ChatGPT hinzufügen",
    "vibe_cta": "Mit Vibe verbinden: Schritte anzeigen",
    "vibe_step_open": f"Öffnen Sie {_A_MISTRAL}chat.mistral.ai</a> und melden Sie sich an.",
    "vibe_step_menu": f"Öffnen Sie in der linken Seitenleiste {_de('Intelligence')} &rarr; {_de('Connectors')} (in der französischen Oberfläche: Intelligence &rarr; Connecteurs) und klicken Sie dann auf {_de('Add MCP server')}.",
    "vibe_step_name": f"Tragen Sie ein: {_de('Name')}: <code>OhMyWind</code> &middot; {_de('Auth')}: <code>None</code>.",
    "vibe_step_url": "Fügen Sie diese Adresse in das Feld <strong>URL</strong> ein:",
    "vibe_step_enable": "Speichern Sie und aktivieren Sie OhMyWind dann in einem beliebigen Gespräch.",
    "vibe_step_apps": f"Vibe unterstützt die MCP-Apps-Spezifikation (noch) nicht, daher erscheint das Widget nicht im Gespräch: Der Assistent gibt Ihnen stattdessen einen Direktlink zu {_A_SITE}ohmywind.fr</a>.",
    "other_assistant": "Ein anderer Assistent? Geben Sie ihm diese MCP-Serveradresse:",
    "ask_title": "Dann fragen Sie, mit Ihren eigenen Worten",
    "ask_example": "Ich fahre morgen früh mit einer Sun Odyssey 36 von Marseille nach Porquerolles. Wie lange dauert die Überfahrt, und wie anspruchsvoll ist sie?",
    "ask_body": f"Ihr Assistent ruft die Werkzeuge von OhMyWind auf und antwortet in verständlicher Sprache. Bei Clients, die die {_A_APPS_SPEC}MCP-Apps-Spezifikation</a> unterstützen (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam), erscheint die Live-Planansicht von {_A_SITE}ohmywind.fr</a> außerdem direkt im Gespräch, in einem abgeschotteten iframe. Bei den anderen (Cursor, Vibe, Terminal) gibt Ihnen der Assistent denselben Plan als Direktlink.",
    "ask_window_intro": "Oder um die Abfahrtsfenster eines ganzen Wochenendes auf einmal zu vergleichen:",
    "ask_window_example": "Marseille &rarr; Porquerolles, gleiches Boot. Wann ist die ruhigste Abfahrt zwischen Samstagmorgen und Montagabend?",
    "why_title": "Warum OhMyWind",
    "perk_free": f"<strong>Kostenlos und ohne Schlüssel.</strong> Wind und Seegang über {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0).",
    "perk_models": "<strong>Auf das Mittelmeer abgestimmt.</strong> Standardmäßig AROME 1,3 km; ICON-EU &rarr; ECMWF &rarr; GFS für größere Reichweite.",
    "perk_boats": "<strong>Auf das Boot abgestimmt.</strong> Acht Bootstypen, vom 16-Fuß-Segel-Ruder-Dinghy bis zur 50-Fuß-Fahrtenyacht, echte Polaren und ein Parameter <code>efficiency</code> für Trimm und Können der Crew.",
    "perk_windows": "<strong>Auf das Zeitfenster abgestimmt.</strong> Ein Aufruf prüft bis zu 14 Tage stündlicher Abfahrten, damit das LLM das ruhigste Zeitfenster wählen kann.",
    "perk_clients": "<strong>Client-unabhängig.</strong> Ein einziger HTTP-Endpunkt für MCP. Keine Bindung an einen Anbieter.",
    "perk_open_source": "<strong>Open Source, AGPL.</strong> Selbst hosten auf Fly, Modal oder Ihrem VPS.",
    "tools_title": "Fünf Werkzeuge",
    "tools_body": f"Das Arbeitspferd ist <code>plan_passage</code>: Ein Aufruf liefert die Zeiten, eine Komplexitätsnote von 1 bis 5 und einen Direktlink zu {_A_SITE}ohmywind.fr</a>. Es deklariert eine MCP-Apps-UI-Ressource, sodass kompatible Clients die Live-Planansicht auch in einem abgeschotteten iframe anzeigen. Mit <code>latest_departure</code> geht es jedes stündliche Fenster bis zu 14 Tage im Voraus durch, damit das LLM sie nebeneinander vergleichen kann. Die anderen vier Werkzeuge ({_TOOLS}) lassen den Assistenten ein Boot wählen, die Vorhersage an einem Punkt abfragen, den Gezeitenstrom in einer Engstelle ablesen oder die Rechnung hinter einem Ergebnis erklären.",
    "tools_by_hand": f"Sie möchten keinen MCP-Client einrichten? Sie können auch alles von Hand auf {_A_PLAN}ohmywind.fr/plan</a> erledigen: Route anklicken, Boot wählen, Abfahrt verschieben.",
    "source_title": "Quellcode",
    "source_body": f"Projektseite: {_A_SITE}ohmywind.fr</a> &middot; GitHub: {_A_GITHUB}qdonnars/ohmywind</a> (AGPL-3.0).",
    "footnote": "Die erste Anfrage nach einer Pause kann ein paar Sekunden dauern (Kaltstart von HF Spaces).",
}

IT = {
    "title": "OhMyWind MCP: parlare al proprio LLM, mollare gli ormeggi con fiducia",
    "meta_description": "OhMyWind MCP. Pianificatore di navigazione gratuito e senza chiave per ogni costa, con maree ad alta precisione sull'Atlantico francese.",
    "og_description": "Parlare al proprio LLM. Mollare gli ormeggi con fiducia. Pianificatore di navigazione gratuito e senza chiave, via MCP.",
    "language_nav": "Lingua",
    "badge": "attivo",
    "lede_tagline": "Parlare al proprio LLM. Mollare gli ormeggi con fiducia.",
    "lede_body": "Un pianificatore di navigazione gratuito, senza chiave e open source per ogni costa, con correnti di marea ad alta precisione sull'Atlantico francese. Esposto come server MCP, così che qualsiasi assistente compatibile possa usarlo.",
    "video_label": "Avviare il video dimostrativo, in francese (carica il lettore YouTube)",
    "video_alt": "Le Four ou le Fromveur ? Una traversata da L'Aber Wrac'h a Camaret tracciata su una carta del mare d'Iroise.",
    "video_caption": "Una sessione reale, in francese: domani, da L'Aber Wrac'h a Camaret, per il Chenal du Four o per il Fromveur? L'assistente confronta le due rotte partenza per partenza e, con una burrasca in arrivo, consiglia di restare in porto. Solo l'attesa è accelerata. Il lettore YouTube si carica solo quando si preme play.",
    "video_more": f"Altre demo sul {_A_YOUTUBE}canale YouTube di OhMyWind</a>.",
    "video_frame_title": "Video dimostrativo di OhMyWind",
    "connect_title": "Collegarlo al proprio assistente",
    "connect_intro": "Scegliere il proprio qui sotto (meno di un minuto, nessuna installazione, nessuna chiave API).",
    "claude_cta": "Aggiungi a Claude",
    "chatgpt_cta": "Aggiungi a ChatGPT",
    "vibe_cta": "Collegare a Vibe: mostrare i passaggi",
    "vibe_step_open": f"Aprire {_A_MISTRAL}chat.mistral.ai</a> e accedere.",
    "vibe_step_menu": f"Nella barra laterale sinistra, aprire {_it('Intelligence')} &rarr; {_it('Connectors')} (nell'interfaccia francese: Intelligence &rarr; Connecteurs), poi cliccare su {_it('Add MCP server')}.",
    "vibe_step_name": f"Compilare {_it('Name')}: <code>OhMyWind</code> &middot; {_it('Auth')}: <code>None</code>.",
    "vibe_step_url": "Incollare questo indirizzo nel campo <strong>URL</strong>:",
    "vibe_step_enable": "Salvare, poi attivare OhMyWind in una conversazione qualsiasi.",
    "vibe_step_apps": f"Vibe non supporta (ancora) la specifica MCP Apps, quindi il widget non compare nella conversazione: l'assistente fornisce invece un link diretto a {_A_SITE}ohmywind.fr</a>.",
    "other_assistant": "Un altro assistente? Indicare questo indirizzo del server MCP:",
    "ask_title": "Poi chiedere, con parole proprie",
    "ask_example": "Parto domattina da Marsiglia per Porquerolles con un Sun Odyssey 36. Quanto dura la traversata e quanto è impegnativa?",
    "ask_body": f"L'assistente chiama gli strumenti di OhMyWind e risponde in un linguaggio semplice. Sui client che supportano la {_A_APPS_SPEC}specifica MCP Apps</a> (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam), la vista del piano di {_A_SITE}ohmywind.fr</a> compare anche dal vivo nella conversazione, in un iframe isolato. Su quelli che non la supportano (Cursor, Vibe, terminale), l'assistente fornisce lo stesso piano come link diretto.",
    "ask_window_intro": "Oppure, per confrontare in un colpo solo tutte le finestre di partenza di un fine settimana:",
    "ask_window_example": "Marsiglia &rarr; Porquerolles, stessa barca. Qual è la partenza più tranquilla tra sabato mattina e lunedì sera?",
    "why_title": "Perché OhMyWind",
    "perk_free": f"<strong>Gratuito e senza chiave.</strong> Vento e mare tramite {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0).",
    "perk_models": "<strong>Pensato per il Mediterraneo.</strong> AROME 1,3 km come predefinito; ICON-EU &rarr; ECMWF &rarr; GFS per guardare più lontano.",
    "perk_boats": "<strong>Su misura della barca.</strong> Otto tipi di barca, dalla deriva a vela e remi di 16 piedi ai cabinati da crociera di 50 piedi, polari reali e un parametro <code>efficiency</code> per la regolazione e il livello dell'equipaggio.",
    "perk_windows": "<strong>Su misura della finestra.</strong> Una sola chiamata esamina fino a 14 giorni di partenze ora per ora, così che l'LLM possa scegliere la fascia più tranquilla.",
    "perk_clients": "<strong>Indipendente dal client.</strong> Un solo endpoint MCP in HTTP. Nessun vincolo verso un fornitore.",
    "perk_open_source": "<strong>Open source, AGPL.</strong> Ospitabile in proprio su Fly, Modal o il proprio VPS.",
    "tools_title": "Cinque strumenti",
    "tools_body": f"Lo strumento principale è <code>plan_passage</code>: una sola chiamata restituisce i tempi, un punteggio di complessità da 1 a 5 e un link diretto a {_A_SITE}ohmywind.fr</a>. Dichiara una risorsa di interfaccia MCP Apps, così i client compatibili mostrano anche la vista del piano dal vivo in un iframe isolato. Con <code>latest_departure</code> percorre ogni finestra oraria fino a 14 giorni, così che l'LLM possa confrontarle fianco a fianco. Gli altri quattro strumenti ({_TOOLS}) permettono all'assistente di scegliere una barca, leggere la previsione in un punto, leggere la corrente di marea in un passaggio o spiegare il calcolo dietro un risultato.",
    "tools_by_hand": f"Non si vuole configurare un client MCP? Si può anche fare tutto a mano su {_A_PLAN}ohmywind.fr/plan</a>: tracciare la rotta, scegliere una barca, far scorrere la partenza.",
    "source_title": "Codice sorgente",
    "source_body": f"Sito del progetto: {_A_SITE}ohmywind.fr</a> &middot; GitHub: {_A_GITHUB}qdonnars/ohmywind</a> (AGPL-3.0).",
    "footnote": "La prima richiesta dopo un periodo di inattività può richiedere qualche secondo (avvio a freddo di HF Spaces).",
}

ES = {
    "title": "OhMyWind MCP: hable con su LLM, suelte amarras con confianza",
    "meta_description": "OhMyWind MCP. Planificador de navegación gratuito y sin clave para cualquier costa, con mareas de alta precisión en el Atlántico francés.",
    "og_description": "Hable con su LLM. Suelte amarras con confianza. Planificador de navegación gratuito y sin clave, vía MCP.",
    "language_nav": "Idioma",
    "badge": "en línea",
    "lede_tagline": "Hable con su LLM. Suelte amarras con confianza.",
    "lede_body": "Un planificador de navegación gratuito, sin clave y open source para cualquier costa, con corrientes de marea de alta precisión en el Atlántico francés. Expuesto como servidor MCP para que cualquier asistente compatible pueda usarlo.",
    "video_label": "Reproducir el vídeo de demostración, en francés (carga el reproductor de YouTube)",
    "video_alt": "Le Four ou le Fromveur ? Una travesía de L'Aber Wrac'h a Camaret trazada sobre una carta del mar de Iroise.",
    "video_caption": "Una sesión real, en francés: mañana, de L'Aber Wrac'h a Camaret, ¿por el Chenal du Four o por el Fromveur? El asistente compara las dos rutas salida a salida y, con un temporal en camino, aconseja quedarse en puerto. Solo la espera está acelerada. El reproductor de YouTube solo se carga cuando usted pulsa reproducir.",
    "video_more": f"Más demostraciones en el {_A_YOUTUBE}canal de YouTube de OhMyWind</a>.",
    "video_frame_title": "Vídeo de demostración de OhMyWind",
    "connect_title": "Conéctelo a su asistente",
    "connect_intro": "Elija el suyo a continuación (menos de un minuto, sin instalación, sin clave de API).",
    "claude_cta": "Añadir a Claude",
    "chatgpt_cta": "Añadir a ChatGPT",
    "vibe_cta": "Conectar con Vibe: ver los pasos",
    "vibe_step_open": f"Abra {_A_MISTRAL}chat.mistral.ai</a> e inicie sesión.",
    "vibe_step_menu": f"En la barra lateral izquierda, abra {_es('Intelligence')} &rarr; {_es('Connectors')} (en la interfaz francesa: Intelligence &rarr; Connecteurs) y luego haga clic en {_es('Add MCP server')}.",
    "vibe_step_name": f"Rellene {_es('Name')}: <code>OhMyWind</code> &middot; {_es('Auth')}: <code>None</code>.",
    "vibe_step_url": "Pegue esta dirección en el campo <strong>URL</strong>:",
    "vibe_step_enable": "Guarde y luego active OhMyWind en cualquier conversación.",
    "vibe_step_apps": f"Vibe no admite (todavía) la especificación MCP Apps, así que el widget no aparece en la conversación: el asistente le dará en su lugar un enlace directo a {_A_SITE}ohmywind.fr</a>.",
    "other_assistant": "¿Otro asistente? Indíquele esta dirección del servidor MCP:",
    "ask_title": "Luego pregunte, con sus propias palabras",
    "ask_example": "Salgo mañana por la mañana de Marsella hacia Porquerolles en un Sun Odyssey 36. ¿Cuánto dura la travesía y qué dificultad tiene?",
    "ask_body": f"Su asistente llama a las herramientas de OhMyWind y responde en lenguaje claro. En los clientes compatibles con la {_A_APPS_SPEC}especificación MCP Apps</a> (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam), la vista del plan de {_A_SITE}ohmywind.fr</a> también se muestra en directo en la conversación, en un iframe aislado. En los demás (Cursor, Vibe, terminal), el asistente le da el mismo plan como enlace directo.",
    "ask_window_intro": "O, para comparar de una vez todas las ventanas de salida de un fin de semana:",
    "ask_window_example": "Marsella &rarr; Porquerolles, mismo barco. ¿Cuál es la salida más tranquila entre el sábado por la mañana y el lunes por la noche?",
    "why_title": "Por qué OhMyWind",
    "perk_free": f"<strong>Gratuito y sin clave.</strong> Viento y mar vía {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0).",
    "perk_models": "<strong>Afinado para el Mediterráneo.</strong> AROME 1,3 km por defecto; ICON-EU &rarr; ECMWF &rarr; GFS para ver más lejos.",
    "perk_boats": "<strong>A la medida del barco.</strong> Ocho tipos de barco, desde el bote de vela y remo de 16 pies hasta los cruceros de 50 pies, polares reales y un parámetro <code>efficiency</code> para el trimado y el nivel de la tripulación.",
    "perk_windows": "<strong>A la medida de la ventana.</strong> Una sola llamada recorre hasta 14 días de salidas hora a hora para que el LLM elija la franja más tranquila.",
    "perk_clients": "<strong>Independiente del cliente.</strong> Un único endpoint MCP por HTTP. Sin dependencia de un proveedor.",
    "perk_open_source": "<strong>Open source, AGPL.</strong> Alójelo usted mismo en Fly, Modal o su VPS.",
    "tools_title": "Cinco herramientas",
    "tools_body": f"La herramienta principal es <code>plan_passage</code>: una sola llamada devuelve los tiempos, una puntuación de complejidad de 1 a 5 y un enlace directo a {_A_SITE}ohmywind.fr</a>. Declara un recurso de interfaz MCP Apps, de modo que los clientes compatibles también muestran la vista del plan en directo en un iframe aislado. Con <code>latest_departure</code> recorre cada ventana horaria hasta 14 días vista para que el LLM las compare una al lado de otra. Las otras cuatro herramientas ({_TOOLS}) permiten al asistente elegir un barco, consultar la previsión en un punto, leer la corriente de marea en un paso o explicar el cálculo detrás de un resultado.",
    "tools_by_hand": f"¿No quiere configurar un cliente MCP? También puede hacerlo todo a mano en {_A_PLAN}ohmywind.fr/plan</a>: trace su ruta, elija un barco, deslice la salida.",
    "source_title": "Código fuente",
    "source_body": f"Sitio del proyecto: {_A_SITE}ohmywind.fr</a> &middot; GitHub: {_A_GITHUB}qdonnars/ohmywind</a> (AGPL-3.0).",
    "footnote": "La primera petición tras un periodo de inactividad puede tardar unos segundos (arranque en frío de HF Spaces).",
}

# English first: it is the reference the others are checked against, and the
# fallback when nothing the reader asks for is served.
COPY = {"en": EN, "fr": FR, "de": DE, "it": IT, "es": ES}
