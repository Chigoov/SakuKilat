package com.sakukilat.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import com.sakukilat.app.MainActivity;
import com.sakukilat.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * SakuKilat Native Android Home Screen Widget Provider (Phase P4)
 * ----------------------------------------------------------------
 * Manages native RemoteViews rendering for Small, Medium, and Large widgets.
 * Reads aggregated data from native SharedPreferences (CapacitorStorage)
 * populated by the SakuKilat web client without touching internal Beranda UI.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 4.8
 */
public class SakuKilatAppWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE_WIDGET = "com.sakukilat.app.widget.UPDATE_WIDGET";

    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String KEY_SNAPSHOT = "sakukilat:v2:widget-snapshot";

    public static final String URI_SAKU = "sakukilat://saku";
    public static final String URI_REKAPAN = "sakukilat://rekapan";
    public static final String URI_ENTRY = "sakukilat://entry?action=expense";

    private static final int COLOR_EXPENSE = Color.parseColor("#F43F5E");
    private static final int COLOR_INCOME = Color.parseColor("#10B981");
    private static final int COLOR_TRANSFER = Color.parseColor("#38BDF8");

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            Bundle options = appWidgetManager.getAppWidgetOptions(appWidgetId);
            updateAppWidget(context, appWidgetManager, appWidgetId, options);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        updateAppWidget(context, appWidgetManager, appWidgetId, newOptions);
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_UPDATE_WIDGET.equals(action) || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)) {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName thisWidget = new ComponentName(context, SakuKilatAppWidgetProvider.class);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
            if (appWidgetIds != null && appWidgetIds.length > 0) {
                for (int appWidgetId : appWidgetIds) {
                    Bundle options = appWidgetManager.getAppWidgetOptions(appWidgetId);
                    updateAppWidget(context, appWidgetManager, appWidgetId, options);
                }
            }
        }
    }

    /**
     * Determines layout based on widget cell dimensions (Property 12 / Req 4.6):
     * - Small: minWidth < 180dp (single primary metric: Total Balance)
     * - Medium: 180dp <= minWidth < 260dp (dual metrics: Total Balance + Monthly Expense)
     * - Large: minWidth >= 260dp (summary + nearest bill + 3 recent transactions)
     */
    public static String getWidgetLayoutType(int minWidthDp, int minHeightDp) {
        if (minWidthDp > 0 && minWidthDp < 180) return "small";
        if (minWidthDp >= 260) return "large";
        return "medium";
    }

    /**
     * Updates an individual widget instance with appropriate RemoteViews layout.
     */
    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle options) {
        int minWidth = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        int minHeight = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) : 0;
        String layoutType = getWidgetLayoutType(minWidth, minHeight);

        String snapshotJson = readSnapshotFromStorage(context);
        JSONObject snapshot = null;
        if (snapshotJson != null && !snapshotJson.trim().isEmpty()) {
            try {
                snapshot = new JSONObject(snapshotJson);
            } catch (Exception ignored) {}
        }

        RemoteViews views;
        switch (layoutType) {
            case "small":
                views = new RemoteViews(context.getPackageName(), R.layout.widget_small);
                populateSmallWidget(context, views, snapshot);
                break;
            case "large":
                views = new RemoteViews(context.getPackageName(), R.layout.widget_large);
                populateLargeWidget(context, views, snapshot);
                break;
            case "medium":
            default:
                views = new RemoteViews(context.getPackageName(), R.layout.widget_medium);
                populateMediumWidget(context, views, snapshot);
                break;
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * Populates Small layout (Single primary metric: Total Balance).
     */
    private static void populateSmallWidget(Context context, RemoteViews views, JSONObject snapshot) {
        // Wire general deep link on root
        views.setOnClickPendingIntent(R.id.widget_root, createDeepLinkPendingIntent(context, URI_SAKU, 100));

        if (snapshot == null) {
            // Uninitialized prompt (Requirement 4.8)
            views.setViewVisibility(R.id.layout_content, View.GONE);
            views.setViewVisibility(R.id.layout_uninitialized, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.layout_uninitialized, createDeepLinkPendingIntent(context, URI_SAKU, 101));
            return;
        }

        views.setViewVisibility(R.id.layout_uninitialized, View.GONE);
        views.setViewVisibility(R.id.layout_content, View.VISIBLE);

        long totalBalance = snapshot.optLong("totalBalance", 0);
        views.setTextViewText(R.id.text_total_balance, formatIDR(totalBalance));

        long generatedAt = snapshot.optLong("generatedAt", 0);
        views.setTextViewText(R.id.text_last_updated, "Diperbarui • " + formatTimestamp(generatedAt));

        // Tapping balance section launches Tab Saku (Requirement 4.7)
        views.setOnClickPendingIntent(R.id.layout_balance, createDeepLinkPendingIntent(context, URI_SAKU, 102));
    }

    /**
     * Populates Medium layout (Dual metrics: Total Balance + Monthly Expense + Quick Add).
     */
    private static void populateMediumWidget(Context context, RemoteViews views, JSONObject snapshot) {
        views.setOnClickPendingIntent(R.id.widget_root, createDeepLinkPendingIntent(context, URI_SAKU, 200));

        // Quick add button launches transaction entry form (Requirement 4.7)
        views.setOnClickPendingIntent(R.id.btn_quick_add, createDeepLinkPendingIntent(context, URI_ENTRY, 201));

        if (snapshot == null) {
            views.setViewVisibility(R.id.layout_content, View.GONE);
            views.setViewVisibility(R.id.layout_uninitialized, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.layout_uninitialized, createDeepLinkPendingIntent(context, URI_SAKU, 202));
            return;
        }

        views.setViewVisibility(R.id.layout_uninitialized, View.GONE);
        views.setViewVisibility(R.id.layout_content, View.VISIBLE);

        long totalBalance = snapshot.optLong("totalBalance", 0);
        long monthlyExpense = snapshot.optLong("monthlyExpense", 0);
        int monthlyTxCount = snapshot.optInt("monthlyExpenseTxCount", 0);
        long generatedAt = snapshot.optLong("generatedAt", 0);

        views.setTextViewText(R.id.text_total_balance, formatIDR(totalBalance));
        views.setTextViewText(R.id.text_monthly_expense, formatIDR(monthlyExpense));
        views.setTextViewText(R.id.text_monthly_tx_count, monthlyTxCount + " transaksi");
        views.setTextViewText(R.id.text_last_updated, "Diperbarui • " + formatTimestamp(generatedAt));

        // Tapping Total Balance opens Tab Saku
        views.setOnClickPendingIntent(R.id.layout_balance, createDeepLinkPendingIntent(context, URI_SAKU, 203));

        // Tapping Monthly Expense opens Tab Rekapan
        views.setOnClickPendingIntent(R.id.layout_expense, createDeepLinkPendingIntent(context, URI_REKAPAN, 204));
    }

    /**
     * Populates Large layout (Summary + Nearest Bill + 3 Recent Transactions).
     */
    private static void populateLargeWidget(Context context, RemoteViews views, JSONObject snapshot) {
        views.setOnClickPendingIntent(R.id.widget_root, createDeepLinkPendingIntent(context, URI_SAKU, 300));
        views.setOnClickPendingIntent(R.id.btn_quick_add, createDeepLinkPendingIntent(context, URI_ENTRY, 301));

        if (snapshot == null) {
            views.setViewVisibility(R.id.layout_content, View.GONE);
            views.setViewVisibility(R.id.layout_uninitialized, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.layout_uninitialized, createDeepLinkPendingIntent(context, URI_SAKU, 302));
            return;
        }

        views.setViewVisibility(R.id.layout_uninitialized, View.GONE);
        views.setViewVisibility(R.id.layout_content, View.VISIBLE);

        // 1. Dual Metrics
        long totalBalance = snapshot.optLong("totalBalance", 0);
        long monthlyExpense = snapshot.optLong("monthlyExpense", 0);
        int monthlyTxCount = snapshot.optInt("monthlyExpenseTxCount", 0);
        long generatedAt = snapshot.optLong("generatedAt", 0);

        views.setTextViewText(R.id.text_total_balance, formatIDR(totalBalance));
        views.setTextViewText(R.id.text_monthly_expense, formatIDR(monthlyExpense));
        views.setTextViewText(R.id.text_monthly_tx_count, monthlyTxCount + " transaksi");
        views.setTextViewText(R.id.text_last_updated, "Diperbarui • " + formatTimestamp(generatedAt));

        views.setOnClickPendingIntent(R.id.layout_balance, createDeepLinkPendingIntent(context, URI_SAKU, 303));
        views.setOnClickPendingIntent(R.id.layout_expense, createDeepLinkPendingIntent(context, URI_REKAPAN, 304));

        // 2. Nearest Bill Alert
        JSONObject nearestBill = snapshot.optJSONObject("nearestBill");
        if (nearestBill != null) {
            views.setViewVisibility(R.id.layout_bill_alert, View.VISIBLE);
            String billName = nearestBill.optString("name", "Tagihan");
            long billAmount = nearestBill.optLong("amount", 0);
            String dueDateStr = nearestBill.optString("dueDateStr", "");
            boolean isOverdue = nearestBill.optBoolean("isOverdue", false);

            if (isOverdue) {
                views.setTextViewText(R.id.text_bill_badge, "JATUH TEMPO");
                views.setTextColor(R.id.text_bill_badge, COLOR_EXPENSE);
            } else {
                views.setTextViewText(R.id.text_bill_badge, "TAGIHAN");
                views.setTextColor(R.id.text_bill_badge, Color.parseColor("#06B6D4"));
            }

            views.setTextViewText(R.id.text_bill_info, billName + " • " + formatIDR(billAmount));
            views.setTextViewText(R.id.text_bill_date, dueDateStr);
            views.setOnClickPendingIntent(R.id.layout_bill_alert, createDeepLinkPendingIntent(context, URI_SAKU, 305));
        } else {
            views.setViewVisibility(R.id.layout_bill_alert, View.GONE);
        }

        // 3. Recent 3 Transactions
        JSONArray recent = snapshot.optJSONArray("recentTransactions");
        int count = recent != null ? recent.length() : 0;

        int[] rowIds = { R.id.layout_tx_1, R.id.layout_tx_2, R.id.layout_tx_3 };
        int[] descIds = { R.id.text_tx_desc_1, R.id.text_tx_desc_2, R.id.text_tx_desc_3 };
        int[] dateIds = { R.id.text_tx_date_1, R.id.text_tx_date_2, R.id.text_tx_date_3 };
        int[] amountIds = { R.id.text_tx_amount_1, R.id.text_tx_amount_2, R.id.text_tx_amount_3 };

        if (count > 0) {
            views.setViewVisibility(R.id.text_tx_empty, View.GONE);
            for (int i = 0; i < 3; i++) {
                if (i < count) {
                    JSONObject tx = recent.optJSONObject(i);
                    if (tx != null) {
                        views.setViewVisibility(rowIds[i], View.VISIBLE);
                        String desc = tx.optString("description", "Transaksi");
                        String formattedDate = tx.optString("formattedDate", "");
                        long amount = tx.optLong("amount", 0);
                        String type = tx.optString("type", "expense");

                        views.setTextViewText(descIds[i], desc);
                        views.setTextViewText(dateIds[i], formattedDate);

                        int color;
                        String prefix = "";
                        if ("income".equalsIgnoreCase(type)) {
                            color = COLOR_INCOME;
                            prefix = "+";
                        } else if ("transfer".equalsIgnoreCase(type)) {
                            color = COLOR_TRANSFER;
                        } else {
                            color = COLOR_EXPENSE;
                            prefix = "-";
                        }

                        views.setTextViewText(amountIds[i], prefix + formatIDR(amount));
                        views.setTextColor(amountIds[i], color);
                    } else {
                        views.setViewVisibility(rowIds[i], View.GONE);
                    }
                } else {
                    views.setViewVisibility(rowIds[i], View.GONE);
                }
            }
        } else {
            views.setViewVisibility(R.id.text_tx_empty, View.VISIBLE);
            for (int i = 0; i < 3; i++) {
                views.setViewVisibility(rowIds[i], View.GONE);
            }
        }

        // Tapping recent section launches Tab Rekapan
        views.setOnClickPendingIntent(R.id.layout_recent_section, createDeepLinkPendingIntent(context, URI_REKAPAN, 306));
    }

    /**
     * Creates an explicit PendingIntent directing to MainActivity with the specified deep link URI.
     */
    public static PendingIntent createDeepLinkPendingIntent(Context context, String uriString, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uriString));
        intent.setClass(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    /**
     * Reads the serialized NativeWidgetSnapshot JSON from native storage (CapacitorStorage).
     */
    public static String readSnapshotFromStorage(Context context) {
        if (context == null) return null;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String json = prefs.getString(KEY_SNAPSHOT, null);
            if (json != null && !json.trim().isEmpty()) {
                return json;
            }

            // Fallback: check app-specific default preferences
            SharedPreferences defaultPrefs = context.getSharedPreferences(
                    context.getPackageName() + "_preferences", Context.MODE_PRIVATE
            );
            json = defaultPrefs.getString(KEY_SNAPSHOT, null);
            if (json != null && !json.trim().isEmpty()) {
                return json;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    /**
     * Formats currency as Indonesian Rupiah: full nominal without abbreviations (Requirement 1.3).
     */
    public static String formatIDR(long amount) {
        boolean isNegative = amount < 0;
        long absVal = Math.abs(amount);
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(new Locale("id", "ID"));
        symbols.setGroupingSeparator('.');
        DecimalFormat df = new DecimalFormat("#,###", symbols);
        String formatted = df.format(absVal);
        if (formatted == null || formatted.isEmpty()) {
            formatted = "0";
        }
        return (isNegative ? "-Rp" : "Rp") + formatted;
    }

    /**
     * Formats epoch ms timestamp into human-readable HH:mm.
     */
    private static String formatTimestamp(long epochMs) {
        if (epochMs <= 0) return "Baru saja";
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("HH.mm", new Locale("id", "ID"));
            return sdf.format(new Date(epochMs));
        } catch (Exception e) {
            return "Baru saja";
        }
    }
}
