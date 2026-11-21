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
rendered pages). The page's own links (header, footer, buttons) come from
``LINKS``, through ``{{url:<name>}}`` slots in the template.

The page speaks to sailors, not developers: no MCP, LLM or model names above
the folded developer block, "simulation" and "skipper" rather than
"intelligence". The three questions at the top (Marseille to Porquerolles on a
Sun Odyssey 36) are a real run of 21 Nov 2026, kept as a dated example: the
cruiser_40ft archetype, motoring under 4 kn at 5.5 kn, by Maïre, Riou, Sicié
and south of Giens, with a mistral on Sunday 22 that eases on Monday evening.
The comparison further down (Trébeurden to Batz) is illustrative.

Interface labels of the assistants (Vibe, Mistral's former Le Chat) are the ones
their users see in that language, taken from each vendor's localized help.
A label that could not be checked in a language stays in English, quoted,
with ``lang="en"`` (see ``_en_label``), rather than being translated by hand
into something the reader will not find on screen.

House rules for every language: no em dash, the formal register (vous, Sie,
usted; the impersonal infinitive in Italian, as in the web app), wind speeds
in knots. French takes a non-breaking space before ``? : ; !`` and inside
« », added by ``_french_spacing`` so the source stays readable.
"""

from __future__ import annotations

# Where the page sends people. One entry per destination, used both by the
# template's ``{{url:<name>}}`` slots and by the openers below.
LINKS = {
    "app": "https://ohmywind.fr",
    "methodology": "https://ohmywind.fr/methodologie",
    "youtube": "https://ohmywind.fr/youtube",
    "github": "https://github.com/qdonnars/ohmywind",
    "open_meteo": "https://open-meteo.com",
}

_BLANK = 'target="_blank" rel="noopener"'
_A_YOUTUBE = f'<a href="{LINKS["youtube"]}" {_BLANK}>'
_A_MISTRAL = f'<a href="https://chat.mistral.ai" {_BLANK}>'
_A_SITE = f'<a href="{LINKS["app"]}">'
_A_METHOD = f'<a href="{LINKS["methodology"]}">'
_A_OPEN_METEO = f'<a href="{LINKS["open_meteo"]}">'
_A_GITHUB = f'<a href="{LINKS["github"]}">'

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


def _french_spacing(copy: dict[str, str]) -> dict[str, str]:
    """Non-breaking spaces where French typography wants them.

    Before ``? : ; !`` and inside « », so a question mark never starts a line
    on its own. The values never put a space before a colon inside a tag or a
    URL, which is what makes the plain replacement safe.
    """
    fixes = (
        (" ?", "\u00a0?"),
        (" :", "\u00a0:"),
        (" ;", "\u00a0;"),
        (" !", "\u00a0!"),
        ("« ", "«\u00a0"),
        (" »", "\u00a0»"),
    )
    spaced = {}
    for key, value in copy.items():
        for before, after in fixes:
            value = value.replace(before, after)
        spaced[key] = value
    return spaced


EN = {
    "title": "OhMyWind: your assistant does the maths, you stay the skipper",
    "meta_description": "Connect OhMyWind to Claude, ChatGPT or Vibe: passage time, departure, wind, sea, tides and currents worked out for your boat from today's forecasts. Free, no account.",
    "og_description": "Your assistant works out the passage. You stay the skipper.",
    "language_nav": "Language",
    "open_app": "Open the app",
    # Hero
    "h1": "Ask your assistant. OhMyWind does the maths.",
    "lede": "Passage time, departure, wind, sea and currents, from today&rsquo;s forecasts. You stay the skipper.",
    "claude_cta": "Add to Claude",
    "chatgpt_cta": "Add to ChatGPT",
    "vibe_cta": "Connect to Vibe: show the steps",
    "vibe_step_open": f"Open {_A_MISTRAL}chat.mistral.ai</a> and sign in.",
    "vibe_step_menu": "In the left sidebar, open <strong>Intelligence</strong> &rarr; <strong>Connecteurs</strong> (in English: <strong>Intelligence</strong> &rarr; <strong>Connectors</strong>), then click <strong>Add MCP server</strong>.",
    "vibe_step_name": "Set <strong>Name</strong>: <code>OhMyWind</code> &middot; <strong>Auth</strong>: <code>None</code>.",
    "vibe_step_url": "Paste this in <strong>URL</strong>:",
    "vibe_step_enable": "Save, then enable the OhMyWind toggle inside any conversation.",
    "vibe_step_link": f"Vibe does not show the chart inside the conversation: the assistant gives you a link that opens it on {_A_SITE}ohmywind.fr</a>.",
    "no_assistant_link": "No assistant? Run the same simulation on ohmywind.fr",
    # The three questions, from a real run of 21 Nov 2026 (see the module docstring)
    "send_label": "Send",
    "questions_label": "Example questions",
    "stat_best": "Best departure",
    "q1_chip": "A passage",
    "q1": "Marseille &rarr; Porquerolles tomorrow at 8:00 on a Sun Odyssey 36: how long?",
    "q1_answer": "I&rsquo;d advise against tomorrow: mistral at 31 to 38 knots, gusts to 48, and a rough sea up to 2.7 m approaching Giens. It would take 7 h 45, downwind, in a very unpleasant sea.",
    "q1_alert": "Mistral 31&ndash;38 kn · rough sea 2.7 m",
    "q2_chip": "The right window",
    "q2": "Same passage: what is the best departure over the next three days?",
    "q2_answer": "Tuesday 6:00. The mistral dies down on Monday evening; on Tuesday morning, light wind and a 0.5 to 0.9 m sea. Plan on some motoring: arrival around 14:30.",
    "q2_best": "Tue 6:00",
    "q3_chip": "Will it go?",
    "q3": "And Monday at noon, will it go?",
    "q3_answer": "No: the mistral is still blowing up to 31 knots early on, a 1.5 to 2.1 m rough sea, and you would arrive after dark around 20:00.",
    "q3_alert": "Rough sea · arrival after dark",
    "stat_duration": "Duration",
    "stat_arrival": "Arrival",
    # Why not just ask the assistant
    "why_title": "Why not just ask the assistant?",
    "why_sub": "An assistant can talk about boats, but it does not know tomorrow&rsquo;s weather and gets tides wrong. OhMyWind gives it the forecasts and does the maths for it.",
    "why_question_label": "The same question:",
    "why_question": "Trébeurden &rarr; Île de Batz tomorrow on a First 27: when should I leave?",
    "why_alone_title": "Your assistant alone",
    "why_alone_answer": "Leave about two hours after high water to have the stream with you, and allow three hours. Check the weather before you go.",
    "why_alone_1": "No forecast for the day: it answers &ldquo;in general&rdquo;",
    "why_alone_2": "Easily gets the tide times wrong",
    "why_alone_3": "Forgets the counter-currents",
    "why_alone_4": "Does not know your boat&rsquo;s speed",
    "why_with_title": "With OhMyWind",
    "why_with_answer": "Leave at 9:40: the stream carries you to the entrance of the Batz channel, arriving around 12:50, before it turns. Westerly 10 to 14 knots, sea 0.8 m. Leaving after 11:00 would have you finish against the stream.",
    "why_with_1": "Today&rsquo;s forecasts, several models compared",
    "why_with_2": "Tide times at departure and arrival, currents worked out hour by hour along the route",
    "why_with_3": "A realistic speed for your type of boat",
    "why_with_4": "The route on the chart, to check at a glance",
    "why_note": "Example answers, to show the difference.",
    # You stay the skipper
    "skipper_title": "You stay the skipper",
    "skipper_sub": "Not an autopilot, not a racing router: a crew member who does the tedious maths and explains it to you.",
    "skipper_1_title": "It simulates, you decide",
    "skipper_1_body": "OhMyWind does not draw your route or tell you &ldquo;go&rdquo;. It works out how the passage you have in mind would play out, and leaves the call to you.",
    "skipper_2_title": "Open calculations",
    "skipper_2_body": f"The method is set out on the {_A_METHOD}Methodology page</a> and the code is open: anyone can check where the figures come from.",
    "skipper_3_title": "One more opinion, not the only one",
    "skipper_3_body": "Weigh it against the chart, the pilot books, the weather bulletin and the old hands on the quay. Preparing a passage is still part of the joy of sailing.",
    # Video
    "video_title": "A demo is worth a thousand words",
    "video_sub": "A real session, in French, filmed as it happened: only the waiting is sped up.",
    "video_label": "Play the demo video, in French (loads the YouTube player)",
    "video_alt": "Le Four ou le Fromveur ? A passage from L'Aber Wrac'h to Camaret drawn on a chart of the Iroise sea.",
    "video_caption": "L&rsquo;Aber Wrac&rsquo;h &rarr; Camaret, through the Chenal du Four or the Fromveur? With a gale forecast, the assistant advises staying in port.",
    "video_more": f"{_A_YOUTUBE}More demos on YouTube</a>",
    "video_frame_title": "OhMyWind demo video",
    "copied": "Copied",
    # FAQ
    "faq_title": "Your questions",
    "faq_decide_q": "Does it decide for me?",
    "faq_decide_a": "No. OhMyWind simulates the passage you describe and the assistant explains the result. Whether to go stays your call as skipper.",
    "faq_reliable_q": "Is it reliable?",
    "faq_reliable_a": f"As reliable as the forecasts it starts from: the best weather models available, more reliable two days out than ten. They are forecasts, not observations: always check the route on the chart and the day&rsquo;s bulletin. The calculations are set out on the {_A_METHOD}Methodology page</a>.",
    "faq_tides_q": "What about tides and currents?",
    "faq_tides_a": "They are worked out hour by hour along the route, with high-precision data on the French Atlantic coast. In the Mediterranean they rarely matter and are only shown when they do.",
    "faq_windy_q": "How is it different from Windy or the OhMyWind app?",
    "faq_windy_a": "Windy shows the weather; OhMyWind works out your passage with it. The app does the same maths with a mouse; with an assistant you ask in your own words and compare several departures or routes at once.",
    "faq_price_q": "Which assistant, and what does it cost?",
    "faq_price_a": "Claude and ChatGPT add it in one click, Vibe (Mistral&rsquo;s former Le Chat) in a few settings. OhMyWind is free with no account; only your assistant subscription applies, if it is a paid one.",
    # Without an assistant
    "noassist_title": "Prefer to plot it yourself?",
    "noassist_body": "On ohmywind.fr, draw your route on the chart, pick your boat and departure time. Same calculations, no assistant.",
    "noassist_cta": "Open ohmywind.fr",
    # For developers
    "devs_title": "For developers",
    "devs_hint": "Server address, source code, self-hosting",
    "devs_address": "MCP server address",
    "copy": "Copy",
    "devs_other": "For any other MCP-compatible assistant (Cursor, VS Code, Goose&hellip;): add this address, no authentication.",
    "devs_source_title": "Open source",
    "devs_source_body": f"AGPL-3.0 code on {_A_GITHUB}github.com/qdonnars/ohmywind</a>. Self-hostable (Fly, Modal, a VPS). The first request after a quiet spell may take a few seconds.",
    # Footer
    "footer_app": "Web app",
    "footer_method": "Methodology",
    "footer_youtube": "YouTube",
    "footer_github": "GitHub",
    "footer_data": f"Forecasts by {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0)",
    "footer_status": "Server online",
}

# Vibe's « Intelligence → Connecteurs » is the French interface the English
# page already quoted; the rest of Vibe stays in English.
FR = _french_spacing(
    {
        "title": "OhMyWind : votre assistant fait les calculs, vous restez chef de bord",
        "meta_description": "Connectez OhMyWind à Claude, ChatGPT ou Vibe : durée, heure de départ, vent, mer, marées et courants calculés pour votre bateau avec les prévisions du jour. Gratuit, sans compte.",
        "og_description": "Votre assistant fait les calculs de la nav. Vous restez chef de bord.",
        "language_nav": "Langue",
        "open_app": "Ouvrir l'appli",
        "h1": "Posez la question à votre assistant. OhMyWind fait les calculs.",
        "lede": "Durée, heure de départ, vent, mer et courants, avec les prévisions du jour. Vous restez chef de bord.",
        "claude_cta": "Ajouter à Claude",
        "chatgpt_cta": "Ajouter à ChatGPT",
        "vibe_cta": "Brancher sur Vibe : afficher les étapes",
        "vibe_step_open": f"Ouvrez {_A_MISTRAL}chat.mistral.ai</a> et connectez-vous.",
        "vibe_step_menu": f"Dans la barre latérale gauche, ouvrez <strong>Intelligence</strong> &rarr; <strong>Connecteurs</strong>, puis cliquez sur {_fr('Add MCP server')}.",
        "vibe_step_name": f"Renseignez {_fr('Name')} : <code>OhMyWind</code> &middot; {_fr('Auth')} : <code>None</code>.",
        "vibe_step_url": "Collez cette adresse dans le champ <strong>URL</strong> :",
        "vibe_step_enable": "Enregistrez, puis activez OhMyWind dans n'importe quelle conversation.",
        "vibe_step_link": f"Vibe n'affiche pas la carte dans la conversation : l'assistant vous donne un lien qui l'ouvre sur {_A_SITE}ohmywind.fr</a>.",
        "no_assistant_link": "Pas d'assistant ? Faites la même simulation sur ohmywind.fr",
        "send_label": "Envoyer",
        "questions_label": "Exemples de questions",
        "stat_best": "Meilleur départ",
        "q1_chip": "Un trajet",
        "q1": "Marseille &rarr; Porquerolles demain à 8\u00a0h en Sun Odyssey 36 : combien de temps ?",
        "q1_answer": "Je vous déconseille demain : mistral de 31 à 38 nœuds, rafales à 48, et mer forte jusqu'à 2,7 m en approche de Giens. Ça se ferait en 7\u00a0h\u00a045, au portant, dans une mer très désagréable.",
        "q1_alert": "Mistral 31&ndash;38 kn · mer forte 2,7 m",
        "q2_chip": "Le bon créneau",
        "q2": "Même trajet : quel est le meilleur départ dans les trois prochains jours ?",
        "q2_answer": "Mardi 6\u00a0h. Le mistral tombe lundi soir ; mardi matin, vent faible et mer de 0,5 à 0,9 m. Prévoyez du moteur : arrivée vers 14\u00a0h\u00a030.",
        "q2_best": "mar. 6:00",
        "q3_chip": "Ça passe ?",
        "q3": "Et lundi midi, ça passe ?",
        "q3_answer": "Non : le mistral souffle encore jusqu'à 31 nœuds en début de route, mer formée de 1,5 à 2,1 m, et vous arriveriez de nuit vers 20\u00a0h.",
        "q3_alert": "Mer formée · arrivée de nuit",
        "stat_duration": "Durée",
        "stat_arrival": "Arrivée",
        "why_title": "Pourquoi ne pas demander directement à l'assistant ?",
        "why_sub": "Un assistant sait parler de bateau, mais il ne connaît pas la météo de demain et calcule mal les marées. OhMyWind lui donne les prévisions et fait les calculs à sa place.",
        "why_question_label": "La même question :",
        "why_question": "Trébeurden &rarr; île de Batz demain sur un First 27 : à quelle heure partir ?",
        "why_alone_title": "Votre assistant seul",
        "why_alone_answer": "Partez environ deux heures après la pleine mer pour avoir le courant avec vous, et comptez trois heures de route. Vérifiez la météo avant de partir.",
        "why_alone_1": "Pas de prévisions du jour : il répond « en général »",
        "why_alone_2": "Se trompe facilement sur l'heure de la marée",
        "why_alone_3": "Oublie les contre-courants",
        "why_alone_4": "Ne connaît pas la vitesse de votre bateau",
        "why_with_title": "Avec OhMyWind",
        "why_with_answer": "Partez à 9 h 40 : le courant vous porte jusqu'à l'entrée du chenal de Batz, arrivée vers 12 h 50, avant la renverse. Vent d'ouest 10 à 14 nœuds, mer 0,8 m. Partir après 11 h vous ferait finir contre le courant.",
        "why_with_1": "Prévisions du jour, plusieurs modèles comparés",
        "why_with_2": "Heures de marée au départ et à l'arrivée, courants calculés heure par heure sur la route",
        "why_with_3": "Une vitesse réaliste pour votre type de bateau",
        "why_with_4": "La route sur la carte, à vérifier d'un coup d'œil",
        "why_note": "Réponses d'exemple, pour illustrer la différence.",
        "skipper_title": "Vous restez chef de bord",
        "skipper_sub": "Pas de pilote automatique ni de routeur de course : un équipier qui fait les calculs fastidieux et vous les explique.",
        "skipper_1_title": "Il simule, vous décidez",
        "skipper_1_body": "OhMyWind ne trace pas votre route et ne dit pas « partez ». Il calcule ce que donnerait la nav que vous envisagez, et vous laisse juger.",
        "skipper_2_title": "Des calculs publics",
        "skipper_2_body": f"La méthode est détaillée sur la {_A_METHOD}page Méthodologie</a> et le code est ouvert : chacun peut vérifier d'où sortent les chiffres.",
        "skipper_3_title": "Un avis de plus, pas le seul",
        "skipper_3_body": "À confronter à la carte, aux documents nautiques, au bulletin météo et aux anciens du port. Préparer sa nav reste un plaisir de marin.",
        "video_title": "Une démo vaut mille mots",
        "video_sub": "Une vraie session, en français, filmée telle quelle : seule l'attente est accélérée.",
        "video_label": "Lancer la vidéo de démonstration, en français (charge le lecteur YouTube)",
        "video_alt": "Le Four ou le Fromveur ? Un trajet de L'Aber Wrac'h à Camaret tracé sur une carte de la mer d'Iroise.",
        "video_caption": "L'Aber Wrac'h &rarr; Camaret, par le chenal du Four ou par le Fromveur ? Avec un coup de vent annoncé, l'assistant conseille de rester au port.",
        "video_more": f"{_A_YOUTUBE}D'autres démos sur YouTube</a>",
        "video_frame_title": "Vidéo de démonstration d'OhMyWind",
        "copied": "Copié",
        "faq_title": "Vos questions",
        "faq_decide_q": "Est-ce que ça décide à ma place ?",
        "faq_decide_a": "Non. OhMyWind simule la nav que vous décrivez et l'assistant vous explique le résultat. Partir ou non reste votre décision de chef de bord.",
        "faq_reliable_q": "Est-ce fiable ?",
        "faq_reliable_a": f"Autant que les prévisions dont il part : les meilleurs modèles météo disponibles, plus fiables à 2 jours qu'à 10. Ce sont des prévisions, pas des observations : vérifiez toujours la route sur la carte et le bulletin du jour. Le détail des calculs est sur la {_A_METHOD}page Méthodologie</a>.",
        "faq_tides_q": "Et les marées, les courants ?",
        "faq_tides_a": "Ils sont calculés heure par heure le long de la route, avec des données de haute précision sur la côte atlantique française. En Méditerranée, ils comptent rarement et ne sont affichés que lorsqu'ils pèsent.",
        "faq_windy_q": "Quelle différence avec Windy ou l'appli OhMyWind ?",
        "faq_windy_a": "Windy montre la météo ; OhMyWind calcule votre nav avec. L'appli fait les mêmes calculs à la souris ; avec l'assistant, vous posez vos questions avec vos mots et comparez plusieurs départs ou routes d'un coup.",
        "faq_price_q": "Quel assistant, et combien ça coûte ?",
        "faq_price_a": "Claude et ChatGPT s'ajoutent en un clic, Vibe (ex-Le Chat de Mistral) en quelques réglages. OhMyWind est gratuit et sans compte ; seul votre abonnement à l'assistant, s'il est payant, s'applique.",
        "noassist_title": "Vous préférez tracer vous-même ?",
        "noassist_body": "Sur ohmywind.fr, dessinez votre route sur la carte, choisissez votre bateau et l'heure de départ. Mêmes calculs, sans assistant.",
        "noassist_cta": "Ouvrir ohmywind.fr",
        "devs_title": "Pour les développeurs",
        "devs_hint": "Adresse du serveur, code source, auto-hébergement",
        "devs_address": "Adresse du serveur MCP",
        "copy": "Copier",
        "devs_other": "Pour tout autre assistant compatible MCP (Cursor, VS Code, Goose&hellip;) : ajoutez cette adresse, sans authentification.",
        "devs_source_title": "Open source",
        "devs_source_body": f"Code sous licence AGPL-3.0 sur {_A_GITHUB}github.com/qdonnars/ohmywind</a>. Auto-hébergeable (Fly, Modal, VPS). La première requête après une période d'inactivité peut prendre quelques secondes.",
        "footer_app": "Appli web",
        "footer_method": "Méthodologie",
        "footer_youtube": "YouTube",
        "footer_github": "GitHub",
        "footer_data": f"Prévisions {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0)",
        "footer_status": "Serveur en ligne",
    }
)

DE = {
    "title": "OhMyWind: Ihr Assistent rechnet, Sie bleiben Skipper",
    "meta_description": "Verbinden Sie OhMyWind mit Claude, ChatGPT oder Vibe: Törndauer, Abfahrtszeit, Wind, Seegang, Gezeiten und Strömungen, berechnet für Ihr Boot mit den aktuellen Vorhersagen. Kostenlos, ohne Konto.",
    "og_description": "Ihr Assistent berechnet den Törn. Sie bleiben Skipper.",
    "language_nav": "Sprache",
    "open_app": "App öffnen",
    "h1": "Fragen Sie Ihren Assistenten. OhMyWind rechnet.",
    "lede": "Törndauer, Abfahrtszeit, Wind, Seegang und Strömungen, mit den aktuellen Vorhersagen. Sie bleiben Skipper.",
    "claude_cta": "Zu Claude hinzufügen",
    "chatgpt_cta": "Zu ChatGPT hinzufügen",
    "vibe_cta": "Mit Vibe verbinden: Schritte anzeigen",
    "vibe_step_open": f"Öffnen Sie {_A_MISTRAL}chat.mistral.ai</a> und melden Sie sich an.",
    "vibe_step_menu": f"Öffnen Sie in der linken Seitenleiste {_de('Intelligence')} &rarr; {_de('Connectors')} (in der französischen Oberfläche: Intelligence &rarr; Connecteurs) und klicken Sie dann auf {_de('Add MCP server')}.",
    "vibe_step_name": f"Tragen Sie ein: {_de('Name')}: <code>OhMyWind</code> &middot; {_de('Auth')}: <code>None</code>.",
    "vibe_step_url": "Fügen Sie diese Adresse in das Feld <strong>URL</strong> ein:",
    "vibe_step_enable": "Speichern Sie und aktivieren Sie OhMyWind dann in einem beliebigen Gespräch.",
    "vibe_step_link": f"Vibe zeigt die Karte nicht im Gespräch an: Der Assistent gibt Ihnen einen Link, der sie auf {_A_SITE}ohmywind.fr</a> öffnet.",
    "no_assistant_link": "Kein Assistent? Dieselbe Simulation auf ohmywind.fr",
    "send_label": "Senden",
    "questions_label": "Beispielfragen",
    "stat_best": "Beste Abfahrt",
    "q1_chip": "Ein Törn",
    "q1": "Marseille &rarr; Porquerolles morgen um 8:00 mit einer Sun Odyssey 36: Wie lange dauert es?",
    "q1_answer": "Ich rate von morgen ab: Mistral mit 31 bis 38 Knoten, Böen bis 48 und sehr grobe See bis 2,7 m vor Giens. Es wären 7 Std. 45, raumschots, in sehr unangenehmer See.",
    "q1_alert": "Mistral 31&ndash;38 kn · sehr grobe See 2,7 m",
    "q2_chip": "Das richtige Zeitfenster",
    "q2": "Gleicher Törn: Wann ist die beste Abfahrt in den nächsten drei Tagen?",
    "q2_answer": "Dienstag 6:00. Der Mistral flaut Montagabend ab; Dienstagmorgen schwacher Wind und 0,5 bis 0,9 m Seegang. Planen Sie etwas Motorfahrt ein: Ankunft gegen 14:30.",
    "q2_best": "Di. 6:00",
    "q3_chip": "Geht das?",
    "q3": "Und Montag um 12 Uhr, geht das?",
    "q3_answer": "Nein: Der Mistral weht zu Beginn noch mit bis zu 31 Knoten, grobe See von 1,5 bis 2,1 m, und Sie kämen erst nach Einbruch der Dunkelheit gegen 20:00 an.",
    "q3_alert": "Grobe See · Ankunft bei Nacht",
    "stat_duration": "Dauer",
    "stat_arrival": "Ankunft",
    "why_title": "Warum nicht einfach den Assistenten fragen?",
    "why_sub": "Ein Assistent kann über Boote reden, kennt aber das Wetter von morgen nicht und rechnet Gezeiten falsch. OhMyWind gibt ihm die Vorhersagen und übernimmt die Berechnungen.",
    "why_question_label": "Dieselbe Frage:",
    "why_question": "Trébeurden &rarr; Île de Batz morgen mit einer First 27: Wann soll ich ablegen?",
    "why_alone_title": "Ihr Assistent allein",
    "why_alone_answer": "Legen Sie etwa zwei Stunden nach Hochwasser ab, um den Strom mit sich zu haben, und rechnen Sie mit drei Stunden. Prüfen Sie vor dem Ablegen das Wetter.",
    "why_alone_1": "Keine Vorhersage für den Tag: Er antwortet „im Allgemeinen“",
    "why_alone_2": "Irrt sich leicht bei den Gezeitenzeiten",
    "why_alone_3": "Vergisst die Gegenströmungen",
    "why_alone_4": "Kennt die Geschwindigkeit Ihres Bootes nicht",
    "why_with_title": "Mit OhMyWind",
    "why_with_answer": "Legen Sie um 9:40 ab: Der Strom trägt Sie bis zur Einfahrt des Kanals von Batz, Ankunft gegen 12:50, bevor er kentert. Westwind 10 bis 14 Knoten, Seegang 0,8 m. Wer nach 11:00 ablegt, hat am Ende den Strom gegen sich.",
    "why_with_1": "Vorhersagen des Tages, mehrere Modelle verglichen",
    "why_with_2": "Gezeitenzeiten bei Abfahrt und Ankunft, Strömungen Stunde für Stunde entlang der Route berechnet",
    "why_with_3": "Eine realistische Geschwindigkeit für Ihren Bootstyp",
    "why_with_4": "Die Route auf der Karte, auf einen Blick zu prüfen",
    "why_note": "Beispielantworten, um den Unterschied zu zeigen.",
    "skipper_title": "Sie bleiben Skipper",
    "skipper_sub": "Kein Autopilot und kein Regatta-Router: ein Crewmitglied, das die mühsamen Berechnungen übernimmt und sie Ihnen erklärt.",
    "skipper_1_title": "Es simuliert, Sie entscheiden",
    "skipper_1_body": "OhMyWind zeichnet Ihre Route nicht und sagt nicht „Leinen los“. Es berechnet, wie der geplante Törn verlaufen würde, und überlässt Ihnen das Urteil.",
    "skipper_2_title": "Offene Berechnungen",
    "skipper_2_body": f"Die Methode steht auf der {_A_METHOD}Methodik-Seite</a>, und der Code ist offen: Jeder kann nachprüfen, woher die Zahlen kommen.",
    "skipper_3_title": "Eine Meinung mehr, nicht die einzige",
    "skipper_3_body": "Gleichen Sie sie mit der Seekarte, dem Hafenhandbuch, dem Wetterbericht und den alten Hasen am Steg ab. Einen Törn vorzubereiten gehört weiter zur Freude am Segeln.",
    "video_title": "Eine Demo sagt mehr als tausend Worte",
    "video_sub": "Eine echte Sitzung auf Französisch, so gefilmt, wie sie stattfand: Nur das Warten ist beschleunigt.",
    "video_label": "Demovideo abspielen, auf Französisch (lädt den YouTube-Player)",
    "video_alt": "Le Four ou le Fromveur ? Ein Törn von L'Aber Wrac'h nach Camaret, eingezeichnet auf einer Karte der Iroise.",
    "video_caption": "L'Aber Wrac'h &rarr; Camaret, durch den Chenal du Four oder den Fromveur? Da ein Sturm angekündigt ist, rät der Assistent, im Hafen zu bleiben.",
    "video_more": f"{_A_YOUTUBE}Weitere Demos auf YouTube</a>",
    "video_frame_title": "Demovideo von OhMyWind",
    "copied": "Kopiert",
    "faq_title": "Ihre Fragen",
    "faq_decide_q": "Entscheidet es für mich?",
    "faq_decide_a": "Nein. OhMyWind simuliert den Törn, den Sie beschreiben, und der Assistent erklärt Ihnen das Ergebnis. Ob Sie ablegen, bleibt Ihre Entscheidung als Skipper.",
    "faq_reliable_q": "Ist es zuverlässig?",
    "faq_reliable_a": f"So zuverlässig wie die Vorhersagen, von denen es ausgeht: die besten verfügbaren Wettermodelle, auf zwei Tage zuverlässiger als auf zehn. Es sind Vorhersagen, keine Beobachtungen: Prüfen Sie immer die Route auf der Karte und den Wetterbericht des Tages. Die Berechnungen stehen auf der {_A_METHOD}Methodik-Seite</a>.",
    "faq_tides_q": "Und Gezeiten und Strömungen?",
    "faq_tides_a": "Sie werden Stunde für Stunde entlang der Route berechnet, mit hochpräzisen Daten an der französischen Atlantikküste. Im Mittelmeer spielen sie selten eine Rolle und werden nur angezeigt, wenn sie ins Gewicht fallen.",
    "faq_windy_q": "Was ist der Unterschied zu Windy oder der OhMyWind-App?",
    "faq_windy_a": "Windy zeigt das Wetter; OhMyWind berechnet damit Ihren Törn. Die App rechnet dasselbe mit der Maus; mit einem Assistenten fragen Sie mit Ihren eigenen Worten und vergleichen mehrere Abfahrten oder Routen auf einmal.",
    "faq_price_q": "Welcher Assistent, und was kostet es?",
    "faq_price_a": "In Claude und ChatGPT genügt ein Klick, in Vibe (ehemals Le Chat von Mistral) ein paar Einstellungen. OhMyWind ist kostenlos und ohne Konto; es gilt nur Ihr Abonnement beim Assistenten, falls es kostenpflichtig ist.",
    "noassist_title": "Lieber selbst einzeichnen?",
    "noassist_body": "Zeichnen Sie auf ohmywind.fr Ihre Route auf der Karte ein, wählen Sie Ihr Boot und die Abfahrtszeit. Dieselben Berechnungen, ohne Assistent.",
    "noassist_cta": "ohmywind.fr öffnen",
    "devs_title": "Für Entwickler",
    "devs_hint": "Serveradresse, Quellcode, Selbst-Hosting",
    "devs_address": "Adresse des MCP-Servers",
    "copy": "Kopieren",
    "devs_other": "Für jeden anderen MCP-kompatiblen Assistenten (Cursor, VS Code, Goose&hellip;): Fügen Sie diese Adresse hinzu, ohne Authentifizierung.",
    "devs_source_title": "Open Source",
    "devs_source_body": f"Code unter AGPL-3.0 auf {_A_GITHUB}github.com/qdonnars/ohmywind</a>. Selbst hostbar (Fly, Modal, VPS). Die erste Anfrage nach einer Pause kann ein paar Sekunden dauern.",
    "footer_app": "Web-App",
    "footer_method": "Methodik",
    "footer_youtube": "YouTube",
    "footer_github": "GitHub",
    "footer_data": f"Vorhersagen von {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0)",
    "footer_status": "Server online",
}

# Italian takes the impersonal register of the web app: infinitives for what
# the reader does, "il comandante" for who decides.
IT = {
    "title": "OhMyWind: l'assistente fa i calcoli, il comando resta a bordo",
    "meta_description": "Collegare OhMyWind a Claude, ChatGPT o Vibe: durata, ora di partenza, vento, mare, maree e correnti calcolati per la propria barca con le previsioni del giorno. Gratuito, senza account.",
    "og_description": "L'assistente calcola la navigazione. Il comando resta a bordo.",
    "language_nav": "Lingua",
    "open_app": "Aprire l'app",
    "h1": "Basta chiedere all'assistente. OhMyWind fa i calcoli.",
    "lede": "Durata, ora di partenza, vento, mare e correnti, con le previsioni del giorno. Il comando resta a bordo.",
    "claude_cta": "Aggiungi a Claude",
    "chatgpt_cta": "Aggiungi a ChatGPT",
    "vibe_cta": "Collegare a Vibe: mostrare i passaggi",
    "vibe_step_open": f"Aprire {_A_MISTRAL}chat.mistral.ai</a> e accedere.",
    "vibe_step_menu": f"Nella barra laterale sinistra, aprire {_it('Intelligence')} &rarr; {_it('Connectors')} (nell'interfaccia francese: Intelligence &rarr; Connecteurs), poi cliccare su {_it('Add MCP server')}.",
    "vibe_step_name": f"Compilare {_it('Name')}: <code>OhMyWind</code> &middot; {_it('Auth')}: <code>None</code>.",
    "vibe_step_url": "Incollare questo indirizzo nel campo <strong>URL</strong>:",
    "vibe_step_enable": "Salvare, poi attivare OhMyWind in una conversazione qualsiasi.",
    "vibe_step_link": f"Vibe non mostra la carta nella conversazione: l'assistente fornisce un link che la apre su {_A_SITE}ohmywind.fr</a>.",
    "no_assistant_link": "Nessun assistente? La stessa simulazione su ohmywind.fr",
    "send_label": "Invia",
    "questions_label": "Domande di esempio",
    "stat_best": "Partenza migliore",
    "q1_chip": "Una traversata",
    "q1": "Marsiglia &rarr; Porquerolles domani alle 8:00 con un Sun Odyssey 36: quanto ci vuole?",
    "q1_answer": "Domani è sconsigliato: maestrale da 31 a 38 nodi, raffiche a 48 e mare agitato fino a 2,7 m avvicinandosi a Giens. Ci vorrebbero 7 h 45, con andatura portante, in un mare molto sgradevole.",
    "q1_alert": "Maestrale 31&ndash;38 kn · mare agitato 2,7 m",
    "q2_chip": "La finestra giusta",
    "q2": "Stessa traversata: qual è la partenza migliore nei prossimi tre giorni?",
    "q2_answer": "Martedì alle 6:00. Il maestrale cala lunedì sera; martedì mattina vento debole e mare da 0,5 a 0,9 m. Prevedere un po' di motore: arrivo verso le 14:30.",
    "q2_best": "mar 6:00",
    "q3_chip": "Si può partire?",
    "q3": "E lunedì a mezzogiorno, si può partire?",
    "q3_answer": "No: il maestrale soffia ancora fino a 31 nodi all'inizio, mare molto mosso da 1,5 a 2,1 m, e si arriverebbe col buio verso le 20:00.",
    "q3_alert": "Mare molto mosso · arrivo col buio",
    "stat_duration": "Durata",
    "stat_arrival": "Arrivo",
    "why_title": "Perché non chiedere direttamente all'assistente?",
    "why_sub": "Un assistente sa parlare di barche, ma non conosce il meteo di domani e sbaglia i calcoli delle maree. OhMyWind gli fornisce le previsioni e fa i calcoli al suo posto.",
    "why_question_label": "La stessa domanda:",
    "why_question": "Trébeurden &rarr; Île de Batz domani con un First 27: a che ora partire?",
    "why_alone_title": "L'assistente da solo",
    "why_alone_answer": "Partire circa due ore dopo l'alta marea per avere la corrente a favore, e contare tre ore di navigazione. Controllare il meteo prima di partire.",
    "why_alone_1": "Nessuna previsione del giorno: risponde «in generale»",
    "why_alone_2": "Sbaglia facilmente l'ora della marea",
    "why_alone_3": "Dimentica le controcorrenti",
    "why_alone_4": "Non conosce la velocità della barca",
    "why_with_title": "Con OhMyWind",
    "why_with_answer": "Partire alle 9:40: la corrente porta fino all'ingresso del canale di Batz, arrivo verso le 12:50, prima dell'inversione. Vento da ovest da 10 a 14 nodi, mare 0,8 m. Partendo dopo le 11:00 si finirebbe controcorrente.",
    "why_with_1": "Previsioni del giorno, più modelli a confronto",
    "why_with_2": "Orari di marea alla partenza e all'arrivo, correnti calcolate ora per ora lungo la rotta",
    "why_with_3": "Una velocità realistica per il tipo di barca",
    "why_with_4": "La rotta sulla carta, da verificare con un colpo d'occhio",
    "why_note": "Risposte di esempio, per mostrare la differenza.",
    "skipper_title": "Il comando resta a bordo",
    "skipper_sub": "Né pilota automatico né router da regata: un membro dell'equipaggio che fa i calcoli noiosi e li spiega.",
    "skipper_1_title": "Simula, il comandante decide",
    "skipper_1_body": "OhMyWind non traccia la rotta e non dice «si parte». Calcola come andrebbe la navigazione che si ha in mente, e lascia il giudizio a chi comanda.",
    "skipper_2_title": "Calcoli pubblici",
    "skipper_2_body": f"Il metodo è descritto nella {_A_METHOD}pagina Metodologia</a> e il codice è aperto: chiunque può verificare da dove vengono i numeri.",
    "skipper_3_title": "Un parere in più, non l'unico",
    "skipper_3_body": "Da confrontare con la carta nautica, i portolani, il bollettino meteo e i veterani del porto. Preparare la navigazione resta uno dei piaceri del marinaio.",
    "video_title": "Una demo vale più di mille parole",
    "video_sub": "Una sessione reale, in francese, filmata così com'è: solo l'attesa è accelerata.",
    "video_label": "Avviare il video dimostrativo, in francese (carica il lettore YouTube)",
    "video_alt": "Le Four ou le Fromveur ? Una traversata da L'Aber Wrac'h a Camaret tracciata su una carta del mare d'Iroise.",
    "video_caption": "L'Aber Wrac'h &rarr; Camaret, per il Chenal du Four o per il Fromveur? Con una burrasca annunciata, l'assistente consiglia di restare in porto.",
    "video_more": f"{_A_YOUTUBE}Altre demo su YouTube</a>",
    "video_frame_title": "Video dimostrativo di OhMyWind",
    "copied": "Copiato",
    "faq_title": "Le domande frequenti",
    "faq_decide_q": "Decide al posto mio?",
    "faq_decide_a": "No. OhMyWind simula la navigazione descritta e l'assistente ne spiega il risultato. Partire o no resta una decisione del comandante.",
    "faq_reliable_q": "È affidabile?",
    "faq_reliable_a": f"Quanto le previsioni da cui parte: i migliori modelli meteo disponibili, più affidabili a due giorni che a dieci. Sono previsioni, non osservazioni: verificare sempre la rotta sulla carta e il bollettino del giorno. Il dettaglio dei calcoli è nella {_A_METHOD}pagina Metodologia</a>.",
    "faq_tides_q": "E le maree, le correnti?",
    "faq_tides_a": "Sono calcolate ora per ora lungo la rotta, con dati ad alta precisione sulla costa atlantica francese. Nel Mediterraneo contano raramente e vengono mostrate solo quando pesano.",
    "faq_windy_q": "Che differenza c'è con Windy o con l'app OhMyWind?",
    "faq_windy_a": "Windy mostra il meteo; OhMyWind ci calcola la navigazione. L'app fa gli stessi calcoli con il mouse; con l'assistente si chiede con parole proprie e si confrontano più partenze o rotte in un colpo solo.",
    "faq_price_q": "Quale assistente, e quanto costa?",
    "faq_price_a": "Claude e ChatGPT lo aggiungono con un clic, Vibe (ex Le Chat di Mistral) con qualche impostazione. OhMyWind è gratuito e senza account; conta solo l'abbonamento all'assistente, se è a pagamento.",
    "noassist_title": "Si preferisce tracciare da sé?",
    "noassist_body": "Su ohmywind.fr si disegna la rotta sulla carta, si sceglie la barca e l'ora di partenza. Stessi calcoli, senza assistente.",
    "noassist_cta": "Aprire ohmywind.fr",
    "devs_title": "Per gli sviluppatori",
    "devs_hint": "Indirizzo del server, codice sorgente, self-hosting",
    "devs_address": "Indirizzo del server MCP",
    "copy": "Copiare",
    "devs_other": "Per qualsiasi altro assistente compatibile MCP (Cursor, VS Code, Goose&hellip;): aggiungere questo indirizzo, senza autenticazione.",
    "devs_source_title": "Open source",
    "devs_source_body": f"Codice con licenza AGPL-3.0 su {_A_GITHUB}github.com/qdonnars/ohmywind</a>. Ospitabile in proprio (Fly, Modal, VPS). La prima richiesta dopo un periodo di inattività può richiedere qualche secondo.",
    "footer_app": "App web",
    "footer_method": "Metodologia",
    "footer_youtube": "YouTube",
    "footer_github": "GitHub",
    "footer_data": f"Previsioni {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0)",
    "footer_status": "Server attivo",
}

ES = {
    "title": "OhMyWind: su asistente hace los cálculos, usted sigue siendo el patrón",
    "meta_description": "Conecte OhMyWind a Claude, ChatGPT o Vibe: duración, hora de salida, viento, mar, mareas y corrientes calculados para su barco con las previsiones del día. Gratis, sin cuenta.",
    "og_description": "Su asistente calcula la travesía. Usted sigue siendo el patrón.",
    "language_nav": "Idioma",
    "open_app": "Abrir la app",
    "h1": "Pregunte a su asistente. OhMyWind hace los cálculos.",
    "lede": "Duración, hora de salida, viento, mar y corrientes, con las previsiones del día. Usted sigue siendo el patrón.",
    "claude_cta": "Añadir a Claude",
    "chatgpt_cta": "Añadir a ChatGPT",
    "vibe_cta": "Conectar con Vibe: ver los pasos",
    "vibe_step_open": f"Abra {_A_MISTRAL}chat.mistral.ai</a> e inicie sesión.",
    "vibe_step_menu": f"En la barra lateral izquierda, abra {_es('Intelligence')} &rarr; {_es('Connectors')} (en la interfaz francesa: Intelligence &rarr; Connecteurs) y luego haga clic en {_es('Add MCP server')}.",
    "vibe_step_name": f"Rellene {_es('Name')}: <code>OhMyWind</code> &middot; {_es('Auth')}: <code>None</code>.",
    "vibe_step_url": "Pegue esta dirección en el campo <strong>URL</strong>:",
    "vibe_step_enable": "Guarde y luego active OhMyWind en cualquier conversación.",
    "vibe_step_link": f"Vibe no muestra la carta en la conversación: el asistente le da un enlace que la abre en {_A_SITE}ohmywind.fr</a>.",
    "no_assistant_link": "¿Sin asistente? Haga la misma simulación en ohmywind.fr",
    "send_label": "Enviar",
    "questions_label": "Preguntas de ejemplo",
    "stat_best": "Mejor salida",
    "q1_chip": "Una travesía",
    "q1": "Marsella &rarr; Porquerolles mañana a las 8:00 en un Sun Odyssey 36: ¿cuánto se tarda?",
    "q1_answer": "Le desaconsejo mañana: mistral de 31 a 38 nudos, rachas de 48 y fuerte marejada de hasta 2,7 m al acercarse a Giens. Se haría en 7 h 45, con viento portante, en un mar muy incómodo.",
    "q1_alert": "Mistral 31&ndash;38 kn · fuerte marejada 2,7 m",
    "q2_chip": "La ventana adecuada",
    "q2": "La misma travesía: ¿cuál es la mejor salida en los próximos tres días?",
    "q2_answer": "El martes a las 6:00. El mistral amaina el lunes por la noche; el martes por la mañana, viento flojo y mar de 0,5 a 0,9 m. Cuente con algo de motor: llegada hacia las 14:30.",
    "q2_best": "mar. 6:00",
    "q3_chip": "¿Se puede salir?",
    "q3": "¿Y el lunes a mediodía, se puede salir?",
    "q3_answer": "No: el mistral aún sopla hasta 31 nudos al principio, marejada de 1,5 a 2,1 m, y llegaría de noche hacia las 20:00.",
    "q3_alert": "Marejada · llegada de noche",
    "stat_duration": "Duración",
    "stat_arrival": "Llegada",
    "why_title": "¿Por qué no preguntar directamente al asistente?",
    "why_sub": "Un asistente sabe hablar de barcos, pero no conoce el tiempo de mañana y calcula mal las mareas. OhMyWind le da las previsiones y hace los cálculos por él.",
    "why_question_label": "La misma pregunta:",
    "why_question": "Trébeurden &rarr; isla de Batz mañana en un First 27: ¿a qué hora salir?",
    "why_alone_title": "Su asistente solo",
    "why_alone_answer": "Salga unas dos horas después de la pleamar para tener la corriente a favor, y cuente tres horas de navegación. Consulte el tiempo antes de salir.",
    "why_alone_1": "Sin previsiones del día: responde «en general»",
    "why_alone_2": "Se equivoca fácilmente con la hora de la marea",
    "why_alone_3": "Olvida las contracorrientes",
    "why_alone_4": "No conoce la velocidad de su barco",
    "why_with_title": "Con OhMyWind",
    "why_with_answer": "Salga a las 9:40: la corriente le lleva hasta la entrada del canal de Batz, llegada hacia las 12:50, antes del repunte. Viento del oeste de 10 a 14 nudos, mar de 0,8 m. Salir después de las 11:00 le haría terminar contra la corriente.",
    "why_with_1": "Previsiones del día, varios modelos comparados",
    "why_with_2": "Horas de marea a la salida y a la llegada, corrientes calculadas hora a hora a lo largo de la ruta",
    "why_with_3": "Una velocidad realista para su tipo de barco",
    "why_with_4": "La ruta en la carta, para comprobarla de un vistazo",
    "why_note": "Respuestas de ejemplo, para ilustrar la diferencia.",
    "skipper_title": "Usted sigue siendo el patrón",
    "skipper_sub": "Ni piloto automático ni router de regata: un tripulante que hace los cálculos tediosos y se los explica.",
    "skipper_1_title": "Simula, usted decide",
    "skipper_1_body": "OhMyWind no traza su ruta ni le dice «salga». Calcula cómo sería la travesía que usted tiene en mente y deja que usted juzgue.",
    "skipper_2_title": "Cálculos abiertos",
    "skipper_2_body": f"El método se detalla en la {_A_METHOD}página de Metodología</a> y el código es abierto: cualquiera puede comprobar de dónde salen las cifras.",
    "skipper_3_title": "Una opinión más, no la única",
    "skipper_3_body": "Para contrastar con la carta, los derroteros, el parte meteorológico y los veteranos del puerto. Preparar la travesía sigue siendo uno de los placeres de navegar.",
    "video_title": "Una demo vale más que mil palabras",
    "video_sub": "Una sesión real, en francés, grabada tal cual: solo la espera está acelerada.",
    "video_label": "Reproducir el vídeo de demostración, en francés (carga el reproductor de YouTube)",
    "video_alt": "Le Four ou le Fromveur ? Una travesía de L'Aber Wrac'h a Camaret trazada sobre una carta del mar de Iroise.",
    "video_caption": "L'Aber Wrac'h &rarr; Camaret, ¿por el Chenal du Four o por el Fromveur? Con un temporal anunciado, el asistente aconseja quedarse en puerto.",
    "video_more": f"{_A_YOUTUBE}Más demostraciones en YouTube</a>",
    "video_frame_title": "Vídeo de demostración de OhMyWind",
    "copied": "Copiado",
    "faq_title": "Sus preguntas",
    "faq_decide_q": "¿Decide por mí?",
    "faq_decide_a": "No. OhMyWind simula la travesía que usted describe y el asistente le explica el resultado. Salir o no sigue siendo su decisión como patrón.",
    "faq_reliable_q": "¿Es fiable?",
    "faq_reliable_a": f"Tanto como las previsiones de las que parte: los mejores modelos meteorológicos disponibles, más fiables a dos días que a diez. Son previsiones, no observaciones: compruebe siempre la ruta en la carta y el parte del día. El detalle de los cálculos está en la {_A_METHOD}página de Metodología</a>.",
    "faq_tides_q": "¿Y las mareas, las corrientes?",
    "faq_tides_a": "Se calculan hora a hora a lo largo de la ruta, con datos de alta precisión en la costa atlántica francesa. En el Mediterráneo rara vez cuentan y solo se muestran cuando pesan.",
    "faq_windy_q": "¿Qué diferencia hay con Windy o con la app OhMyWind?",
    "faq_windy_a": "Windy muestra el tiempo; OhMyWind calcula su travesía con él. La app hace los mismos cálculos con el ratón; con el asistente, usted pregunta con sus propias palabras y compara varias salidas o rutas de una vez.",
    "faq_price_q": "¿Qué asistente, y cuánto cuesta?",
    "faq_price_a": "Claude y ChatGPT lo añaden con un clic, Vibe (antes Le Chat de Mistral) con unos ajustes. OhMyWind es gratis y sin cuenta; solo cuenta su suscripción al asistente, si es de pago.",
    "noassist_title": "¿Prefiere trazarla usted mismo?",
    "noassist_body": "En ohmywind.fr, dibuje su ruta en la carta, elija su barco y la hora de salida. Los mismos cálculos, sin asistente.",
    "noassist_cta": "Abrir ohmywind.fr",
    "devs_title": "Para desarrolladores",
    "devs_hint": "Dirección del servidor, código fuente, autoalojamiento",
    "devs_address": "Dirección del servidor MCP",
    "copy": "Copiar",
    "devs_other": "Para cualquier otro asistente compatible con MCP (Cursor, VS Code, Goose&hellip;): añada esta dirección, sin autenticación.",
    "devs_source_title": "Open source",
    "devs_source_body": f"Código con licencia AGPL-3.0 en {_A_GITHUB}github.com/qdonnars/ohmywind</a>. Autoalojable (Fly, Modal, VPS). La primera petición tras un periodo de inactividad puede tardar unos segundos.",
    "footer_app": "App web",
    "footer_method": "Metodología",
    "footer_youtube": "YouTube",
    "footer_github": "GitHub",
    "footer_data": f"Previsiones de {_A_OPEN_METEO}Open-Meteo</a> (CC BY 4.0)",
    "footer_status": "Servidor en línea",
}

# English first: it is the reference the others are checked against, and the
# fallback when nothing the reader asks for is served.
COPY = {"en": EN, "fr": FR, "de": DE, "it": IT, "es": ES}
