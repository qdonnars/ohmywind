// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

package fr.ohmywind.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Facts about the installed shell that the web page cannot learn by itself.
 *
 * Reached from the site with registerPlugin("ShellInfo") from @capacitor/core.
 * The name is part of the contract with packages/web: renaming it breaks the
 * page silently (the call then rejects as "not implemented").
 */
@CapacitorPlugin(name = "ShellInfo")
public class ShellInfoPlugin extends Plugin {

    /**
     * Resolves { firstInstallTime, lastUpdateTime } in milliseconds since the
     * epoch, straight from PackageInfo. Both values fit a JS number exactly.
     */
    @PluginMethod
    public void getInstallInfo(PluginCall call) {
        Context context = getContext();
        try {
            PackageInfo info = readPackageInfo(context.getPackageManager(), context.getPackageName());
            JSObject result = new JSObject();
            result.put("firstInstallTime", info.firstInstallTime);
            result.put("lastUpdateTime", info.lastUpdateTime);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException e) {
            // Cannot happen for our own package, but the API forces the catch.
            call.reject("Package info unavailable", e);
        }
    }

    private static PackageInfo readPackageInfo(PackageManager pm, String packageName)
        throws PackageManager.NameNotFoundException {
        // The int-flags overload is deprecated from API 33 on.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0));
        }
        return pm.getPackageInfo(packageName, 0);
    }
}
