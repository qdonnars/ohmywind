# Courants de marée partout dans le monde, étape par étape

Rapport de recommandation (exploration, branche `explore/tidal-currents-worldwide`).

Statut : squelette. Les sections se remplissent au fil de la PR ; chaque
affirmation est marquée **vérifié** (avec source et date de consultation) ou
**supposé**.

## Plan de la PR

1. Lire le code et vérifier l'état réel de la cascade (fait, voir « Où on en est »).
2. Inventaire des sources, licences vérifiées par recherche web, une ligne par source.
3. Trancher la licence des courants FES (heights et currents diffèrent).
4. Spec du format d'atlas harmonique agnostique : `docs/harmonic_atlas_format.md`.
5. Carte interactive sans backend : `docs/tidal-world/map/`, registre `sources.geojson`.
6. Spike bout en bout sur une source qui débloque l'Allemagne : BSH.
7. Bonus : workflow GitHub Actions d'archivage quotidien, désactivé par défaut.
8. Tests sur tout code d'analyse, de prédiction ou de conversion ajouté.
9. Commits séparés : rapport, spec, carte, spike, workflow.
10. Rien câblé dans `router.py` ; refacto du registry décrit ici, pas fait.
