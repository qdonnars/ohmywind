// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export function InfoPanel() {
  return (
    <div
      className="px-4 py-5 lg:px-6 lg:py-6 max-w-3xl mx-auto"
      style={{ color: "var(--ow-fg-0)" }}
    >
      <h2
        className="text-lg lg:text-xl font-bold tracking-tight mb-4"
        style={{ color: "var(--ow-fg-0)" }}
      >
        À propos d'OhMyWind
      </h2>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          Le projet
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          OhMyWind rend accessible une météo marine de qualité aux voileux. Les
          modèles AROME, ICON, GFS, ECMWF et les données de vagues, courants et
          marées sont publics et gratuits. Cette app les rassemble dans une vue
          lisible, sans compte ni installation.
        </p>
      </section>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          Vos données
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          Aucun tracking, aucun compte, aucune donnée enregistrée vous concernant.
          Tout tourne dans votre navigateur, c'est une page de consultation pure.
          Les requêtes météo partent en direct vers les API publiques.
        </p>
      </section>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          Sources des données et méthodologie
        </h3>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          Modèles vent (AROME, ICON, ECMWF, GFS), vagues et niveau de la mer
          (Open-Meteo Marine, WaveWatch III), courants en cascade (SHOM Atlas
          C2D sur les passes critiques, MARC PREVIMER sur le plateau atlantique,
          SMOC Copernicus en repli global), conventions, équations de planification
          de passage et notation de complexité : tout est détaillé sur la page
          méthodologie.
        </p>
        <a
          href="/methodologie"
          className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: "var(--ow-accent)" }}
        >
          Voir la méthodologie complète
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
        {/* Map credits. The OSM Foundation allows the attribution to sit off
            the map, but only if it stays findable through an info button or
            an About menu, which is exactly this panel. Removing the corner
            notice without this block would breach the ODbL. */}
        <p className="text-xs leading-relaxed mt-4" style={{ color: "var(--ow-fg-2)" }}>
          Fonds de carte :{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline hover:opacity-80"
          >
            &copy; les contributeurs OpenStreetMap
          </a>{" "}
          (données sous licence ODbL), tuiles{" "}
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer"
            className="underline hover:opacity-80"
          >
            &copy; CARTO
          </a>
          . Recherche de lieux :{" "}
          <a
            href="https://photon.komoot.io"
            target="_blank"
            rel="noreferrer"
            className="underline hover:opacity-80"
          >
            Photon
          </a>{" "}
          et Open-Meteo Geocoding, tous deux sur données OpenStreetMap.
        </p>
        <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--ow-fg-2)" }}>
          Aucun compte, aucun traqueur :{" "}
          <a href="/confidentialite" className="underline hover:opacity-80">
            politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          Licence et marque
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          Le code d'OhMyWind est open source, sous{" "}
          <a
            href="https://github.com/qdonnars/ohmywind/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="underline hover:opacity-80"
          >
            licence MIT
          </a>
          . Vous pouvez le forker, le modifier et le redistribuer. En revanche,
          le nom « OhMyWind » fait l'objet d'un dépôt de marque à l'INPI, et
          l'identité visuelle (logo, icônes) reste protégée par le droit
          d'auteur : un fork se publie sous son propre nom et ses propres
          icônes. Détails dans la{" "}
          <a
            href="https://github.com/qdonnars/ohmywind/blob/main/TRADEMARK.md"
            target="_blank"
            rel="noreferrer"
            className="underline hover:opacity-80"
          >
            politique de marque
          </a>
          .
        </p>
      </section>

      <section
        className="rounded-xl p-4 lg:p-5"
        style={{
          background: "var(--ow-accent-soft)",
          border: "1px solid var(--ow-accent-line)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-2 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          Soutenir le projet
        </h3>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-0)" }}>
          Si vous adorez cette appli autant que moi, sachez qu'il faudra bientôt
          des serveurs dédiés pour la maintenir. Je n'ai pas envie de mettre de
          la pub dans cette app. Si vous non plus, n'hésitez pas à m'aider.
        </p>
        <a
          href="https://ko-fi.com/ohmywind"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "var(--ow-accent)",
            color: "#fff",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Soutenir sur Ko-fi
        </a>
      </section>
    </div>
  );
}
