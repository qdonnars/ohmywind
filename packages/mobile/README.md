# OhMyWind mobile (coquille Capacitor)

Coquille [Capacitor 8](https://capacitorjs.com/) autour de https://ohmywind.fr. Comme la TWA de `packages/android`, l'app n'a aucun écran natif: la WebView charge le site en direct (`server.url`), donc un déploiement de `packages/web` arrive dans l'app sans nouvelle version au store. Seule une page de secours locale est embarquée.

Android et iOS. Le projet iOS (`ios/`) utilise Swift Package Manager, pas CocoaPods. La TWA (`packages/android`, `packages/android-dev`) reste en place tant que cette coquille n'est pas publiée.

Aucun service payant, aucun SDK d'analytics, de crash ou de pub.

## Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| Node | 22 ou plus | exigé par la CLI Capacitor 8 |
| JDK | **21** | le module `capacitor-android` compile en Java 21 (`sourceCompatibility VERSION_21`); le JDK 17 de Bubblewrap ne suffit pas |
| Android SDK | platform `android-36`, build-tools 35 ou 36 | `compileSdk` et `targetSdk` 36 |
| Xcode (iOS) | **26** ou plus, donc macOS | exigé par Capacitor 8; App Store Connect refuse les envois faits avec un SDK antérieur à iOS 26 |

Sans Mac, la partie iOS se construit sur les runners macOS de GitHub Actions (voir « Tests automatiques » et « TestFlight »). `cap add ios` et `cap sync ios` tournent aussi sous Linux: seul `xcodebuild` exige macOS.

Pas besoin d'Android Studio. Sur la machine de dev (WSL, sans sudo), le JDK 21 est un Temurin décompressé dans `~/.jdks/` et le SDK est celui de Bubblewrap:

```bash
mkdir -p ~/.jdks && cd ~/.jdks
curl -L -o temurin21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk"
tar xzf temurin21.tar.gz && rm temurin21.tar.gz

export JAVA_HOME="$(ls -d ~/.jdks/jdk-21*)"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/.bubblewrap/android_sdk"
```

Gradle lit l'emplacement du SDK dans `android/local.properties` (non versionné), à créer une fois:

```bash
echo "sdk.dir=$ANDROID_HOME" > packages/mobile/android/local.properties
```

## Les trois variantes

Une seule variable, `OHMYWIND_VARIANT`, lue par `capacitor.config.ts` au moment du `cap sync`:

| Variante | applicationId / bundle iOS | Nom affiché | Site chargé | HTTP en clair (Android) | Profil App Store (iOS) |
|---|---|---|---|---|---|
| `prod` | `fr.ohmywind.app` | OhMyWind | https://ohmywind.fr | non | OhMyWind App Store |
| `dev` (défaut) | `fr.ohmywind.app.dev` | OhMyWind Dev | https://dev.ohmywind.fr | non | OhMyWind Dev App Store |
| `local` | `fr.ohmywind.app.dev` | OhMyWind Local | http://localhost:4173 | oui | OhMyWind Dev App Store |

Une valeur inconnue fait échouer le sync (pas de repli silencieux sur dev).

Le sync écrit la config dans `android/app/src/main/assets/capacitor.config.json`, et `app/build.gradle` relit `appId`, `appName`, `server.url` et la variante dans ce fichier. Il n'y a donc pas de flavors Gradle: c'est le dernier sync qui décide de tout, et un APK ne peut pas porter l'applicationId de prod avec l'URL de dev. Conséquence: **toujours re-synchroniser avant de changer de variante**. Sans sync préalable, Gradle refuse de configurer le projet avec un message explicite.

Sur iOS, Xcode ne sait pas lire un identifiant dans un JSON: le hook `capacitor:sync:after` (`scripts/ios-variant.mjs`) écrit, après chaque `cap sync ios`, `ios/App/variant.xcconfig` (non versionné) avec le bundle, le nom affiché, le domaine lié à l'app et le nom du profil App Store. `ios/debug.xcconfig` et `ios/release.xcconfig` l'incluent, et la première phase de build (`ios/App/shell-prebuild.sh`) échoue avec un message explicite s'il manque ou ne correspond plus au `capacitor.config.json` synchronisé. Même règle qu'Android: **re-synchroniser avant de changer de variante**.

`local` partage l'applicationId de `dev` exprès: elle remplace l'app dev sur l'émulateur au lieu d'ajouter une troisième icône. Le HTTP en clair (`server.cleartext`, traduit par Capacitor en `android:usesCleartextTraffic="true"`) n'existe que dans cette variante.

## Build

```bash
cd packages/mobile
npm ci

# dev
OHMYWIND_VARIANT=dev npx cap sync android
(cd android && ./gradlew assembleDebug)
# -> android/app/build/outputs/apk/debug/ohmywind-dev-debug.apk

# local
OHMYWIND_VARIANT=local npx cap sync android
(cd android && ./gradlew assembleDebug)
# -> android/app/build/outputs/apk/debug/ohmywind-local-debug.apk

# prod (debug)
OHMYWIND_VARIANT=prod npx cap sync android
(cd android && ./gradlew assembleDebug)
# -> android/app/build/outputs/apk/debug/ohmywind-prod-debug.apk
```

Raccourcis npm équivalents: `npm run build:dev`, `npm run build:local`, `npm run build:prod` (sync puis assemble).

Vérifier ce qui sort, sans appareil:

```bash
"$ANDROID_HOME/build-tools/36.1.0/aapt" dump badging android/app/build/outputs/apk/debug/ohmywind-dev-debug.apk \
  | grep -E "^package|dkVersion|uses-permission|application-label:"
```

Seuls des builds debug existent pour l'instant, signés par la clé debug locale (`~/.android/debug.keystore`). La clé d'upload de la TWA n'est pas branchée: la signature de release se fera au moment de remplacer la TWA sur le Play Store (même `fr.ohmywind.app`, même clé d'upload, `versionCode` au-dessus de 8).

