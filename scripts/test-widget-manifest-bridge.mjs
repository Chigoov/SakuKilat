/**
 * SakuKilat — Integration & Verification: Android Manifest, Widget Info XML,
 * Capacitor Plugin Bridge & Preferences Write Integration (Task 8.5)
 * -------------------------------------------------------------------------
 * Verifies:
 * 1. AndroidManifest.xml receiver configuration, intent filters, meta-data, and deep link schemes
 * 2. widget_info.xml dimensions, resize modes, preview image, category, and initial layout
 * 3. strings.xml widget_name and widget_description entries
 * 4. SakuKilatWidgetPlugin.java and MainActivity.java Capacitor plugin registration
 * 5. Snapshot write integration with @capacitor/preferences
 *
 * Requirements: 4.1, 4.2, 4.6
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Preferences } from '@capacitor/preferences'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('====================================================')
console.log(' SAKUKILAT — TASK 8.5: MANIFEST, WIDGET INFO &     ')
console.log('          CAPACITOR BRIDGE INTEGRATION TEST         ')
console.log('====================================================\n')

// Mock window and localStorage for Node environment if not present
if (typeof globalThis.window === 'undefined') {
  const store = new Map()
  const dispatchedEvents = []
  globalThis.window = {
    location: {
      search: '',
      hash: '',
      pathname: '/',
    },
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      get length() {
        return store.size
      },
      key: (i) => Array.from(store.keys())[i] ?? null,
    },
    dispatchEvent: (e) => {
      dispatchedEvents.push(e)
      return true
    },
    SakuKilatAndroid: {
      notifyWidgetUpdate: () => {
        globalThis.__widgetUpdatedViaInterface = true
      },
    },
  }
  globalThis.__dispatchedEvents = dispatchedEvents
}

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, detail) {
      this.type = type
      this.detail = detail
    }
  }
}

// ── Test 1: AndroidManifest.xml Receiver & Intent Filters (Req 4.1, 4.2) ────
console.log('▶ Test 1: AndroidManifest.xml Receiver & Deep Link Configuration...')
const manifestPath = path.join(rootDir, 'android/app/src/main/AndroidManifest.xml')
assert.ok(fs.existsSync(manifestPath), 'AndroidManifest.xml must exist')

const manifestContent = fs.readFileSync(manifestPath, 'utf8')

// Verify receiver is registered
assert.ok(
  manifestContent.includes('.widget.SakuKilatAppWidgetProvider') ||
  manifestContent.includes('com.sakukilat.app.widget.SakuKilatAppWidgetProvider'),
  'Receiver for SakuKilatAppWidgetProvider must be declared in AndroidManifest.xml'
)
assert.ok(
  manifestContent.includes('android:exported="true"'),
  'AppWidget receiver must be exported for system Launcher interaction'
)
assert.ok(
  manifestContent.includes('android.appwidget.action.APPWIDGET_UPDATE'),
  'Receiver must listen to android.appwidget.action.APPWIDGET_UPDATE'
)
assert.ok(
  manifestContent.includes('com.sakukilat.app.widget.UPDATE_WIDGET'),
  'Receiver must listen to com.sakukilat.app.widget.UPDATE_WIDGET broadcast action'
)
assert.ok(
  manifestContent.includes('android:name="android.appwidget.provider"'),
  'Receiver must contain meta-data android:name="android.appwidget.provider"'
)
assert.ok(
  manifestContent.includes('android:resource="@xml/widget_info"'),
  'Receiver meta-data must reference @xml/widget_info'
)

// Verify deep link intent-filter for sakukilat://
assert.ok(
  manifestContent.includes('android:scheme="sakukilat"'),
  'MainActivity must declare an intent-filter supporting android:scheme="sakukilat"'
)
console.log('  ✓ AndroidManifest.xml correctly registers SakuKilatAppWidgetProvider, update actions, and sakukilat:// deep link\n')

// ── Test 2: widget_info.xml Metadata & Dimensions (Req 4.6) ──────────────────
console.log('▶ Test 2: widget_info.xml Metadata & Responsive Dimensions...')
const widgetInfoPath = path.join(rootDir, 'android/app/src/main/res/xml/widget_info.xml')
assert.ok(fs.existsSync(widgetInfoPath), 'widget_info.xml must exist')

const widgetInfoContent = fs.readFileSync(widgetInfoPath, 'utf8')
assert.ok(widgetInfoContent.includes('<appwidget-provider'), 'Must contain <appwidget-provider> root tag')
assert.ok(widgetInfoContent.includes('android:minWidth="140dp"'), 'Must define minWidth="140dp"')
assert.ok(widgetInfoContent.includes('android:minHeight="70dp"'), 'Must define minHeight="70dp"')
assert.ok(widgetInfoContent.includes('android:minResizeWidth="110dp"'), 'Must define minResizeWidth for small resizing')
assert.ok(widgetInfoContent.includes('android:minResizeHeight="60dp"'), 'Must define minResizeHeight')
assert.ok(
  widgetInfoContent.includes('android:resizeMode="horizontal|vertical"'),
  'Must support both horizontal and vertical resizing modes'
)
assert.ok(
  widgetInfoContent.includes('android:initialLayout="@layout/widget_medium"'),
  'Must designate initialLayout as widget_medium'
)
assert.ok(
  widgetInfoContent.includes('android:previewImage="@mipmap/ic_launcher"'),
  'Must configure previewImage launcher resource'
)
assert.ok(
  widgetInfoContent.includes('android:widgetCategory="home_screen"'),
  'Must set widgetCategory="home_screen"'
)
assert.ok(
  widgetInfoContent.includes('android:description="@string/widget_description"'),
  'Must reference widget_description in widget metadata'
)
console.log('  ✓ widget_info.xml contains complete specifications for dimensions, preview, and resize modes\n')

// ── Test 3: strings.xml Widget Resources ─────────────────────────────────────
console.log('▶ Test 3: strings.xml Widget Localization Entries...')
const stringsPath = path.join(rootDir, 'android/app/src/main/res/values/strings.xml')
assert.ok(fs.existsSync(stringsPath), 'strings.xml must exist')

const stringsContent = fs.readFileSync(stringsPath, 'utf8')
assert.ok(stringsContent.includes('name="widget_name"'), 'strings.xml must include widget_name')
assert.ok(stringsContent.includes('name="widget_description"'), 'strings.xml must include widget_description')
console.log('  ✓ strings.xml defines widget_name and widget_description\n')

// ── Test 4: SakuKilatWidgetPlugin & MainActivity Bridge Registration ────────
console.log('▶ Test 4: SakuKilatWidgetPlugin & MainActivity Bridge Registration...')
const pluginPath = path.join(
  rootDir,
  'android/app/src/main/java/com/sakukilat/app/widget/SakuKilatWidgetPlugin.java'
)
assert.ok(fs.existsSync(pluginPath), 'SakuKilatWidgetPlugin.java must exist')

const pluginContent = fs.readFileSync(pluginPath, 'utf8')
assert.ok(
  pluginContent.includes('@CapacitorPlugin(name = "SakuKilatWidget")'),
  'Must declare @CapacitorPlugin(name = "SakuKilatWidget")'
)
assert.ok(
  pluginContent.includes('public class SakuKilatWidgetPlugin extends Plugin'),
  'Must extend Capacitor Plugin'
)
assert.ok(
  pluginContent.includes('public void notifyUpdate(PluginCall call)'),
  'Must expose notifyUpdate plugin method'
)
assert.ok(
  pluginContent.includes('SakuKilatAppWidgetProvider.ACTION_UPDATE_WIDGET'),
  'Plugin notifyUpdate must broadcast ACTION_UPDATE_WIDGET'
)

const mainActivityPath = path.join(rootDir, 'android/app/src/main/java/com/sakukilat/app/MainActivity.java')
const mainActivityContent = fs.readFileSync(mainActivityPath, 'utf8')
assert.ok(
  mainActivityContent.includes('registerPlugin(SakuKilatWidgetPlugin.class)'),
  'MainActivity must register SakuKilatWidgetPlugin'
)
console.log('  ✓ SakuKilatWidgetPlugin created and registered in MainActivity\n')

// ── Test 5: Snapshot Write Integration with @capacitor/preferences ───────────
console.log('▶ Test 5: Snapshot Write Integration with @capacitor/preferences...')

const {
  generateWidgetSnapshot,
  serializeWidgetSnapshot,
  parseWidgetSnapshot,
  syncWidgetSnapshot,
  loadWidgetSnapshot,
  WIDGET_SNAPSHOT_KEY,
} = await import('../lib/widget-snapshot.ts')

// 5a. Direct Preferences write & read
const sampleWallets = [
  { id: 'bca', label: 'BCA', balance: 7_500_000, lastReconciledAt: '2026-09-01' },
  { id: 'cash', label: 'Dompet', balance: 350_000 },
]
const sampleTxs = [
  { id: 'tx1', description: 'Makan Malam', amount: 45_000, type: 'expense', date: new Date() },
  { id: 'tx2', description: 'Gaji Bulanan', amount: 10_000_000, type: 'income', date: new Date() },
]

const generated = generateWidgetSnapshot({
  wallets: sampleWallets,
  transactions: sampleTxs,
})

const jsonStr = serializeWidgetSnapshot(generated)

// Write to @capacitor/preferences directly
await Preferences.set({
  key: WIDGET_SNAPSHOT_KEY,
  value: jsonStr,
})

// Read back from @capacitor/preferences
const prefResult = await Preferences.get({ key: WIDGET_SNAPSHOT_KEY })
assert.equal(prefResult.value, jsonStr, 'Preferences value must exactly match written JSON')

const deserialized = parseWidgetSnapshot(prefResult.value)
assert.ok(deserialized, 'Deserialized snapshot from Preferences must be valid')
assert.equal(deserialized.totalBalance, 7_850_000)
assert.equal(deserialized.monthlyExpense, 45_000)
assert.equal(deserialized.monthlyExpenseTxCount, 1)
assert.equal(deserialized.recentTransactions.length, 2)
assert.equal(deserialized.hasUnreconciledWallets, true)
console.log('  ✓ Direct @capacitor/preferences write and read round-trip verified')

// 5b. syncWidgetSnapshot and loadWidgetSnapshot end-to-end
const synced = await syncWidgetSnapshot({
  wallets: [{ id: 'w1', balance: 1_250_000 }],
  transactions: [{ id: 'tx-synced', description: 'Beli Buku', amount: 85_000, type: 'expense', date: new Date() }],
})
assert.equal(synced.totalBalance, 1_250_000)

const loaded = await loadWidgetSnapshot()
assert.ok(loaded, 'loadWidgetSnapshot must return the saved snapshot')
assert.equal(loaded.totalBalance, 1_250_000)
assert.equal(loaded.monthlyExpense, 85_000)
console.log('  ✓ syncWidgetSnapshot & loadWidgetSnapshot integrate cleanly with native storage')

// 5c. Broadcast trigger
assert.ok(
  globalThis.__widgetUpdatedViaInterface === true,
  'Widget update broadcast must trigger SakuKilatAndroid.notifyWidgetUpdate'
)
console.log('  ✓ Native widget update broadcast dispatched successfully\n')

console.log('====================================================')
console.log('  TASK 8.5 ALL INTEGRATION TESTS PASSED! ✅         ')
console.log('====================================================\n')
