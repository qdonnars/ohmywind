# OhMyWind Android (TWA)

Wrapper Android de https://ohmywind.fr via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (Trusted Web Activity). L'app est une coquille: tout le contenu vient du site en prod.

Seul `twa-manifest.json` est versionné. Le projet Android (Gradle, `app/`, etc.) est généré, le keystore est secret: les deux sont gitignorés.

## Prérequis

- `npm i -g @bubblewrap/cli@latest` (JDK 17 et Android SDK sont téléchargés par Bubblewrap au premier lancement, dans `~/.bubblewrap/`). Mettre la CLI à jour **avant chaque release**: le `targetSdkVersion` du bundle suit la version de la CLI (incident: la 1.0.1 buildée avec la CLI 1.24.1 est partie en targetSdk 35 alors que la v3 était en 36; Google exige targetSdk 36 pour toute mise à jour publiée après le 2026-08-31).
- `android.keystore` présent dans ce dossier (backup: NordPass, entrée "OhMyWind Android keystore"). Sans lui, impossible de signer une mise à jour: ne jamais le perdre, ne jamais le committer.
- Attention à `git clean -fdx`: il supprimerait le keystore local. Restaurer depuis NordPass le cas échéant.

## Build

```bash
cd packages/android
export BUBBLEWRAP_KEYSTORE_PASSWORD='<NordPass>'
export BUBBLEWRAP_KEY_PASSWORD='<NordPass>'
bubblewrap update   # régénère le projet Android depuis twa-manifest.json
./patch-monochrome.sh   # injecte l'icône thémée Android 13+ (voir ci-dessous)
bubblewrap build    # produit app-release-bundle.aab (Play) + app-release-signed.apk (device)
```

### Raccourcis d'application

Les raccourcis (appui long sur l'icône du launcher) sont déclarés dans `packages/web/public/manifest.json` et recopiés dans `twa-manifest.json` sous une autre forme: `name`, `shortName`, `url` et `chosenIconUrl` absolus. Attention, contrairement à `monochromeIconUrl`, Bubblewrap **télécharge** chaque `chosenIconUrl` pendant le build: l'icône doit déjà être servie par l'hôte visé (donc promue en prod) sinon le build échoue. Le test `packages/web/src/manifest.test.ts` verrouille ce contrat côté dépôt (champs présents, icône >= 96 px, fichier présent dans `public/`, URL alignée sur l'hôte du flavor).

### Icône thémée Android 13+ (patch obligatoire)

Bubblewrap (1.25.0) ne lit `monochromeIconUrl` que pour l'icône de notification, jamais pour la couche `<monochrome>` de l'icône adaptative du launcher. Sans elle, l'icône reste non thémée quand l'utilisateur active les icônes thémées. `patch-monochrome.sh` corrige le projet généré: il copie `packages/web/public/icon-monochrome-512.png` dans les ressources et ajoute la couche dans `ic_launcher.xml`. À lancer **entre** `bubblewrap update` (qui écrase le projet, donc le patch) et `bubblewrap build`. Le script est idempotent et échoue fort si le template Bubblewrap change; si une future version de la CLI gère la couche launcher nativement, le supprimer.

## Publier une mise à jour

1. Incrémenter `appVersionCode` (+1, entier) et `appVersion` (lisible, ex. "1.1.0") dans `twa-manifest.json`. Attention: c'est `appVersion` que Bubblewrap lit pour le versionName du bundle; si un champ `appVersionName` est aussi présent, le garder synchronisé (incident: la 1.0.1 a failli partir étiquetée 1.0.0 parce que seul `appVersionName` avait été incrémenté).
2. `bubblewrap update --skipVersionUpgrade`, puis `./patch-monochrome.sh`, puis `bubblewrap build` (sans le flag, `update` prompte interactivement pour une nouvelle version et pollue les champs en non-interactif).
3. Uploader `app-release-bundle.aab` sur la Play Console.

Le contenu web, lui, se met à jour tout seul (c'est le site). Un rebuild n'est nécessaire que pour changer le manifest Android (icône, nom, permissions, version affichée sur le Play Store).

## assetlinks.json

`packages/web/public/.well-known/assetlinks.json` doit contenir l'empreinte SHA256 de **chaque** certificat susceptible de signer l'app, sinon celle-ci s'ouvre avec la barre Chrome au lieu du plein écran. Il est servi sur https://ohmywind.fr/.well-known/assetlinks.json.

Il en faut deux pour `fr.ohmywind.app`, parce que les deux canaux de distribution signent différemment:

- la **clé d'upload** (`android.keystore` local), pour les APK installés en direct via `bubblewrap install` / `adb install`;
- la **clé Play App Signing**, celle avec laquelle Google re-signe le build qu'il distribue. Play Console la publie sous Test et publication → Intégrité de l'app → Clé de signature de l'app.

Ne jamais faire confiance à une empreinte recopiée à la main: la vérité terrain, c'est le certificat de l'APK réellement installé. Pour la mesurer:

```bash
adb pull "$(adb shell pm path fr.ohmywind.app | grep base.apk | sed 's/package://' | tr -d '\r')" /tmp/play.apk
keytool -printcert -jarfile /tmp/play.apk | grep SHA256
```

Sur un build issu du Play Store, le certificat porte `CN=Android, O=Google Inc.`: c'est la clé Play App Signing. Une empreinte fausse ou manquante se voit dans `adb logcat`, au lancement de l'app:

```
W chromium: [...digital_asset_links_handler.cc] Statement failure matching fingerprint.
W cr_WebAppLaunchHandler: Target url verification has been failed.
```

Le fichier étant servi par le site, une correction ne demande aucun rebuild de l'app: il suffit de redéployer la prod, puis de relancer l'app (Chrome met en cache le résultat de la vérification, un `adb shell pm clear com.android.chrome` force une revérification).

## Variante dev

`packages/android-dev/` contient la même app pointée sur https://dev.ohmywind.fr, package `fr.ohmywind.app.dev`, installable à côté de la prod. Même keystore (chemin relatif `../android/android.keystore`), même procédure de build depuis `packages/android-dev/`. Elle ne se publie jamais sur le Play Store: usage interne pour tester la branche `dev` dans la coquille TWA. Son empreinte est déclarée dans le même `assetlinks.json`.

## Test sur device

```bash
bubblewrap install   # nécessite adb + USB debugging
```

Sous WSL2, adb USB passe par `usbipd` côté Windows, ou utiliser adb en WiFi (`adb pair` / `adb connect`).
