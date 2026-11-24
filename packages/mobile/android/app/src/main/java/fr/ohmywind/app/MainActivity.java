// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

package fr.ohmywind.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins from npm are discovered through capacitor.plugins.json; a
        // plugin that lives in the app module is not, and must be registered
        // before the bridge is created in super.onCreate().
        registerPlugin(ShellInfoPlugin.class);
        super.onCreate(savedInstanceState);
        // The bridge has no hook to supply a client before it starts loading,
        // so it is swapped right after. WebView callbacks are posted to this
        // thread, so none of the first navigation's reach the default client.
        // Why the default one is replaced: see ShellWebViewClient.
        getBridge().setWebViewClient(new ShellWebViewClient(getBridge()));
    }
}
