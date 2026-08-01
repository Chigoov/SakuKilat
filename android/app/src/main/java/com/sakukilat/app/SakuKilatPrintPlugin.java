package com.sakukilat.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SakuKilatPrint")
public class SakuKilatPrintPlugin extends Plugin {
    private WebView printWebView;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html", "");
        String jobName = call.getString("jobName", "Laporan SakuKilat");
        if (html.trim().isEmpty()) {
            call.reject("HTML laporan kosong");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                printWebView = new WebView(getContext());
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            call.reject("Layanan cetak Android tidak tersedia");
                            return;
                        }
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                        printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                        JSObject result = new JSObject();
                        result.put("ok", true);
                        call.resolve(result);
                    }
                });
                printWebView.loadDataWithBaseURL("https://sakukilat.local/", html, "text/html", "UTF-8", null);
            } catch (Exception error) {
                call.reject("Gagal membuka dialog cetak", error);
            }
        });
    }
}
