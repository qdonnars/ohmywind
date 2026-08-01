# OhMyWind Android (TWA)

Wrapper Android de https://ohmywind.fr via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (Trusted Web Activity). L'app est une coquille: tout le contenu vient du site en prod.

Seul `twa-manifest.json` est versionné. Le projet Android (Gradle, `app/`, etc.) est généré, le keystore est secret: les deux sont gitignorés.

## Prérequis

- `npm i -g @bubblewrap/cli` (JDK 17 et Android SDK sont téléchargés par Bubblewrap au premier lancement, dans `~/.bubblewrap/`)
- `android.keystore` présent dans ce dossier (backup: Vaultwarden, entrée "OhMyWind Android keystore"). Sans lui, impossible de signer une mise à jour: ne jamais le perdre, ne jamais le committer.
- Attention à `git clean -fdx`: il supprimerait le keystore local. Restaurer depuis Vaultwarden le cas échéant.

## Build

```bash
cd packages/android
export BUBBLEWRAP_KEYSTORE_PASSWORD='<Vaultwarden>'
export BUBBLEWRAP_KEY_PASSWORD='<Vaultwarden>'
bubblewrap update   # régénère le projet Android depuis twa-manifest.json
bubblewrap build    # produit app-release-bundle.aab (Play) + app-release-signed.apk (device)
```

## Publier une mise à jour

1. Incrémenter `appVersionCode` (+1, entier) et `appVersion` (lisible, ex. "1.1.0") dans `twa-manifest.json`.
2. `bubblewrap update` puis `bubblewrap build`.
3. Uploader `app-release-bundle.aab` sur la Play Console.

Le contenu web, lui, se met à jour tout seul (c'est le site). Un rebuild n'est nécessaire que pour changer le manifest Android (icône, nom, permissions, version affichée sur le Play Store).

## assetlinks.json

`packages/web/public/.well-known/assetlinks.json` doit contenir l'empreinte SHA256 du certificat de signature, sinon l'app s'ouvre avec la barre Chrome au lieu du plein écran. Il est servi sur https://ohmywind.fr/.well-known/assetlinks.json. Si le keystore change (jamais, en principe), régénérer via `bubblewrap fingerprint` et redéployer le site.

## Variante dev

`packages/android-dev/` contient la même app pointée sur https://dev.ohmywind.fr, package `fr.ohmywind.app.dev`, installable à côté de la prod. Même keystore (chemin relatif `../android/android.keystore`), même procédure de build depuis `packages/android-dev/`. Elle ne se publie jamais sur le Play Store: usage interne pour tester la branche `dev` dans la coquille TWA. Son empreinte est déclarée dans le même `assetlinks.json`.

## Test sur device

```bash
bubblewrap install   # nécessite adb + USB debugging
```

Sous WSL2, adb USB passe par `usbipd` côté Windows, ou utiliser adb en WiFi (`adb pair` / `adb connect`).
