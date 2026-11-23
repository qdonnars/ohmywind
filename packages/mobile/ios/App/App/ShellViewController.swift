// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import Capacitor
import UIKit
import WebKit

/// Capacitor's bridge view controller with the two things the shell changes.
///
/// - The back swipe from the left edge, off by default in a WKWebView. It
///   walks the WebView's history, which includes the site's own in-app
///   navigations (history.pushState), the same history the Android back
///   button walks.
/// - Who decides to show the offline fallback page (see ShellNavigationDelegate).
class ShellViewController: CAPBridgeViewController {
    /// The web view keeps its navigation delegate weakly.
    private var shellNavigation: ShellNavigationDelegate?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView, let capacitorDelegate = webView.navigationDelegate else { return }
        webView.allowsBackForwardNavigationGestures = true
        let delegate = ShellNavigationDelegate(
            wrapping: capacitorDelegate,
            fallbackURL: ShellNavigationDelegate.fallbackURL(for: bridge?.config)
        )
        shellNavigation = delegate
        webView.navigationDelegate = delegate
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
