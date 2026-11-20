# OhMyWind mobile (coquille Capacitor)

Coquille [Capacitor 8](https://capacitorjs.com/) autour de https://ohmywind.fr. Comme la TWA de `packages/android`, l'app n'a aucun écran natif: la WebView charge le site en direct (`server.url`), donc un déploiement de `packages/web` arrive dans l'app sans nouvelle version au store. Seule une page de secours locale est embarquée.

Android seulement pour l'instant. La config est écrite pour qu'iOS s'ajoute plus tard (`npx cap add ios`, Swift Package Manager), mais la plateforme n'est pas ajoutée. La TWA (`packages/android`, `packages/android-dev`) reste en place tant que cette coquille n'est pas publiée.

Aucun service payant, aucun SDK d'analytics, de crash ou de pub.

## Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| Node | 22 ou plus | exigé par la CLI Capacitor 8 |
| JDK | **21** | le module `capacitor-android` compile en Java 21 (`sourceCompatibility VERSION_21`); le JDK 17 de Bubblewrap ne suffit pas |
| Android SDK | platform `android-36`, build-tools 35 ou 36 | `compileSdk` et `targetSdk` 36 |

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

| Variante | applicationId | Nom affiché | Site chargé | HTTP en clair |
|---|---|---|---|---|
| `prod` | `fr.ohmywind.app` | OhMyWind | https://ohmywind.fr | non |
| `dev` (défaut) | `fr.ohmywind.app.dev` | OhMyWind Dev | https://dev.ohmywind.fr | non |
| `local` | `fr.ohmywind.app.dev` | OhMyWind Local | http://localhost:4173 | oui |

Une valeur inconnue fait échouer le sync (pas de repli silencieux sur dev).

Le sync écrit la config dans `android/app/src/main/assets/capacitor.config.json`, et `app/build.gradle` relit `appId`, `appName`, `server.url` et la variante dans ce fichier. Il n'y a donc pas de flavors Gradle: c'est le dernier sync qui décide de tout, et un APK ne peut pas porter l'applicationId de prod avec l'URL de dev. Conséquence: **toujours re-synchroniser avant de changer de variante**. Sans sync préalable, Gradle refuse de configurer le projet avec un message explicite.

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
- **Pas d'iOS**: ni plateforme, ni `WKAppBoundDomains`, ni `PrivacyInfo.xcprivacy` pour l'instant.
