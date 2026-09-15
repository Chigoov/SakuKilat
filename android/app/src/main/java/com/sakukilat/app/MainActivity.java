package com.sakukilat.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.sakukilat.app.widget.SakuKilatWidgetPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SakuKilatPrintPlugin.class);
        registerPlugin(SakuKilatWidgetPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void exitApp() {
                    runOnUiThread(() -> finishAffinity());
                }

                @JavascriptInterface
                public void notifyWidgetUpdate() {
                    try {
                        android.content.Intent intent = new android.content.Intent("com.sakukilat.app.widget.UPDATE_WIDGET");
                        intent.setPackage(getPackageName());
                        sendBroadcast(intent);
                    } catch (Exception ignored) {}
                }
            }, "SakuKilatAndroid");
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('sakukilat:hardware-back'));",
                        null
                    );
                }
            }
        });

        handleDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(android.content.Intent intent) {
        if (intent == null || intent.getData() == null) return;
        android.net.Uri uri = intent.getData();
        if ("sakukilat".equalsIgnoreCase(uri.getScheme())) {
            String host = uri.getHost();
            String tab = "beranda";
            if ("saku".equalsIgnoreCase(host)) {
                tab = "saku";
            } else if ("rekapan".equalsIgnoreCase(host)) {
                tab = "rekapan";
            } else if ("entry".equalsIgnoreCase(host)) {
                tab = "beranda";
            }
            final String targetTab = tab;
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().postDelayed(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "window.dispatchEvent(new CustomEvent('sakukilat:navigate', { detail: { tab: '" + targetTab + "' } }));";
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                }, 300);
            }
        }
    }
}
