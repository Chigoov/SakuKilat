package com.sakukilat.app.widget;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * SakuKilat Capacitor Native Plugin for Widget Synchronization (Phase P4)
 * ------------------------------------------------------------------------
 * Exposes a direct native bridge method `notifyUpdate()` to trigger
 * widget layout updates on the Android Launcher when transactions or
 * balances are modified.
 *
 * Requirements: 4.1, 4.4, 4.6
 */
@CapacitorPlugin(name = "SakuKilatWidget")
public class SakuKilatWidgetPlugin extends Plugin {

    @PluginMethod
    public void notifyUpdate(PluginCall call) {
        try {
            Intent intent = new Intent(SakuKilatAppWidgetProvider.ACTION_UPDATE_WIDGET);
            intent.setPackage(getContext().getPackageName());
            getContext().sendBroadcast(intent);

            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to broadcast widget update: " + e.getMessage(), e);
        }
    }
}
