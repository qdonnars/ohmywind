// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import Capacitor
import UIKit
import WebKit

/// Capacitor's bridge view controller with the three things the shell changes.
///
/// - The back swipe from the left edge, off by default in a WKWebView. It
///   walks the WebView's history, which includes the site's own in-app
///   navigations (history.pushState), the same history the Android back
///   button walks.
/// - Who decides to show the offline fallback page (see ShellNavigationDelegate).
/// - Who answers the site's request for the position (see ShellUIDelegate).
class ShellViewController: CAPBridgeViewController {
    /// The web view keeps its delegates weakly.
    private var shellNavigation: ShellNavigationDelegate?
    private var shellUI: ShellUIDelegate?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = true
        if let capacitorDelegate = webView.navigationDelegate {
            let delegate = ShellNavigationDelegate(
                wrapping: capacitorDelegate,
                fallbackURL: ShellNavigationDelegate.fallbackURL(for: bridge?.config)
            )
            shellNavigation = delegate
            webView.navigationDelegate = delegate
        }
        if let capacitorUIDelegate = webView.uiDelegate {
            let delegate = ShellUIDelegate(wrapping: capacitorUIDelegate, siteURL: bridge?.config.serverURL)
            shellUI = delegate
            webView.uiDelegate = delegate
        }
    }
}

/// Sits in front of Capacitor's UI delegate and forwards every call to it,
/// except the page's request for the position (#571).
///
/// WebKit asks twice when a page in an app calls navigator.geolocation: iOS
/// first asks whether the app may use the location (the
/// NSLocationWhenInUseUsageDescription prompt), then WebKit asks again for
/// the page's origin ("<site> would like to use your current location").
/// From iOS 27, the app may answer that second request itself: this is
/// `webView(_:requestGeolocationPermissionFor:initiatedByFrame:decisionHandler:)`
/// of WKUIDelegate. Granted for the variant's own site, only the system
/// prompt is left, and the reader's answer there still decides: WebKit's
/// CoreLocation provider asks for the app's authorization when it starts,
/// and a refusal reaches the page as a denied request. Any other origin gets
/// WebKit's own prompt, as before. Before iOS 27, WebKit never calls the
/// method and both prompts remain: no public API answers it there.
final class ShellUIDelegate: NSObject, WKUIDelegate {
    private let capacitorDelegate: WKUIDelegate
    private let siteURL: URL?

    init(wrapping capacitorDelegate: WKUIDelegate, siteURL: URL?) {
        self.capacitorDelegate = capacitorDelegate
        self.siteURL = siteURL
        super.init()
    }

    // MARK: Forwarding, as in ShellNavigationDelegate

    override func responds(to aSelector: Selector!) -> Bool {
        return super.responds(to: aSelector) || capacitorDelegate.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if capacitorDelegate.responds(to: aSelector) {
            return capacitorDelegate
        }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: Geolocation

    // Named for Objective-C by hand: the iOS 26 SDK the app is built with
    // does not declare this method yet, and iOS 27 looks it up by this
    // selector. Same signature as Capacitor's answer to camera requests.
    @objc(webView:requestGeolocationPermissionForOrigin:initiatedByFrame:decisionHandler:)
    func webView(_ webView: WKWebView,
                 requestGeolocationPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let isSite = Self.isSite(origin, siteURL)
        NSLog("OhMyWind shell: position requested by %@, %@", origin.host, isSite ? "granted to the site" : "left to WebKit")
        decisionHandler(isSite ? .grant : .prompt)
    }

    /// Whether the origin is the variant's site (`server.url`). WebKit gives
    /// 0 for a default port where URL gives nil.
    static func isSite(_ origin: WKSecurityOrigin, _ siteURL: URL?) -> Bool {
        guard let siteURL = siteURL else { return false }
        return origin.protocol == siteURL.scheme
            && origin.host == siteURL.host
            && origin.port == (siteURL.port ?? 0)
    }
}

/// Sits in front of Capacitor's navigation delegate and forwards every call
/// to it, except the two failure callbacks.
///
/// Capacitor 8 on iOS builds the fallback URL with
/// `localURL.appendingPathComponent(errorPath)`, which percent-encodes the
/// "?" of `fallback.html?to=<site>`: the asset handler then looks for a file
/// literally named "fallback.html?to=..." and fails, and that failure loads
/// the same broken URL again. It also shows the fallback for navigations that
/// were merely interrupted: a link handed to Safari, a page replaced by
/// another before it finished. Here the same `server.errorPath` is resolved
/// as a relative URL, query included, and only a real failure of the main
/// frame shows it.
final class ShellNavigationDelegate: NSObject, WKNavigationDelegate {
    private let capacitorDelegate: WKNavigationDelegate
    private let fallbackURL: URL?

    init(wrapping capacitorDelegate: WKNavigationDelegate, fallbackURL: URL?) {
        self.capacitorDelegate = capacitorDelegate
        self.fallbackURL = fallbackURL
        super.init()
    }

    /// `server.errorPath` against the shell's own origin (capacitor://localhost).
    static func fallbackURL(for config: InstanceConfiguration?) -> URL? {
        guard let config = config, let errorPath = config.errorPath else { return nil }
        return URL(string: errorPath, relativeTo: config.localURL)?.absoluteURL
    }

    // MARK: Forwarding

    // WebKit asks once, when the delegate is set, which optional methods
    // exist; anything implemented by Capacitor's delegate counts as ours.
    override func responds(to aSelector: Selector!) -> Bool {
        return super.responds(to: aSelector) || capacitorDelegate.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if capacitorDelegate.responds(to: aSelector) {
            return capacitorDelegate
        }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: Failures

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        NSLog("OhMyWind shell: navigation failed before commit (%@ %ld)", nsError.domain, nsError.code)
        guard !Self.isInterruption(nsError), let fallbackURL = fallbackURL else { return }
        // The fallback itself failing must not reload it forever.
        if let failingURL = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL,
           failingURL.scheme == fallbackURL.scheme {
            return
        }
        NSLog("OhMyWind shell: showing the offline fallback page")
        webView.load(URLRequest(url: fallbackURL))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        // The page was already committed, so it shows something of its own
        // (possibly served by the service worker): leave it on screen.
        let nsError = error as NSError
        NSLog("OhMyWind shell: navigation failed after commit (%@ %ld)", nsError.domain, nsError.code)
    }

    /// A navigation stopped by the app or by the page rather than by the
    /// network: cancelled (a newer load replaced it) or interrupted by a
    /// policy decision (a link opened in Safari instead).
    private static func isInterruption(_ error: NSError) -> Bool {
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled {
            return true
        }
        // WebKitErrorFrameLoadInterruptedByPolicyChange
        return error.domain == "WebKitErrorDomain" && error.code == 102
    }
}
