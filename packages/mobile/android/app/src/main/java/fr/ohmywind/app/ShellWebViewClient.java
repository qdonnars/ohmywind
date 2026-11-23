// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

package fr.ohmywind.app;

import android.graphics.Bitmap;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import java.util.Map;

/**
 * Shows the local fallback page (server.errorPath) only once a main-frame
 * navigation has really failed, instead of on the first error report.
 *
 * Capacitor's BridgeWebViewClient calls loadUrl(errorPath) from inside
 * onReceivedError / onReceivedHttpError for any main-frame request. Offline,
 * with the site's service worker stopped (always the case on a cold start),
 * the WebView sends a network request for the navigation while the worker
 * boots, reports its ERR_CONNECTION_REFUSED as a main-frame error, then
 * carries on and commits the page the worker serves. Capacitor's loadUrl()
 * at the error report aborted that navigation, so the app never opened
 * offline. Observed sequence on WebView 150, offline cold start:
 *   onPageStarted, onReceivedError(main, -6), onPageFinished (document still
 *   about:blank), onPageStarted, onPageFinished (document served by the worker)
 * whereas a navigation that really fails ends on Chromium's error page,
 * whose document URL is chrome-error://chromewebdata/.
 *
 * So the decision waits for the commit and looks at what was committed.
 */
public class ShellWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "ShellWebViewClient";

    // Committed document URL, plus the HTTP status of the navigation
    // response (-1 where the WebView does not expose it).
    private static final String PROBE =
        "(function(){var n=performance.getEntriesByType('navigation')[0];" +
        "var s=n&&typeof n.responseStatus==='number'?n.responseStatus:-1;" +
        "return location.href+' '+s;})()";

    private static final String ERROR_PAGE_PREFIX = "chrome-error:";

    private final Bridge bridge;

    // Main-frame URL the last HTTP error status was reported for. An error
    // status from the network is only final if the page committed at that URL
    // carries it too: the service worker may still answer the navigation.
    private String httpErrorUrl;

    // Both page callbacks probe the same commit; load the fallback once.
    private boolean fallbackRequested;

    public ShellWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) {
            Logger.debug(TAG, "main-frame error " + error.getErrorCode() + " " + request.getUrl() + ", waiting for the commit");
        }
        // Super still notifies the WebViewListeners; masking the main-frame
        // flag is what keeps it from loading the fallback straight away.
        super.onReceivedError(view, new NotMainFrame(request), error);
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        if (!url.equals(bridge.getErrorUrl())) {
            fallbackRequested = false;
        }
        super.onPageStarted(view, url, favicon);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        if (request.isForMainFrame()) {
            httpErrorUrl = request.getUrl().toString();
        }
        super.onReceivedHttpError(view, new NotMainFrame(request), errorResponse);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (url.equals(bridge.getErrorUrl())) {
            // Each failure loads the fallback as a new history entry (and its
            // retry replaces itself with the failed page): drop everything
            // behind it so failed retries never pile up and Back leaves the app.
            view.clearHistory();
            return;
        }
        checkCommittedPage(view);
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        super.onPageCommitVisible(view, url);
        // Neither callback alone is enough: when a retry from the fallback
        // fails, the WebView may fire onPageFinished before the error page has
        // committed (the probe then never answers) and only signal the commit
        // through onPageCommitVisible.
        if (!url.equals(bridge.getErrorUrl())) {
            checkCommittedPage(view);
        }
    }

    private void checkCommittedPage(WebView view) {
        final String errorUrl = bridge.getErrorUrl();
        if (errorUrl == null) {
            return;
        }
        final String pendingHttpError = httpErrorUrl;
        view.evaluateJavascript(PROBE, (raw) -> {
            String result = raw == null ? "" : raw.replace("\"", "");
            int space = result.lastIndexOf(' ');
            String committed = space < 0 ? result : result.substring(0, space);
            int status = parseStatus(space < 0 ? "" : result.substring(space + 1));

            boolean failed = committed.startsWith(ERROR_PAGE_PREFIX);
            if (!failed && pendingHttpError != null && pendingHttpError.equals(committed)) {
                // The page at the failing URL is the server's error response,
                // not a copy from the service worker.
                failed = status >= 400 || status == -1;
                httpErrorUrl = null;
            }
            if (failed && !fallbackRequested) {
                fallbackRequested = true;
                Logger.debug(TAG, "main-frame navigation failed (" + committed + "), showing the fallback");
                view.loadUrl(errorUrl);
            }
        });
    }

    private static int parseStatus(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** The same request, reported to Capacitor as a subresource. */
    private static final class NotMainFrame implements WebResourceRequest {

        private final WebResourceRequest inner;

        NotMainFrame(WebResourceRequest inner) {
            this.inner = inner;
        }

        @Override
        public Uri getUrl() {
            return inner.getUrl();
        }

        @Override
        public boolean isForMainFrame() {
            return false;
        }

        @Override
        public boolean isRedirect() {
            return inner.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return inner.hasGesture();
        }

        @Override
        public String getMethod() {
            return inner.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return inner.getRequestHeaders();
        }
    }
}
