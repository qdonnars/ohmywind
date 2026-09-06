# Política de privacidad

*Esta página es una traducción. En caso de discrepancia, la versión francesa
([/confidentialite](/confidentialite)) es la referencia.*

*Última actualización: 2 de septiembre de 2026*

OhMyWind es un planificador de navegación a vela de código abierto, disponible en
[ohmywind.fr](https://ohmywind.fr) y en forma de aplicación Android. Está editado a
título personal y no comercial por Tinqueen. Para cualquier pregunta relativa a esta
política: [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

El principio general: **OhMyWind no tiene cuentas de usuario, ni base de datos, ni
herramienta de medición de audiencia**. Ningún dato personal se conserva en servidores
de OhMyWind.

## Lo que la aplicación no hace

- Ninguna cuenta, ningún registro, ningún identificador.
- Ninguna cookie de seguimiento, ningún rastreador publicitario.
- Ningún SDK de analítica, de medición de audiencia ni de informe de fallos.
- Ninguna reventa ni cesión comercial de datos, a nadie.

## Datos tratados

### Posición geográfica

Si usted lo autoriza, su posición sirve únicamente para centrar el mapa y obtener las
previsiones cercanas a usted. Se transmite a los servicios meteorológicos y
cartográficos indicados a continuación durante el tiempo necesario para responder a la
solicitud, y OhMyWind nunca la registra. El permiso es opcional y revocable en
cualquier momento en los ajustes de su navegador o de Android.

### Planes de navegación y ajustes

Sus puntos de paso, polares de barco y preferencias se almacenan **localmente en su
dispositivo** (almacenamiento local del navegador o de la aplicación). Solo salen de su
dispositivo cuando usted inicia una estimación de travesía: las coordenadas de los
puntos de paso se envían entonces al backend de OhMyWind (alojado en Hugging Face) para
realizar el cálculo, se tratan en memoria y después se olvidan. Borrar los datos del
sitio en su navegador (o los datos de la aplicación en Android) lo elimina todo.

## Servicios de terceros

Para funcionar, la aplicación llama directamente a los siguientes servicios desde su
dispositivo. Como en cualquier petición de Internet, cada uno de ellos ve su dirección
IP; la tabla indica los datos de aplicación que se transmiten además.

| Servicio | Datos transmitidos | Finalidad |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordenadas geográficas consultadas | Previsiones de viento, olas y mareas; geocodificación |
| Backend de OhMyWind, alojado por [Hugging Face](https://huggingface.co/privacy) | Coordenadas y puntos de paso | Cálculo del plan de travesía |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordenadas geográficas | Geocodificación inversa (nombre del lugar mostrado) |
| [Photon (Komoot)](https://photon.komoot.io) | Texto de sus búsquedas de lugares | Búsqueda de lugares |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Zona del mapa mostrada | Mapas base (teselas) |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nada, salvo si usted hace clic voluntariamente en el enlace de apoyo | Donaciones |

Estos servicios son encargados del tratamiento técnicos independientes, regidos por sus
propias políticas de privacidad (enlaces en la tabla).

Las fuentes tipográficas se sirven desde ohmywind.fr: mostrar una página no envía
ninguna petición a Google Fonts y, por tanto, ninguna dirección IP.

## Permisos de Android

La aplicación Android solicita un único permiso: la **ubicación**, delegada al sitio web
para los usos descritos más arriba. Es opcional: la aplicación funciona sin él, y en ese
caso basta con buscar un lugar manualmente.

## Sus derechos

De conformidad con el RGPD, usted dispone de derechos de acceso, rectificación,
oposición y supresión. Dado que OhMyWind no conserva ningún dato personal del lado del
servidor, lo esencial se ejerce directamente en su dispositivo: borre los datos del
sitio o de la aplicación. Para cualquier pregunta o solicitud:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Evolución de esta política

Toda modificación se publicará en esta página, con la actualización de la fecha que
figura al principio del documento.
