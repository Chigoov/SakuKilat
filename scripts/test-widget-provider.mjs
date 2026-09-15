/**
 * SakuKilat — Unit & Structural Verification: Android Native AppWidgetProvider (Task 8.3)
 * -------------------------------------------------------------------------------------
 * Verifies SakuKilatAppWidgetProvider.java, RemoteViews layout XMLs (Small, Medium, Large),
 * drawable resources, colors.xml, and deep link PendingIntents.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 4.8
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('====================================================')
console.log(' SAKUKILAT — UNIT TESTS: APPWIDGET PROVIDER (8.3)   ')
console.log('====================================================')

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`)
    process.exit(1)
  }
  console.log(`  ✓ ${message}`)
}

// ── Test 1: SakuKilatAppWidgetProvider.java Existence and Structure ──────────
console.log('\n▶ Test Group 1: Java Provider Class Structure...')
const javaPath = path.join(
  rootDir,
  'android/app/src/main/java/com/sakukilat/app/widget/SakuKilatAppWidgetProvider.java'
)
assert(fs.existsSync(javaPath), 'SakuKilatAppWidgetProvider.java must exist')

const javaCode = fs.readFileSync(javaPath, 'utf8')
assert(javaCode.includes('package com.sakukilat.app.widget;'), 'Package must be com.sakukilat.app.widget')
assert(javaCode.includes('public class SakuKilatAppWidgetProvider extends AppWidgetProvider'), 'Must extend AppWidgetProvider')
assert(javaCode.includes('onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds)'), 'Must implement onUpdate')
assert(javaCode.includes('onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager'), 'Must implement onAppWidgetOptionsChanged')
assert(javaCode.includes('onReceive(Context context, Intent intent)'), 'Must implement onReceive for update broadcast')
assert(javaCode.includes('ACTION_UPDATE_WIDGET = "com.sakukilat.app.widget.UPDATE_WIDGET"'), 'Must handle UPDATE_WIDGET action')
assert(javaCode.includes('"CapacitorStorage"'), 'Must read from CapacitorStorage SharedPreferences')
assert(javaCode.includes('"sakukilat:v2:widget-snapshot"'), 'Must read snapshot under key sakukilat:v2:widget-snapshot')

// ── Test 2: Layout Dimension Mapping Logic (Property 12 / Req 4.6) ───────────
console.log('\n▶ Test Group 2: Dimension Layout Mapping Logic...')
assert(javaCode.includes('getWidgetLayoutType'), 'Must have getWidgetLayoutType helper')
assert(javaCode.includes('minWidthDp < 180') && javaCode.includes('"small"'), 'Must map width < 180dp to small layout')
assert(javaCode.includes('minWidthDp >= 260') && javaCode.includes('"large"'), 'Must map width >= 260dp to large layout')
assert(javaCode.includes('"medium"'), 'Must map intermediate width to medium layout')

// ── Test 3: Deep Link URIs and PendingIntents (Req 4.7) ──────────────────────
console.log('\n▶ Test Group 3: Deep Link URIs & PendingIntents...')
assert(javaCode.includes('URI_SAKU = "sakukilat://saku"'), 'Must define URI sakukilat://saku for balance')
assert(javaCode.includes('URI_REKAPAN = "sakukilat://rekapan"'), 'Must define URI sakukilat://rekapan for expense')
assert(javaCode.includes('URI_ENTRY = "sakukilat://entry?action=expense"'), 'Must define URI sakukilat://entry for quick action')
assert(javaCode.includes('createDeepLinkPendingIntent'), 'Must have helper createDeepLinkPendingIntent')
assert(javaCode.includes('MainActivity.class'), 'PendingIntent must explicitly target MainActivity')
assert(javaCode.includes('FLAG_UPDATE_CURRENT') && javaCode.includes('FLAG_IMMUTABLE'), 'PendingIntent must use safe flags for Android M+')

// ── Test 4: Uninitialized Prompt Handling (Req 4.8) ──────────────────────────
console.log('\n▶ Test Group 4: Uninitialized State & Prompt...')
assert(javaCode.includes('snapshot == null'), 'Must detect missing snapshot')
assert(javaCode.includes('R.id.layout_uninitialized'), 'Must reference layout_uninitialized view')
assert(javaCode.includes('View.VISIBLE') && javaCode.includes('View.GONE'), 'Must toggle visibility between content and uninitialized')

// ── Test 5: Small Layout XML (widget_small.xml) ──────────────────────────────
console.log('\n▶ Test Group 5: Small Layout XML Verification...')
const smallXmlPath = path.join(rootDir, 'android/app/src/main/res/layout/widget_small.xml')
assert(fs.existsSync(smallXmlPath), 'widget_small.xml must exist')

const smallXml = fs.readFileSync(smallXmlPath, 'utf8')
assert(smallXml.includes('xmlns:android="http://schemas.android.com/apk/res/android"'), 'Small XML must have android namespace')
assert(smallXml.includes('@+id/widget_root'), 'Small layout must have widget_root')
assert(smallXml.includes('@+id/layout_content'), 'Small layout must have layout_content')
assert(smallXml.includes('@+id/layout_uninitialized'), 'Small layout must have layout_uninitialized')
assert(smallXml.includes('@+id/layout_balance'), 'Small layout must have layout_balance')
assert(smallXml.includes('@+id/text_total_balance'), 'Small layout must have text_total_balance')
assert(smallXml.includes('@+id/text_last_updated'), 'Small layout must have text_last_updated')

// ── Test 6: Medium Layout XML (widget_medium.xml) ────────────────────────────
console.log('\n▶ Test Group 6: Medium Layout XML Verification...')
const mediumXmlPath = path.join(rootDir, 'android/app/src/main/res/layout/widget_medium.xml')
assert(fs.existsSync(mediumXmlPath), 'widget_medium.xml must exist')

const mediumXml = fs.readFileSync(mediumXmlPath, 'utf8')
assert(mediumXml.includes('@+id/layout_content'), 'Medium layout must have layout_content')
assert(mediumXml.includes('@+id/layout_uninitialized'), 'Medium layout must have layout_uninitialized')
assert(mediumXml.includes('@+id/layout_balance'), 'Medium layout must have layout_balance for Saldo Total')
assert(mediumXml.includes('@+id/text_total_balance'), 'Medium layout must have text_total_balance')
assert(mediumXml.includes('@+id/layout_expense'), 'Medium layout must have layout_expense for Pengeluaran Bulan Ini')
assert(mediumXml.includes('@+id/text_monthly_expense'), 'Medium layout must have text_monthly_expense')
assert(mediumXml.includes('@+id/text_monthly_tx_count'), 'Medium layout must have text_monthly_tx_count')
assert(mediumXml.includes('@+id/btn_quick_add'), 'Medium layout must have btn_quick_add for fast logging')

// ── Test 7: Large Layout XML (widget_large.xml) ──────────────────────────────
console.log('\n▶ Test Group 7: Large Layout XML Verification...')
const largeXmlPath = path.join(rootDir, 'android/app/src/main/res/layout/widget_large.xml')
assert(fs.existsSync(largeXmlPath), 'widget_large.xml must exist')

const largeXml = fs.readFileSync(largeXmlPath, 'utf8')
assert(largeXml.includes('@+id/layout_content'), 'Large layout must have layout_content')
assert(largeXml.includes('@+id/layout_uninitialized'), 'Large layout must have layout_uninitialized')
assert(largeXml.includes('@+id/text_total_balance'), 'Large layout must have text_total_balance')
assert(largeXml.includes('@+id/text_monthly_expense'), 'Large layout must have text_monthly_expense')
assert(largeXml.includes('@+id/layout_bill_alert'), 'Large layout must have layout_bill_alert for nearest bill')
assert(largeXml.includes('@+id/text_bill_badge'), 'Large layout must have text_bill_badge')
assert(largeXml.includes('@+id/text_bill_info'), 'Large layout must have text_bill_info')
assert(largeXml.includes('@+id/text_bill_date'), 'Large layout must have text_bill_date')
assert(largeXml.includes('@+id/layout_recent_section'), 'Large layout must have layout_recent_section')
assert(largeXml.includes('@+id/layout_tx_1') && largeXml.includes('@+id/text_tx_desc_1') && largeXml.includes('@+id/text_tx_amount_1'), 'Large layout must have row 1')
assert(largeXml.includes('@+id/layout_tx_2') && largeXml.includes('@+id/text_tx_desc_2') && largeXml.includes('@+id/text_tx_amount_2'), 'Large layout must have row 2')
assert(largeXml.includes('@+id/layout_tx_3') && largeXml.includes('@+id/text_tx_desc_3') && largeXml.includes('@+id/text_tx_amount_3'), 'Large layout must have row 3')
assert(largeXml.includes('@+id/text_tx_empty'), 'Large layout must have text_tx_empty')

// ── Test 8: Drawables & Colors Resources ─────────────────────────────────────
console.log('\n▶ Test Group 8: Drawable and Color Resources...')
const colorsPath = path.join(rootDir, 'android/app/src/main/res/values/colors.xml')
assert(fs.existsSync(colorsPath), 'colors.xml must exist')

const drawables = [
  'widget_background.xml',
  'widget_card_bg.xml',
  'widget_btn_quick_add.xml',
  'widget_item_bg.xml',
  'widget_bill_badge_bg.xml',
  'widget_overdue_badge_bg.xml',
]
for (const draw of drawables) {
  const drawPath = path.join(rootDir, 'android/app/src/main/res/drawable', draw)
  assert(fs.existsSync(drawPath), `Drawable ${draw} must exist`)
  const content = fs.readFileSync(drawPath, 'utf8')
  assert(content.includes('xmlns:android="http://schemas.android.com/apk/res/android"'), `${draw} must have valid XML namespace`)
}

// ── Test 9: MainActivity Deep Link Reception ─────────────────────────────────
console.log('\n▶ Test Group 9: MainActivity Deep Link Reception...')
const mainActivityPath = path.join(rootDir, 'android/app/src/main/java/com/sakukilat/app/MainActivity.java')
const mainActivityCode = fs.readFileSync(mainActivityPath, 'utf8')
assert(mainActivityCode.includes('handleDeepLink'), 'MainActivity must implement handleDeepLink')
assert(mainActivityCode.includes('onNewIntent'), 'MainActivity must implement onNewIntent')
assert(mainActivityCode.includes('"sakukilat".equalsIgnoreCase(uri.getScheme())'), 'MainActivity must parse sakukilat scheme')
assert(mainActivityCode.includes('sakukilat:navigate'), 'MainActivity must dispatch sakukilat:navigate custom event')

console.log('====================================================')
console.log('  ALL TASK 8.3 APPWIDGET PROVIDER TESTS PASSED! ✅  ')
console.log('====================================================\n')
