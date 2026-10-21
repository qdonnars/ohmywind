## Una domanda semplice: quando partire?

Le app di navigazione spesso fanno moltissime cose, e costano care, per esigenze che restano semplici. OhMyWind parte da un'osservazione sul campo: per un'uscita in giornata o una breve traversata, il diportista non ha bisogno di un routing completo, ha bisogno di sapere qual è la finestra di partenza giusta.

L'utente [traccia la rotta](/plan), sceglie un tipo di barca, e OhMyWind calcola per ogni ora di partenza possibile:

- la durata e l'ora di arrivo, tappa per tappa, a partire dalle polari della barca;
- il vento, il mare e la corrente incontrati su ogni tratto;
- un punteggio di complessità da 1 a 5, con avvisi concreti (vento teso, mare formato, vento contro corrente).

Le finestre si confrontano a colpo d'occhio, così come più rotte per la stessa traversata. La pagina [Confrontare i miei spot](/comparer) mette inoltre gli spot preferiti fianco a fianco, ora per ora.

## Negli assistenti IA, una conversazione da marinai

OhMyWind si collega agli assistenti di intelligenza artificiale (Claude, ChatGPT, Le Chat…) grazie al protocollo aperto [MCP](https://modelcontextprotocol.io). Il diportista descrive la sua uscita come farebbe con un membro dell'equipaggio, «domani, da Marsiglia a Porquerolles con un Sun Odyssey 36, quando parto?», e l'assistente interroga OhMyWind per rispondere. La versione 1.10, pubblicata il 17 ottobre 2026, ne fa un vero strumento di bordo:

- **Una traversata in un'unica vista**: prima l'elenco delle partenze possibili, poi la rotta su una mappa e il dettaglio tratto per tratto della partenza scelta, mostrati nella conversazione sugli assistenti che lo consentono, come Claude e ChatGPT. Altrove, un link apre lo stesso piano su ohmywind.fr.
- **Le domande sulla marea, senza calcolare una traversata**: l'ora dell'acqua stanca all'ingresso di un passaggio, la forza e la direzione della corrente, l'alta e la bassa marea, il coefficiente di marea.
- **Due opzioni confrontate in un'unica richiesta**: a nord o a sud di un'isola, verso l'una o l'altra destinazione, partenza per partenza.
- **Risposte nell'ora di bordo**: date nell'ora locale del diportista, con il giorno della settimana, più brevi e quindi più rapide.
- **Una rotta che attraversa la terraferma viene rifiutata** prima di qualsiasi calcolo, e all'assistente viene chiesto di ridisegnarla in mare.

Il collegamento richiede un minuto, senza account OhMyWind né chiave API: basta seguire la [guida passo passo](https://mcp.ohmywind.fr) con l'indirizzo `https://mcp.ohmywind.fr/mcp`. Tutte le modifiche sono nelle [Novità](/a-propos/nouveautes).

## Le correnti di marea, prese sul serio

Il calcolo delle correnti di marea copre gran parte delle acque europee: Manica, golfo di Biscaglia, mare del Nord, baia tedesca ed Elba. In ogni punto, OhMyWind usa l'atlante di marea più preciso disponibile, prodotto da enti pubblici (SHOM, Ifremer, BSH, Copernicus). Questi dati sono stati confrontati con misure reali di radar costieri.

Dove non esiste una fonte affidabile, per esempio in alcuni passaggi stretti che i modelli non risolvono, l'app mostra «corrente sconosciuta» invece di un numero fuorviante. Una [mappa di copertura](/methodologie/courants), consultabile sul sito, indica punto per punto quale fonte viene usata.

## I migliori modelli meteo pubblici, a scelta dell'utente

OhMyWind riunisce i modelli meteorologici pubblici di riferimento: AROME di Météo-France (maglia di 1,3 km), ICON-EU, ECMWF e GFS. L'utente sceglie il modello o lascia che lo strumento adotti il più preciso disponibile per la sua zona. Fonti, calcoli e limiti sono descritti nella [metodologia](/methodologie).

## Disponibile ovunque

- Sul web, senza installazione: [ohmywind.fr](/)
- Su Android, tramite il [Google Play Store](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- In cinque lingue: francese, inglese, tedesco, spagnolo e italiano
- Negli assistenti di intelligenza artificiale compatibili con MCP, come Claude, ChatGPT o Le Chat

## Un progetto aperto, sostenuto da un'associazione

OhMyWind è sviluppato da Quentin Donnars, ingegnere Arts et Métiers, data scientist e istruttore di vela. Il progetto è sostenuto da Libramer, associazione senza scopo di lucro di diritto francese, legge del 1901, che si propone di rendere i dati pubblici utili ai naviganti e, in prospettiva, di costruire una banca dati cooperativa delle correnti di marea.

Il [codice sorgente è pubblico](https://github.com/qdonnars/ohmywind) ([licenza AGPL](https://github.com/qdonnars/ohmywind/blob/main/LICENSE)). Il modello di finanziamento si basa sulla sponsorizzazione di marchi della nautica, senza alcuna influenza sui calcoli né sulle raccomandazioni dello strumento.

> «I dati meteorologici e oceanografici pubblici sono di una qualità notevole, ma restano difficili da usare per il diportista. OhMyWind li mette al servizio di una domanda molto concreta: a che ora partire perché la navigazione vada bene.»
>
> Quentin Donnars, fondatore di OhMyWind

## Cosa non è OhMyWind

OhMyWind è uno strumento di supporto alle decisioni. Non sostituisce il bollettino meteo marino ufficiale, né le carte nautiche aggiornate, né il giudizio dello skipper, che resta l'unico responsabile della navigazione.

## Ne hanno parlato

[Bateaux.com](https://www.barchenews.it/news/52477/ohmywind-il-progetto-open-source-che-punta-a-ripensare-la-preparazione-di-una-navigazione) (in italiano su barchenews.it, e in francese, inglese, tedesco e spagnolo), [BOOTE](https://www.boote-magazin.de/en/equipment/technology/navigation-ohmywind-a-free-weather-planner-with-ai-functionality/), YACHT. Tutti gli articoli sono raccolti nella [rassegna stampa](/presse).

## Contatto stampa

Quentin Donnars, fondatore: [contact@ohmywind.fr](mailto:contact@ohmywind.fr)

Immagini (logo, schermate) disponibili su richiesta.

## Link utili

- **App web**: [ohmywind.fr](/)
- **Pianificare una traversata**: [ohmywind.fr/plan](/plan)
- **Confrontare gli spot preferiti**: [ohmywind.fr/comparer](/comparer)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- **Metodologia**: [ohmywind.fr/methodologie](/methodologie)
- **Mappa delle correnti di marea**: [ohmywind.fr/methodologie/courants](/methodologie/courants)
- **Novità (versione 1.10 e precedenti)**: [ohmywind.fr/a-propos/nouveautes](/a-propos/nouveautes)
- **Server MCP**: `https://mcp.ohmywind.fr/mcp`
- **Guida al collegamento con gli assistenti IA (Claude, ChatGPT, Le Chat) e video dimostrativo**: [mcp.ohmywind.fr](https://mcp.ohmywind.fr) (in inglese)
- **Altri client MCP (Cursor, VS Code, Goose…)**: [guida rapida](https://github.com/qdonnars/ohmywind#try-it-in-30-seconds) (in inglese)
- **Protocollo MCP**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Codice sorgente**: [github.com/qdonnars/ohmywind](https://github.com/qdonnars/ohmywind)
- **Cap Innovation, Paris Nautic Show 2026**: [parisnauticshow.com/cap-innovation](https://www.parisnauticshow.com/cap-innovation/) (in francese)
- **Rassegna stampa**: [ohmywind.fr/presse](/presse)
- **Privacy**: [ohmywind.fr/confidentialite](/confidentialite)
- **Associazione**: Libramer, associazione senza scopo di lucro di diritto francese, legge del 1901