### iOS (macOS)

```bash
cd packages/mobile
npm ci
OHMYWIND_VARIANT=dev npx cap sync ios     # ou npm run sync:ios:dev, sync:ios:prod, sync:ios:local

# simulateur, sans signature
cd ios
xcodebuild -project App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "generic/platform=iOS Simulator" \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
# -> ios/build/Build/Products/Debug-iphonesimulator/App.app
```

La configuration Debug signe en automatique (équipe `Z2M67M742P`), la configuration Release en manuel avec l'identité « Apple Distribution » et le profil App Store de la variante: elle ne sert qu'aux archives pour TestFlight et l'App Store. Version 2.0.0 (`MARKETING_VERSION`, alignée sur Android); le numéro de build (`CURRENT_PROJECT_VERSION`) est injecté par le workflow d'envoi. iPhone et iPad (`TARGETED_DEVICE_FAMILY = "1,2"`): sur iPad, l'app tourne en natif dans les quatre orientations et accepte le multitâche (fenêtres redimensionnables, Split View), sans `UIRequiresFullScreen` (déprécié depuis iPadOS 26). Le site suit la largeur de la fenêtre: mise en page téléphone sous 1024 px (iPad en portrait, demi-écran), mise en page poste au-delà (iPad en paysage). Une app iPhone seulement aurait tourné sur l'iPad du relecteur en mode compatibilité, agrandie et floue. Conséquence pour la fiche: App Store Connect demande des captures iPad (13 pouces).

### Installer sur un appareil ou l'émulateur

```bash
adb install -r android/app/build/outputs/apk/debug/ohmywind-dev-debug.apk
```

Un appareil qui a déjà la TWA `fr.ohmywind.app.dev` (ou la version Play de `fr.ohmywind.app`) refusera l'installation (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`): les signatures diffèrent. Désinstaller l'app existante d'abord. Même chose entre deux machines de build, chacune ayant sa clé debug.

### Variante local

Pour tester un build web pas encore déployé:

```bash
# terminal 1, dans packages/web
npm run build && npx vite preview --port 4173 --strictPort

# terminal 2
adb reverse tcp:4173 tcp:4173
cd packages/mobile && npm run build:local
adb install -r android/app/build/outputs/apk/debug/ohmywind-local-debug.apk
```

