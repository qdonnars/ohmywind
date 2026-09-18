// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** La page `/presse` : les articles que la presse nautique a consacrés au
    projet, et à qui écrire pour le prochain. Titres et chapôs des articles
    sont cités tels que publiés, ils ne passent pas par le dictionnaire. */
export const press = {
  "press.header.title": "Presse",
  "press.eyebrow": "Revue de presse",
  "press.title": "Ils parlent d'OhMyWind",
  "press.intro":
    "Les articles que la presse nautique a consacrés à OhMyWind. Chaque fiche renvoie à l'édition en anglais quand elle existe ; les autres éditions sont indiquées dessous.",

  // Fiche article
  "press.article.read": "Lire l'article sur {site}",
  "press.article.editions": "Autres éditions",

  // Contact
  "press.contact.title": "Contact presse",
  "press.contact.body":
    "Vous préparez un sujet sur OhMyWind ? Écrivez à <a>contact@ohmywind.fr</a>. Le code, la méthodologie et les captures d'écran sont publics : tout peut être cité.",
  "press.contact.methodology": "Lire la méthodologie",
  "press.contact.github": "Voir le code source",
} as const;
