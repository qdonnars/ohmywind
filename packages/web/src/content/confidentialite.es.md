# Política de privacidad

*Esta página es una traducción. En caso de discrepancia, la versión francesa
([/confidentialite](/confidentialite)) es la referencia.*

*Última actualización: 24 de noviembre de 2026*

OhMyWind es un planificador de navegación a vela de código abierto, disponible en
[ohmywind.fr](https://ohmywind.fr) y en forma de aplicación móvil. El responsable del
tratamiento es la asociación Libramer (asociación sin ánimo de lucro de derecho francés,
ley de 1901, RNA W751285736), con domicilio social en 51 rue Fondary, 75015 París,
Francia. Para cualquier pregunta relativa a esta política:
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

El principio general: **OhMyWind no tiene ningún fichero sobre usted**. No hay cuentas
de usuario, ni base de datos, ni herramienta de medición de audiencia. Lo que la
aplicación envía sirve para responder a la solicitud en curso; los únicos rastros son
registros técnicos, descritos más abajo.

## Lo que la aplicación no hace

- Ninguna cuenta, ningún registro, ningún identificador.
- Ninguna cookie de seguimiento, ningún rastreador publicitario.
- Ningún SDK de analítica, de medición de audiencia ni de informe de fallos.
- Ninguna reventa ni cesión comercial de datos, a nadie.

## Datos tratados

### Posición geográfica

Si usted lo autoriza, su posición sirve para centrar el mapa, mostrar las previsiones en
ese lugar y ordenar los lugares cercanos durante una búsqueda. Se transmite a los
servicios indicados a continuación durante el tiempo necesario para responder a la
solicitud. No se conserva en ninguna base de datos; sus coordenadas pueden figurar,
durante 7 días como máximo, en el registro técnico del servicio de reenvío descrito más
abajo. El permiso es opcional y revocable en cualquier
momento en los ajustes de su navegador o de su teléfono.

### Planes de navegación y ajustes

Sus spots, puntos de paso, polares de barco y preferencias se almacenan **localmente en
su dispositivo** (almacenamiento local del navegador o de la aplicación). Borrar los
datos del sitio en su navegador (o los datos de la aplicación en los ajustes de su
teléfono) lo elimina todo.

Lo que sale de su dispositivo, y para qué:

- **Un lugar abierto en el mapa**, o su posición si usted la ha autorizado: sus
  coordenadas se envían a Open-Meteo para las previsiones, y al backend de OhMyWind para
  la línea de costa, la marea y las corrientes.
- **Un punto de paso**, en cuanto se coloca en el mapa del planificador: sus coordenadas
  se envían a EMODnet para mostrar la sonda.
- **Una ruta que usted estima o compara**: sus coordenadas se envían a Open-Meteo y al
  backend de OhMyWind para las previsiones, la marea y las corrientes a lo largo del
  recorrido. Para una estimación de travesía, el backend recibe además la fecha de
  salida o de llegada, el barco (tipo de barco o polar), el coeficiente de rendimiento y
  los modelos elegidos, y realiza el cálculo en memoria.

## Registros técnicos

El backend de OhMyWind escribe una línea por solicitud: el método, la ruta de acceso sin
sus parámetros (por ejemplo `/api/v1/passage`), el estado de la respuesta, su duración,
su tamaño y una huella corta calculada a partir de la dirección de quien llama, que solo
sirve para detectar un abuso. Nunca escribe en ella una dirección IP, coordenadas, texto
de búsqueda ni una ruta. Para limitar el número de solicitudes por minuto, la dirección
se guarda en memoria durante ese límite, sin escribirse en ningún sitio.

El servicio de reenvío situado delante del backend, operado por Cloudflare, guarda
durante 7 días como máximo un registro técnico de cada solicitud: la dirección web
solicitada, completa, e información técnica sobre quien llama facilitada por
Cloudflare, que puede incluir su dirección IP. En las solicitudes de línea de costa,
marea y corrientes en torno a un lugar, esta dirección web contiene las coordenadas del
lugar. El contenido de las solicitudes no figura en él: los puntos de paso, la fecha y
el barco de una estimación nunca aparecen. Este registro sirve para diagnosticar averías
y no se utiliza para nada más; se borra por sí solo.

## Servicios de terceros

Para funcionar, la aplicación recurre a los siguientes servicios. Como en cualquier
petición de Internet, cada uno de ellos ve su dirección IP; la tabla indica los datos de
aplicación que se transmiten además.

| Servicio | Datos transmitidos | Finalidad |
| --- | --- | --- |
| [Cloudflare](https://www.cloudflare.com/privacypolicy/) | Peticiones al sitio y al backend de OhMyWind; registro de las peticiones reenviadas, 7 días como máximo (véase «Registros técnicos») | Alojamiento del sitio; reenvío al backend |
| Backend de OhMyWind, alojado por [Hugging Face](https://huggingface.co/privacy) | Coordenadas de los lugares abiertos y de las rutas consultadas; en una estimación, puntos de paso, fecha, barco y ajustes | Línea de costa, marea y corrientes; cálculo del plan de travesía |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordenadas de los lugares y rutas consultados; texto de sus búsquedas de lugares, si Photon no responde | Previsiones de viento, olas y mareas; búsqueda de lugares de reserva |
| [Photon (Komoot)](https://photon.komoot.io) | Texto de sus búsquedas de lugares y, si se conoce, una posición redondeada (la suya si usted la ha autorizado, o un punto del mapa mostrado) | Búsqueda de lugares, ordenados por proximidad |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordenadas del punto donde usted crea un spot; zona del mapa mostrada, en los raros dispositivos que no pueden mostrar el mapa base habitual | Nombre del lugar (geocodificación inversa); mapa base de reserva |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Zona del mapa mostrada | Mapas base (teselas) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Zona del mapa mostrada, cuando la capa de balizamiento está activa | Balizamiento superpuesto (boyas, balizas, faros) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Coordenadas de sus puntos de paso | Sonda (profundidad) bajo cada punto de paso |
| [Ko-fi](https://more.ko-fi.com/privacy) | Nada, salvo si usted hace clic voluntariamente en el enlace de apoyo | Donaciones |

Estos servicios son encargados del tratamiento técnicos independientes, regidos por sus
propias políticas de privacidad (enlaces en la tabla). Algunos están operados por
empresas establecidas fuera de la Unión Europea, en particular Cloudflare y Hugging Face,
en Estados Unidos.

Las fuentes tipográficas se sirven desde ohmywind.fr: mostrar una página no envía
ninguna petición a Google Fonts y, por tanto, ninguna dirección IP.

## Permisos de la aplicación móvil

La aplicación móvil solicita un único permiso: la **ubicación**, delegada al sitio web
para los usos descritos más arriba. Es opcional: la aplicación funciona sin él, y en ese
caso basta con buscar un lugar manualmente.

## Sus derechos

De conformidad con el RGPD, usted dispone de derechos de acceso, rectificación,
oposición y supresión. Dado que OhMyWind no tiene ni cuenta ni fichero sobre usted, y que el
registro del servicio de reenvío se borra por sí solo en 7 días como máximo, lo esencial se ejerce directamente en su
dispositivo: borre los datos del sitio o de la aplicación. Para cualquier pregunta o
solicitud: [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Evolución de esta política

Toda modificación se publicará en esta página, con la actualización de la fecha que
figura al principio del documento.