`localhost` est un contexte sécurisé pour la WebView: géolocalisation et service worker y fonctionnent comme en HTTPS.

## iOS

### Service worker et hors-ligne dans WKWebView

WebKit ne fait tourner un service worker dans une WKWebView que pour un **domaine lié à l'app** (App-Bound Domains, iOS 14+): sinon l'enregistrement échoue (« Job rejected for non app-bound domain », [WebKit bug 227531](https://bugs.webkit.org/show_bug.cgi?id=227531)), et le site n'aurait aucun hors-ligne dans l'app. D'où:

- `WKAppBoundDomains` dans `ios/App/App/Info.plist`: l'hôte du site de la variante (`$(OHMYWIND_APP_BOUND_DOMAIN)`: `ohmywind.fr`, `dev.ohmywind.fr` ou `localhost`) et `localhost`, que la [doc Capacitor](https://capacitorjs.com/docs/config) demande pour les pages de la coquille (`capacitor://localhost`, où vit la page de secours). Dix domaines au plus ([WebKit, App-Bound Domains](https://webkit.org/blog/10882/app-bound-domains/));
- `ios.limitsNavigationsToAppBoundDomains: true` dans `capacitor.config.ts`, qui passe le réglage à la `WKWebViewConfiguration`.

Conséquences: la WebView ne peut naviguer que vers ces domaines (Capacitor ouvrait déjà les autres hôtes dans Safari), un `<iframe>` vers un domaine tiers ne se chargerait pas, et WebKit limite à trois les service workers de l'app (le site n'en a qu'un). Le pont des plugins reste disponible sur le site, puisque l'injection de scripts n'est permise que sur un domaine lié et que celui du site l'est.

`localhost` en HTTP (variante `local`): le simulateur partage le réseau du Mac, `http://localhost:4173` y est joignable sans `adb reverse`, et WebKit traite `localhost` comme un contexte sécurisé.

### `ShellViewController`

`ios/App/App/ShellViewController.swift` remplace `CAPBridgeViewController` (dans `SceneDelegate.swift` et `Main.storyboard`):

- **geste de retour**: `allowsBackForwardNavigationGestures`, le balayage depuis le bord gauche parcourt l'historique de la WebView, navigations internes du site (`history.pushState`) comprises;
- **page de secours**: Capacitor 8 construit son URL avec `appendingPathComponent`, qui encode le « ? » de `fallback.html?to=<site>`: le gestionnaire de fichiers cherche alors un fichier nommé `fallback.html?to=...`, échoue, et cet échec recharge la même URL. Il l'affichait aussi pour une navigation simplement interrompue (lien confié à Safari, chargement remplacé par un autre). Un délégué de navigation placé devant celui de Capacitor (auquel il transmet tout le reste) résout `server.errorPath` comme une URL relative, requête comprise, et ne l'affiche que sur un vrai échec du cadre principal avant affichage. Il écrit `OhMyWind shell: showing the offline fallback page` dans le journal système.

### Reste du projet iOS

- `Info.plist`: `NSLocationWhenInUseUsageDescription` (anglais par défaut, traductions fr, de, it, es dans `<langue>.lproj/InfoPlist.strings`), `ITSAppUsesNonExemptEncryption = false`, `CFBundleLocalizations`.
- `PrivacyInfo.xcprivacy` (manifeste de confidentialité de l'app, à la racine du bundle): aucun suivi, aucun domaine de suivi; une donnée collectée, la position précise, pour le fonctionnement de l'app, non liée à l'utilisateur (la position demandée part vers les serveurs d'OhMyWind et Open-Meteo pour la prévision); aucune API « required reason » dans le code de l'app. Capacitor et les plugins portent chacun le leur. Tout code natif ajouté qui lit `UserDefaults`, des dates de fichiers, l'heure de démarrage, l'espace disque ou les claviers actifs doit y être déclaré avec sa raison, et les réponses « App Privacy » d'App Store Connect doivent rester cohérentes avec ce fichier.
- Icône: `AppIcon.appiconset/AppIcon-1024.png`, versionnée, rendue depuis la source vectorielle du logo, `packages/web/public/favicon.svg`, en pleine page (`rx="0"` sur le fond, sans coins arrondis: iOS arrondit lui-même), à 1024 × 1024 px, en RGB sans canal alpha. Même dessin que `icon-maskable-512.png` (écart limité à l'anticrénelage). Rendu fait par Chromium (Playwright): `svg` collé dans une page de 1024 px, capture de l'élément. La phase de build refuse une icône absente, d'une autre taille ou avec canal alpha. À refaire si le logo change.
- Écran de lancement uni `#030712`, sans image.
- Côté web, `packages/web/src/native/shellImport.ts` ne lance la reprise des données de la TWA que sur Android: sur iOS, ni `ShellInfo` interrogé, ni navigateur ouvert. La barre d'état suit le thème du site par le plugin `SystemBars`, disponible sur iOS dans le cœur de Capacitor 8.

## Tests automatiques sur émulateur et simulateur

Pendant le développement, ces tests se jouent **en local**; la CI (`.github/workflows/mobile-smoke.yml`, qui coûte un émulateur et un Mac) ne les joue qu'avant la prod:

- sur une pull request vers `main` (les promotions depuis `dev`);
- sur un push vers `dev` qui touche `packages/mobile/**` (ou le workflow): seul moyen de tester iOS sans Mac;
- à la main (`workflow_dispatch`).

Ce n'est pas un contrôle requis de `dev` (les règles de protection n'ont pas été touchées): un run rouge signale un problème, il ne bloque pas une fusion. Jamais `pull_request_target`, aucun secret, jeton en lecture seule.

### En local (Android, WSL)

Une commande, depuis la racine du dépôt:

```bash
packages/mobile/scripts/smoke-android.sh
```

Elle construit `packages/web` (ou prend `WEB_DIST=<dossier>` tel quel), y glisse la sonde **dans une copie** (le `dist` du web n'est pas touché), construit l'APK `local`, démarre l'AVD `ohmywind` si aucun appareil n'est en ligne (`AVD=<nom>` pour un autre, arrêté à la fin s'il a été démarré par le script), puis déroule `smoke/run.sh android`. Captures, rapports et journaux dans `tmp/mobile-smoke/android/` (ou `OUT_DIR`). Le job Android de la CI appelle le même script.

Prérequis:

- JDK 21 (`~/.jdks/jdk-21*` est pris si `JAVA_HOME` n'est pas posé) et le SDK de Bubblewrap (`~/.bubblewrap/android_sdk` si `ANDROID_HOME` n'est pas posé);
- le serveur adb **démarré à la main**, en arrière-plan: `adb -a -P 5037 nodaemon server`. Le script ne démarre ni n'arrête jamais le serveur adb;
- de la place sur l'appareil: le script désinstalle puis réinstalle `fr.ohmywind.app.dev` (les données de l'app dev sur l'émulateur sont perdues). Le 23/11/2026, l'AVD `ohmywind` n'avait plus assez de place libre (`INSTALL_FAILED_INSUFFICIENT_STORAGE`); un AVD neuf sur la même image système a servi;
- sous WSL, un port sans serveur laisse pendre la connexion au lieu de la refuser: le script le détecte et garde sur le port, quand le site est « arrêté », un auditeur qui coupe chaque connexion (`SMOKE_REFUSE_WHEN_DOWN=1`), ce qui reproduit un serveur arrêté.

iOS ne se teste pas en local faute de Mac: c'est le job iOS de la CI.

### Déroulé

1. le web est construit et reçoit la sonde `smoke/probe.js` (`smoke/inject-probe.mjs`, dans le test seulement: le build déployé ne la contient jamais). En CI, un job Linux s'en charge une fois pour les deux plateformes;
2. Android (émulateur API 35, KVM) et iOS (`macos-26`, iPhone 17 simulé) construisent la variante `local`, servent ce build sur `localhost:4173` (`smoke/serve.mjs`) et déroulent le même scénario, `smoke/run.sh`.

La sonde relève, plusieurs fois par chargement, `Capacitor.isNativePlatform()`, la plateforme, un aller-retour par le pont (`App.getInfo()`), l'état du service worker, les marges de sécurité, la géométrie de la page (`scrollY`, `visualViewport`, `innerHeight`, rectangle de l'en-tête, débord de la colonne), l'état de la reprise de données et les erreurs JavaScript, et envoie le tout à `smoke/collector.mjs` (port 4174). `smoke/expect.mjs` attend un rapport qui remplit les conditions de l'étape, sinon le job échoue:

| Étape | Situation | Conditions |
|---|---|---|
| `0-fallback` | installation neuve, serveur du site arrêté | page de secours à l'écran (texte lu par `uiautomator` sur Android, ligne du journal sur iOS), aucun rapport de la sonde |
| `1-first` | serveur démarré | coquille native, bonne plateforme, `App.getInfo()` répond avec le bon identifiant, service worker enregistré et activé, reprise de données à `none` |
| `2-second` | relance | page contrôlée par le service worker |
| `3-offline` | serveur arrêté, relance | le site s'ouvre quand même, servi par le service worker |
| `4-plan` | serveur relancé, la sonde ouvre `/plan` avec une route (page et `localStorage` donnés par le collecteur, `GET /goto`) | page non décalée (`scrollY` et défilement de la colonne nuls, en-tête en haut), colonne qui tient dans l'écran, y compris tiroir monté un instant à 90 vh; capture de `/plan` |

Captures à chaque étape, rapports, journaux de l'appareil en artefacts (`mobile-smoke-android`, `mobile-smoke-ios`), tableau récapitulatif dans le résumé du job.

« Hors ligne » veut dire ici serveur du site arrêté (connexion refusée), pas mode avion: le reste d'internet reste joignable, les tuiles de la carte comprises.

## TestFlight

`.github/workflows/ios-testflight.yml`: archive signée en manuel et envoi à App Store Connect.

| Variante | Déclencheurs | Environnement GitHub | Branches admises | Approbation |
|---|---|---|---|---|
| `dev` (OhMyWind Dev) | push sur `dev` touchant ce qui part dans l'app (voir plus bas), `workflow_dispatch` | `ios-testflight` | `dev` | réglée dans l'environnement |
| `prod` (OhMyWind) | `workflow_dispatch` seulement | `ios-testflight-prod` | `main` | propriétaire, à chaque exécution |

Un push n'envoie jamais que la variante dev. Les secrets (certificat « Apple Distribution », profil App Store de la variante, clé d'API App Store Connect au rôle Développeur, qui ne sert qu'à l'envoi) ne vont que dans un trousseau et des fichiers temporaires, supprimés à la fin quoi qu'il arrive. Numéro de build `run_number.run_attempt`. La variante dev est réservée aux testeurs internes (`testFlightInternalTestingOnly`). Un push n'envoie une build que s'il touche ce qui part dans l'app (`ios/`, `www/`, `capacitor.config.ts`, les `package*.json`, `scripts/ios-variant.mjs`, l'icône source): un changement des tests, de la doc ou du workflow n'envoie rien.

Premier envoi le 23/11/2026: OhMyWind Dev 2.0.0 (1.1), Xcode 26.6, SDK iOS 26.5, « Upload succeeded » avec la clé au rôle Développeur. App Store Connect a averti qu'**à partir d'avril 2027, les apps devront être construites avec le SDK iOS 27 (Xcode 27)**: passer `Select Xcode 26` du workflow à Xcode 27 avant cette date.

## Ce qui est versionné, ce qui est généré

Le projet `android/` est versionné, comme le veut la convention Capacitor: il porte le manifeste, le plugin `ShellInfo`, le filtre d'intent, le thème et le script Gradle des variantes. Seuls les fichiers que `cap sync` régénère sont ignorés (via `android/.gitignore`, celui du modèle Capacitor):

| Chemin | Statut |
|---|---|
| `capacitor.config.ts` | versionné, source unique des variantes |
| `www/fallback.html` | versionné, page de secours |
| `android/app/build.gradle` | versionné, lit la config synchronisée, génère raccourcis et icônes |
| `android/app/src/main/AndroidManifest.xml` | versionné |
| `android/app/src/main/java/fr/ohmywind/app/` | versionné (`MainActivity`, `ShellInfoPlugin`, `ShellWebViewClient`) |
| `android/app/src/main/res/` | versionné (thème, couleurs, icônes adaptatives, libellés des raccourcis) |
| `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle` | versionnés, réécrits par `cap sync` à l'identique tant que la liste des plugins ne change pas |
| `android/app/src/main/assets/` (`public/`, `capacitor.config.json`, `capacitor.plugins.json`) | généré par `cap sync`, ignoré |
| `android/capacitor-cordova-android-plugins/` | généré par `cap sync` (porte le `usesCleartextTraffic` de la variante local), ignoré |
| `android/app/src/main/res/xml/config.xml` | généré par `cap sync`, ignoré |
| `android/local.properties`, `android/.gradle/`, `**/build/` | locaux, ignorés |
| `android/app/build/generated/shell-res/` | généré par Gradle: raccourcis de la variante et icônes copiées depuis `packages/web/public/` |
| `ios/App/App.xcodeproj`, `ios/App/App/` (Swift, `Info.plist`, storyboards, `*.lproj`), `ios/*.xcconfig`, `ios/App/shell-prebuild.sh` | versionnés |
| `ios/App/CapApp-SPM/Package.swift` | versionné, réécrit par `cap sync` (liste des plugins) |
| `ios/App/App/capacitor.config.json`, `ios/App/App/config.xml`, `ios/App/App/public/`, `ios/capacitor-cordova-ios-plugins/` | générés par `cap sync`, ignorés |
| `ios/App/variant.xcconfig` | généré par le hook de sync, ignoré |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` | versionné, rendu depuis `packages/web/public/favicon.svg` |
| `ios/build/`, `DerivedData`, `xcuserdata` | locaux, ignorés |

Le numéro de version de l'app (`versionCode` 9, `versionName` 2.0.0) est dans `android/app/build.gradle`. Il est indépendant de la version du web et doit rester au-dessus du `versionCode` 8 de la TWA pour être une mise à jour de la même fiche Play.

## Côté natif du pont avec le site

Le site chargé depuis `server.url` a le pont Capacitor: Capacitor 8 injecte son script au démarrage du document via `WebViewCompat.addDocumentStartJavaScript`, limité à l'origine de `server.url`, et n'expose son canal de messages (`addWebMessageListener`) qu'à cette origine. Aucun `allowNavigation` n'est nécessaire, et il ne faut pas en ajouter: toute origine listée recevrait aussi l'accès aux plugins. Le site détecte la coquille avec `Capacitor.isNativePlatform()`.

### Plugin `ShellInfo`

`android/app/src/main/java/fr/ohmywind/app/ShellInfoPlugin.java`, enregistré dans `MainActivity.onCreate` avant `super.onCreate` (un plugin du module app n'est pas découvert automatiquement, contrairement à ceux de npm). Une méthode:

- `getInstallInfo()` résout `{ firstInstallTime, lastUpdateTime }`, en millisecondes depuis l'epoch, lus dans le `PackageInfo` de l'app.

Côté web: `registerPlugin("ShellInfo")` depuis `@capacitor/core`. Le nom est un contrat: le changer d'un côté casse l'autre sans erreur de build.

### Retour depuis Chrome: `ohmywind://import`

`MainActivity` déclare un filtre `VIEW` + `DEFAULT` + `BROWSABLE` sur `ohmywind://import`. Une page ouverte dans Chrome rend la main à l'app avec une URL du type:

```
intent://import?v=1&n=<nonce>&d=<payload>#Intent;scheme=ohmywind;package=fr.ohmywind.app.dev;end
```

Le `package=` désigne l'app visée: prod et dev déclarent le même schéma sans se disputer l'URL. Le site reçoit l'URL par `@capacitor/app`:

- app déjà lancée: événement `appUrlOpen`;
- démarrage à froid: `App.getLaunchUrl()`. Attention, au démarrage à froid le plugin App émet **aussi** un `appUrlOpen` gardé en réserve jusqu'au premier écouteur: le site peut recevoir deux fois la même URL et doit dédoublonner (le nonce sert à ça). `getLaunchUrl()` renvoie la même URL pendant toute la vie de l'activité.

L'activité est en `launchMode="singleTask"`. Le Custom Tab ouvert par `@capacitor/browser` vit dans la tâche de l'app (le plugin lance une activité relais dans la tâche, qui ouvre le Custom Tab par `startActivityForResult`). Quand Chrome renvoie l'intent vers `MainActivity`, Android ramène la tâche au premier plan et termine tout ce qui est au-dessus de l'activité, Custom Tab compris, puis livre l'intent par `onNewIntent`. Vérifié sur l'émulateur (Android 15): l'onglet se ferme tout seul, sans rien demander au plugin. Le site ne doit pas appeler `Browser.close()` au retour: si l'activité relais est déjà terminée, le plugin en relance une, transparente, qui reste au-dessus de l'app et intercepte toutes les touches.

### Raccourcis du launcher

« Planifier » (`/plan`) et « Réglages » (`/config`), comme dans `twa-manifest.json`. Le système lit les raccourcis XML avec ses propres ressources, pas celles de l'app: `targetPackage` et `data` doivent être des valeurs en dur, d'où leur génération par Gradle pour chaque variante (`res/xml/shell_shortcuts.xml` dans `build/generated/shell-res`). Chaque raccourci envoie un `VIEW` vers `MainActivity` avec l'URL de la page (`https://ohmywind.fr/plan`, etc.): c'est le site qui route, sur `appUrlOpen` ou `getLaunchUrl()`, comme pour l'import.

## Page de secours

`www/fallback.html`, déclarée par `server.errorPath`, mais déclenchée par `ShellWebViewClient` (installé par `MainActivity` à la place du client de Capacitor) et non par Capacitor lui-même.

Pourquoi: le `BridgeWebViewClient` de Capacitor 8 charge la page de secours dès que `onReceivedError` ou `onReceivedHttpError` signale une erreur sur le cadre principal. Or, hors ligne et service worker arrêté (toujours le cas à un démarrage à froid), la WebView lance une requête réseau pour la navigation pendant que le worker démarre, signale son échec (`ERR_CONNECTION_REFUSED`, cadre principal) puis termine la navigation avec la page servie par le worker. Le `loadUrl` de Capacitor annulait cette navigation (`ERR_ABORTED`): l'app ne s'ouvrait jamais hors ligne. Séquence relevée sur WebView 150: `onPageStarted`, `onReceivedError`, `onPageFinished` (document encore `about:blank`), puis `onPageStarted`, `onPageFinished` sur la page du worker.

Comportement actuel:

- une erreur signalée ne suffit plus: à `onPageFinished` et `onPageCommitVisible`, le client lit le document réellement chargé. La page de secours s'affiche si c'est la page d'erreur de Chromium (`chrome-error://chromewebdata/`), c'est-à-dire si la navigation a vraiment échoué, ou si la page chargée à l'URL en erreur HTTP porte elle-même un statut 400 ou plus (et pas une copie servie par le service worker);
- donc: premier lancement sans réseau ni cache, page de secours; démarrage hors ligne après un premier chargement en ligne, le site servi par le service worker;
- servie depuis l'APK à `https://localhost/fallback.html?to=<server.url>`, sans pont Capacitor. Le `?to=` est le seul moyen pour la page de connaître l'URL à recharger. Capacitor ne sert la page locale que si l'URL demandée est exactement celle de la config, d'où une valeur non encodée;
- tout en ligne (aucune ressource externe), clair et sombre selon `prefers-color-scheme`, en fr, en, de, it ou es selon `navigator.languages` (anglais sinon);
- le bouton recharge le site avec `location.replace`, et la page réessaie seule à l'événement `online`. Un nouvel échec réaffiche la page de secours, dont l'historique est vidé à chaque affichage: les essais ratés ne s'empilent pas et le retour arrière quitte l'app. Si le site peut être servi (réseau revenu, ou service worker), l'essai l'atteint;
- Capacitor affiche aussi la page si la WebView du système est trop ancienne (inchangé).

## Parité avec la TWA

- **Géolocalisation**: `ACCESS_COARSE_LOCATION` et `ACCESS_FINE_LOCATION` déclarées; le `WebChromeClient` de Capacitor les demande au premier `navigator.geolocation` et accepte la position approximative si l'utilisateur la choisit. Les `uses-feature` de localisation sont marqués non requis pour ne pas exclure d'appareils sur le Play Store.
- **Raccourcis**: voir plus haut.
- **Couleurs**: `#030712` pour le fond de la fenêtre, l'écran de démarrage et, avant Android 15, les barres système. À partir d'Android 15 (targetSdk 36), le bord à bord est imposé et les barres sont transparentes: c'est le site qui peint dessous.
- **Bord à bord**: plugin `SystemBars` du cœur de Capacitor 8 en `insetsHandling: "native"`. Avec une WebView 140 ou plus, le site (qui déclare `viewport-fit=cover`) passe sous les barres et se décale avec `env(safe-area-inset-*)`. Avec une WebView plus ancienne, Capacitor réserve la place des barres autour de la WebView et les `env()` valent 0. Le style des icônes de barre suit le mode clair ou sombre du système (`style: "DEFAULT"`).
- **Icônes**: celles de la PWA, copiées par Gradle depuis `packages/web/public/` à chaque build: icône adaptative à partir de `icon-maskable-512.png` (réduite aux 72 dp visibles, sur fond `#030712`), couche monochrome Android 13+ à partir de `icon-monochrome-512.png` (sans le patch que demande Bubblewrap), `icon-512.png` pour les launchers d'avant Android 8, et les deux icônes de raccourcis.
- **Liens vers d'autres domaines**: ouverts dans le navigateur du système. C'est le comportement par défaut de Capacitor (`Bridge.launchIntent`): toute navigation vers un autre hôte que celui de `server.url` part en `ACTION_VIEW`.

## Limites connues

- **Stockage**: la WebView a son propre stockage, distinct de celui de Chrome où la TWA rangeait tout. Au premier lancement après une mise à jour, le site ouvre `/transfert` dans un Custom Tab et reprend spots et réglages (voir `packages/web/src/native/shellImport.ts` et `packages/web/src/storage/transfer.ts` pour la liste des clés). Ne suivent pas: le dernier plan calculé, les caches et le refus de géolocalisation. La reprise suppose que le Custom Tab s'ouvre dans le navigateur qui hébergeait la TWA (Chrome dans le cas courant), et qu'il s'agit bien d'une mise à jour: même identifiant et même clé de signature que la TWA (cf. #535).
- **Page de secours sur erreur HTTP**: une page du site qui répond 404 ou 5xx en navigation principale (sans service worker pour la servir) affiche la page de secours, pas la page d'erreur du site. Ce cas n'a pas été testé sur appareil.
- **Détection de l'échec**: elle repose sur l'URL interne `chrome-error://chromewebdata/` de la page d'erreur de Chromium, stable depuis longtemps mais non documentée par Android. Si elle changeait, la WebView afficherait sa propre page d'erreur au lieu de la page de secours, sans casser le hors-ligne.
- **`minSdk` 24** (Android 7.0) au lieu de 21 pour la TWA: c'est le minimum de Capacitor 8.
- **Raccourcis en français seulement**, comme dans la TWA.
- **`server.url` en production**: la doc Capacitor le présente comme un réglage de développement. C'est un choix assumé (#535, #536): sur Android, le seul effet est l'absence de contenu embarqué. Sur iOS, c'est le risque de refus 4.2 décrit dans #536.
- **iOS, pas encore fait**: raccourcis d'icône (Quick Actions), retour haptique, demande de note, liens universels (AASA, #502), captures et fiche App Store.
- **iOS, non vérifié sur un vrai iPhone**: geste de retour par balayage (sur la carte, un glissé depuis le bord gauche peut être pris pour un retour), hors-ligne en mode avion, géolocalisation, taille du texte.
- **Lockfile racine**: il ne porte que les binaires Linux de la chaîne web (rolldown, lightningcss), `vite build` échoue sur macOS. Le workflow de test contourne en construisant le web sous Linux.
