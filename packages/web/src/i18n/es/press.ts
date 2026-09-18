// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { press as frPress } from "../fr/press";

export const press: Record<keyof typeof frPress, string> = {
  "press.header.title": "Prensa",
  "press.eyebrow": "Revista de prensa",
  "press.title": "OhMyWind en la prensa",
  "press.intro":
    "Lo que la prensa náutica ha escrito sobre OhMyWind. Cada ficha enlaza con la edición en inglés cuando existe; las demás ediciones se indican debajo.",

  "press.article.read": "Leer el artículo en {site}",
  "press.article.editions": "Otras ediciones",

  "press.contact.title": "Contacto de prensa",
  "press.contact.body":
    "¿Prepara un reportaje sobre OhMyWind? Escriba a <a>contact@ohmywind.fr</a>. El código, la metodología y las capturas de pantalla son públicos: todo puede citarse.",
  "press.contact.methodology": "Leer la metodología",
  "press.contact.github": "Ver el código fuente",
};
