// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ShellViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // A quick action that launched the app. windowScene(_:performActionFor:)
        // is not called in that case: the item only comes in here.
        if let shortcutItem = connectionOptions.shortcutItem {
            openWhenReady(shortcutItem)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    // Universal links (https://<site>/...) with the app already running. On a
    // cold start SceneDelegateProxy finds them in the connection options.
    // Either way the App plugin hands the URL to the site as appUrlOpen.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: Home screen quick actions

    // A quick action chosen while the app is running or suspended.
    func windowScene(_ windowScene: UIWindowScene,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(open(shortcutItem))
    }

    /// The plugins load with the bridge view: before it first appears, a URL
    /// posted now would reach no one. Same wait as SceneDelegateProxy's for
    /// the URLs of a cold start.
    private func openWhenReady(_ shortcutItem: UIApplicationShortcutItem) {
        var token: NSObjectProtocol?
        token = NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { [weak self] _ in
            if let token {
                NotificationCenter.default.removeObserver(token)
            }
            _ = self?.open(shortcutItem)
        }
    }

    /// The quick actions of Info.plist (UIApplicationShortcutItems) carry the
    /// path of a page of the site, like the launcher shortcuts on Android.
    /// The page is opened the way Android opens it: as the URL of that page on
    /// the variant's site, handed to the App plugin, which gives it to the
    /// site as appUrlOpen (held until the site listens) and getLaunchUrl().
    /// The site routes it (native/appLinks.ts), without reloading.
    private func open(_ shortcutItem: UIApplicationShortcutItem) -> Bool {
        guard let path = shortcutItem.userInfo?["path"] as? String,
              let bridge = (window?.rootViewController as? CAPBridgeViewController)?.bridge,
              let url = URL(string: path, relativeTo: bridge.config.serverURL)?.absoluteURL else {
            NSLog("OhMyWind shell: quick action %@ not handled", shortcutItem.type)
            return false
        }
        NSLog("OhMyWind shell: quick action %@ opens %@", shortcutItem.type, url.absoluteString)
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }
}
