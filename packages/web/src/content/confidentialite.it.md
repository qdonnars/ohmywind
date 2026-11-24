# Informativa sulla privacy

*Questa pagina è una traduzione. In caso di discordanza fa fede la versione francese
([/confidentialite](/confidentialite)).*

*Ultimo aggiornamento: 24 novembre 2026*

OhMyWind è un pianificatore di navigazione a vela open source, disponibile su
[ohmywind.fr](https://ohmywind.fr) e sotto forma di applicazione mobile. Il titolare del
trattamento è l'associazione Libramer (associazione senza scopo di lucro di diritto
francese, legge del 1901, RNA W751285736), con sede legale in 51 rue Fondary, 75015
Parigi, Francia. Per qualsiasi domanda relativa alla
presente informativa: [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

Il principio generale: **OhMyWind non registra i dati degli utenti**. Non ci sono account
utente, né banca dati, né strumenti di misurazione del pubblico, e nessuna tabella che
colleghi un indirizzo IP a ricerche, posizioni o rotte. Ciò che l'applicazione invia
serve a rispondere alla richiesta in corso, senza essere registrato.

## Che cosa l'applicazione non fa

- Nessun account, nessuna registrazione, nessun identificativo.
- Nessun cookie di tracciamento, nessun tracciante pubblicitario.
- Nessun SDK di analisi, di misurazione del pubblico o di segnalazione degli arresti
  anomali.
- Nessuna rivendita né condivisione commerciale dei dati, con nessuno.

## Dati trattati

### Posizione geografica

Se lo si autorizza, la posizione serve a centrare la mappa, a mostrare le previsioni in
quel punto e a ordinare i luoghi vicini durante una ricerca. Viene trasmessa ai servizi
elencati di seguito per il tempo necessario a rispondere alla richiesta e non viene mai
registrata da OhMyWind. L'autorizzazione è facoltativa e revocabile in qualsiasi momento
nelle impostazioni del browser o del telefono.

### Piani di navigazione e impostazioni

Gli spot, i punti di passaggio, le polari della barca e le preferenze sono memorizzati
**localmente sul dispositivo** (archiviazione locale del browser o dell'applicazione).
Cancellare i dati del sito nel browser (o i dati dell'applicazione nelle impostazioni
del telefono) elimina tutto.

Che cosa esce dal dispositivo, e perché:

- **Un luogo aperto sulla mappa**, o la posizione se la si è autorizzata: le sue
  coordinate vengono inviate a Open-Meteo per le previsioni e al backend OhMyWind per la
  linea di costa, la marea e le correnti.
- **Un punto di passaggio**, non appena viene posato sulla mappa del pianificatore: le
  sue coordinate vengono inviate a EMODnet per mostrare il fondale.
- **Una rotta che si stima o si confronta**: le sue coordinate vengono inviate a
  Open-Meteo e al backend OhMyWind per le previsioni, la marea e le correnti lungo il
  percorso. Per una stima di traversata, il backend riceve anche la data di partenza o di
  arrivo, la barca (tipo di barca o polare), il coefficiente di prestazione e i modelli
  scelti, ed esegue il calcolo in memoria.

## Registri tecnici

Il backend OhMyWind scrive una riga per richiesta: il metodo, il percorso senza i suoi
parametri (per esempio `/api/v1/passage`), lo stato della risposta, la sua durata, la
sua dimensione e un'impronta breve calcolata a partire dall'indirizzo del chiamante, che
serve soltanto a individuare un abuso. Non vi scrive mai un indirizzo IP, coordinate,
testo di ricerca né una rotta. Per limitare il numero di richieste al minuto, l'indirizzo
è tenuto in memoria per la durata di questo limite, senza essere scritto da nessuna
parte.

## Servizi terzi

Per funzionare, l'applicazione si appoggia ai servizi seguenti. Come per qualsiasi
richiesta Internet, ciascuno di essi vede l'indirizzo IP; la tabella indica i dati
applicativi trasmessi in aggiunta.

| Servizio | Dati trasmessi | Finalità |
| --- | --- | --- |
| [Cloudflare](https://www.cloudflare.com/privacypolicy/) | Richieste verso il sito e verso il backend OhMyWind | Hosting del sito; inoltro verso il backend |
| Backend OhMyWind, ospitato da [Hugging Face](https://huggingface.co/privacy) | Coordinate dei luoghi aperti e delle rotte consultate; per una stima, punti di passaggio, data, barca e impostazioni | Linea di costa, marea e correnti; calcolo del piano di traversata |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordinate dei luoghi e delle rotte consultati; testo delle ricerche di luoghi, se Photon non risponde | Previsioni di vento, onde e maree; ricerca di luoghi di riserva |
| [Photon (Komoot)](https://photon.komoot.io) | Testo delle ricerche di luoghi e, se nota, una posizione arrotondata (quella dell'utente se autorizzata, oppure un punto della mappa visualizzata) | Ricerca di luoghi, ordinati per vicinanza |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordinate del punto in cui si crea uno spot; area di mappa visualizzata, sui rari dispositivi che non possono mostrare lo sfondo cartografico abituale | Nome del luogo (geocodifica inversa); sfondo cartografico di riserva |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Area di mappa visualizzata | Sfondi cartografici (tasselli) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Area di mappa visualizzata, quando il livello dei segnalamenti è attivo | Segnalamenti marittimi in sovrapposizione (boe, mede, fari) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Coordinate dei punti di passaggio | Fondale (profondità) sotto ogni punto di passaggio |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nulla, salvo che si scelga di cliccare sul link di sostegno | Donazioni |

Questi servizi sono responsabili del trattamento tecnici e indipendenti, disciplinati
dalle rispettive informative sulla privacy (link nella tabella). Alcuni sono gestiti da
società stabilite al di fuori dell'Unione europea, in particolare Cloudflare e Hugging
Face, negli Stati Uniti.

I caratteri tipografici sono serviti da ohmywind.fr: visualizzare una pagina non invia
alcuna richiesta a Google Fonts e quindi nessun indirizzo IP.

## Autorizzazioni dell'applicazione mobile

L'applicazione mobile richiede una sola autorizzazione: la **posizione**, delegata al
sito web per gli usi descritti sopra. È facoltativa: l'applicazione funziona anche
senza, basta allora cercare un luogo manualmente.

## I Suoi diritti

Ai sensi del GDPR, Lei dispone dei diritti di accesso, rettifica, opposizione e
cancellazione. Poiché OhMyWind non conserva né account, né posizioni, né ricerche, né
rotte che La riguardino, l'essenziale si esercita direttamente sul dispositivo,
cancellando i dati del sito o dell'applicazione. Per qualsiasi domanda o richiesta:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Aggiornamento della presente informativa

Ogni modifica sarà pubblicata su questa pagina, con aggiornamento della data in testa
al documento.
