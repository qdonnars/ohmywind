# Informativa sulla privacy

*Questa pagina è una traduzione. In caso di discordanza fa fede la versione francese
([/confidentialite](/confidentialite)).*

*Ultimo aggiornamento: 2 settembre 2026*

OhMyWind è un pianificatore di navigazione a vela open source, disponibile su
[ohmywind.fr](https://ohmywind.fr) e sotto forma di applicazione Android. È pubblicato
a titolo personale e non commerciale da Tinqueen. Per qualsiasi domanda relativa alla
presente informativa: [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

Il principio generale: **OhMyWind non ha account utente, né banca dati, né strumenti di
misurazione del pubblico**. Nessun dato personale è conservato su server OhMyWind.

## Che cosa l'applicazione non fa

- Nessun account, nessuna registrazione, nessun identificativo.
- Nessun cookie di tracciamento, nessun tracciante pubblicitario.
- Nessun SDK di analisi, di misurazione del pubblico o di segnalazione degli arresti
  anomali.
- Nessuna rivendita né condivisione commerciale dei dati, con nessuno.

## Dati trattati

### Posizione geografica

Se lo si autorizza, la posizione serve unicamente a centrare la mappa e a ottenere le
previsioni nelle vicinanze. Viene trasmessa ai servizi meteo e cartografici elencati di
seguito per il tempo necessario a rispondere alla richiesta e non viene mai registrata
da OhMyWind. L'autorizzazione è facoltativa e revocabile in qualsiasi momento nelle
impostazioni del browser o di Android.

### Piani di navigazione e impostazioni

I punti di passaggio, le polari della barca e le preferenze sono memorizzati
**localmente sul dispositivo** (archiviazione locale del browser o dell'applicazione).
Escono dal dispositivo soltanto quando si avvia una stima di traversata: le coordinate
dei punti di passaggio vengono allora inviate al backend OhMyWind (ospitato su Hugging
Face) per eseguire il calcolo, trattate in memoria e poi dimenticate. Cancellare i dati
del sito nel browser (o i dati dell'applicazione in Android) elimina tutto.

## Servizi terzi

Per funzionare, l'applicazione chiama direttamente i servizi seguenti dal dispositivo.
Come per qualsiasi richiesta Internet, ciascuno di essi vede l'indirizzo IP; la tabella
indica i dati applicativi trasmessi in aggiunta.

| Servizio | Dati trasmessi | Finalità |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordinate geografiche consultate | Previsioni di vento, onde e maree; geocodifica |
| Backend OhMyWind, ospitato da [Hugging Face](https://huggingface.co/privacy) | Coordinate e punti di passaggio | Calcolo del piano di traversata |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordinate geografiche | Geocodifica inversa (nome del luogo visualizzato) |
| [Photon (Komoot)](https://photon.komoot.io) | Testo delle ricerche di luoghi | Ricerca di luoghi |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Area di mappa visualizzata | Sfondi cartografici (tasselli) |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nulla, salvo che si scelga di cliccare sul link di sostegno | Donazioni |

Questi servizi sono responsabili del trattamento tecnici e indipendenti, disciplinati
dalle rispettive informative sulla privacy (link nella tabella).

I caratteri tipografici sono serviti da ohmywind.fr: visualizzare una pagina non invia
alcuna richiesta a Google Fonts e quindi nessun indirizzo IP.

## Autorizzazioni Android

L'applicazione Android richiede una sola autorizzazione: la **posizione**, delegata al
sito web per gli usi descritti sopra. È facoltativa: l'applicazione funziona anche
senza, basta allora cercare un luogo manualmente.

## I Suoi diritti

Ai sensi del GDPR, Lei dispone dei diritti di accesso, rettifica, opposizione e
cancellazione. Poiché OhMyWind non conserva alcun dato personale lato server,
l'essenziale si esercita direttamente sul dispositivo, cancellando i dati del sito o
dell'applicazione. Per qualsiasi domanda o richiesta:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Aggiornamento della presente informativa

Ogni modifica sarà pubblicata su questa pagina, con aggiornamento della data in testa
al documento.
