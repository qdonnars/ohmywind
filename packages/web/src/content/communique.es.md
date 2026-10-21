## Una pregunta sencilla: ¿cuándo salir?

Las aplicaciones de navegación suelen hacer muchísimas cosas, y cuestan caras, para necesidades que siguen siendo sencillas. OhMyWind parte de una constatación sobre el terreno: para una salida de un día o una travesía corta, el navegante no necesita un enrutamiento completo, necesita saber cuál es la ventana de salida adecuada.

El usuario [traza su ruta](/plan), elige un tipo de barco, y OhMyWind calcula para cada hora de salida posible:

- la duración y la hora de llegada, tramo a tramo, a partir de las polares del barco;
- el viento, el mar y la corriente que encontrará en cada tramo;
- una puntuación de complejidad de 1 a 5, con avisos concretos (viento fresco, mar gruesa, viento contra corriente).

Las ventanas se comparan de un vistazo, igual que varias rutas para una misma travesía. La página [Comparar mis spots](/comparer) pone además los spots favoritos uno al lado de otro, hora a hora.

## En los asistentes de IA, una conversación de navegante

OhMyWind se conecta a los asistentes de inteligencia artificial (Claude, ChatGPT, Le Chat…) gracias al protocolo abierto [MCP](https://modelcontextprotocol.io). El navegante describe su salida como se la contaría a un tripulante, «mañana, de Marsella a Porquerolles en un Sun Odyssey 36, ¿cuándo salgo?», y el asistente consulta OhMyWind para responder. La versión 1.10, publicada el 17 de octubre de 2026, lo convierte en una verdadera herramienta de a bordo:

- **Una travesía en una sola vista**: primero la lista de salidas posibles, luego la ruta en un mapa y el detalle tramo a tramo de la salida elegida, mostrados en la conversación en los asistentes que lo permiten, como Claude y ChatGPT. En los demás, un enlace abre el mismo plan en ohmywind.fr.
- **Las preguntas de marea, sin calcular una travesía**: la hora del repunte en la entrada de un paso, la fuerza y el sentido de la corriente, la pleamar y la bajamar, el coeficiente de marea.
- **Dos opciones comparadas en una sola petición**: por el norte o por el sur de una isla, hacia uno u otro destino, salida a salida.
- **Respuestas en la hora de a bordo**: dadas en la hora local del navegante, con el día de la semana, más breves y por tanto más rápidas.
- **Una ruta que cruza tierra se rechaza** antes de cualquier cálculo, y se pide al asistente que la vuelva a trazar por mar.

La conexión lleva un minuto, sin cuenta de OhMyWind ni clave de API: basta con seguir la [guía paso a paso](https://mcp.ohmywind.fr) con la dirección `https://mcp.ohmywind.fr/mcp`. Todos los cambios están en las [Novedades](/a-propos/nouveautes).

## Las corrientes de marea, en serio

El cálculo de las corrientes de marea cubre una gran parte de las aguas europeas: canal de la Mancha, golfo de Vizcaya, mar del Norte, bahía alemana y Elba. En cada punto, OhMyWind utiliza el atlas de mareas más preciso disponible, procedente de organismos públicos (SHOM, Ifremer, BSH, Copernicus). Estos datos se han contrastado con mediciones reales de radares costeros.

Donde no existe ninguna fuente fiable, por ejemplo en algunos pasos estrechos que los modelos no resuelven, la aplicación muestra «corriente desconocida» en lugar de una cifra engañosa. Un [mapa de cobertura](/methodologie/courants), disponible en el sitio, indica punto por punto qué fuente se utiliza.

## Los mejores modelos meteorológicos públicos, a elección del usuario

OhMyWind reúne los modelos meteorológicos públicos de referencia: AROME de Météo-France (malla de 1,3 km), ICON-EU, ECMWF y GFS. El usuario elige el modelo o deja que la herramienta use el más preciso disponible para su zona. Fuentes, cálculos y límites se detallan en la [metodología](/methodologie).

## Disponible en todas partes

- En la web, sin instalación: [ohmywind.fr](/)
- En Android, a través de [Google Play Store](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- En cinco idiomas: francés, inglés, alemán, español e italiano
- En los asistentes de inteligencia artificial compatibles con MCP, como Claude, ChatGPT o Le Chat

## Un proyecto abierto, impulsado por una asociación

OhMyWind lo desarrolla Quentin Donnars, ingeniero de Arts et Métiers, científico de datos e instructor de vela. El proyecto lo impulsa Libramer, asociación sin ánimo de lucro de derecho francés, ley de 1901, cuya vocación es hacer útiles los datos públicos para los navegantes y, a largo plazo, construir una base de datos cooperativa de corrientes de marea.

El [código fuente es público](https://github.com/qdonnars/ohmywind) ([licencia AGPL](https://github.com/qdonnars/ohmywind/blob/main/LICENSE)). El modelo de financiación se basa en el patrocinio de marcas del sector náutico, sin ninguna influencia en los cálculos ni en las recomendaciones de la herramienta.

> «Los datos meteorológicos y oceanográficos públicos son de una calidad notable, pero siguen siendo de difícil acceso para el navegante de recreo. OhMyWind los pone al servicio de una pregunta muy concreta: a qué hora salir para que la navegación vaya bien.»
>
> Quentin Donnars, fundador de OhMyWind

## Lo que OhMyWind no es

OhMyWind es una herramienta de ayuda a la decisión. No sustituye al boletín meteorológico marino oficial, ni a las cartas náuticas actualizadas, ni al criterio del patrón, que sigue siendo el único responsable de su navegación.

## Han hablado de nosotros

[Bateaux.com](https://www.barcosnews.es/noticias/52477/ohmywind-el-proyecto-de-codigo-abierto-que-pretende-replantear-la-preparacion-de-una-travesia) (en español en barcosnews.es, y en francés, inglés, alemán e italiano), [BOOTE](https://www.boote-magazin.de/en/equipment/technology/navigation-ohmywind-a-free-weather-planner-with-ai-functionality/), YACHT. Todos los artículos están reunidos en la [revista de prensa](/presse).

## Contacto de prensa

Quentin Donnars, fundador: [contact@ohmywind.fr](mailto:contact@ohmywind.fr)

Material gráfico (logotipo, capturas de pantalla) disponible bajo petición.

## Enlaces útiles

- **Aplicación web**: [ohmywind.fr](/)
- **Planificar una travesía**: [ohmywind.fr/plan](/plan)
- **Comparar los spots favoritos**: [ohmywind.fr/comparer](/comparer)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- **Metodología**: [ohmywind.fr/methodologie](/methodologie)
- **Mapa de las corrientes de marea**: [ohmywind.fr/methodologie/courants](/methodologie/courants)
- **Novedades (versión 1.10 y anteriores)**: [ohmywind.fr/a-propos/nouveautes](/a-propos/nouveautes)
- **Servidor MCP**: `https://mcp.ohmywind.fr/mcp`
- **Guía para conectar los asistentes de IA (Claude, ChatGPT, Le Chat) y vídeo de demostración**: [mcp.ohmywind.fr](https://mcp.ohmywind.fr) (en inglés)
- **Otros clientes MCP (Cursor, VS Code, Goose…)**: [guía rápida](https://github.com/qdonnars/ohmywind#try-it-in-30-seconds) (en inglés)
- **Protocolo MCP**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Código fuente**: [github.com/qdonnars/ohmywind](https://github.com/qdonnars/ohmywind)
- **Cap Innovation, Paris Nautic Show 2026**: [parisnauticshow.com/cap-innovation](https://www.parisnauticshow.com/cap-innovation/) (en francés)
- **Revista de prensa**: [ohmywind.fr/presse](/presse)
- **Privacidad**: [ohmywind.fr/confidentialite](/confidentialite)
- **Asociación**: Libramer, asociación sin ánimo de lucro de derecho francés, ley de 1901
