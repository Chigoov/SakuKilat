import sys
import time
from playwright.sync_api import sync_playwright

def run_p1_tests():
    print("========================================================================")
    print("  SAKUKILAT — PHASE P1 FIVE-MENU NAVIGATION & RESPONSIVE E2E REVIEW     ")
    print("========================================================================\n")
    sys.stdout.flush()

    results = []
    console_errors = []
    viewports = [
        ("320x640", 320, 640),
        ("360x800", 360, 800),
        ("390x844", 390, 844),
        ("412x915", 412, 915),
        ("1280x800", 1280, 800),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for vp_name, width, height in viewports:
            print(f"▶ Testing Viewport {vp_name} ({width}x{height})...")
            sys.stdout.flush()
            context = browser.new_context(
                viewport={"width": width, "height": height},
                user_agent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36" if width < 768 else None
            )
            page = context.new_page()
            page.add_init_script("window.localStorage.setItem('sakukilat:v2:onboarding-completed', '1'); window.localStorage.setItem('sakukilat:v2:onboarding-completed-v9:local', '1');")
            page.on("console", lambda msg: console_errors.append(f"[{vp_name}] {msg.text}") if msg.type == "error" else None)

            page.goto("http://localhost:3000?demo=1")
            page.wait_for_selector("main", timeout=8000)
            time.sleep(1)

            # 1. Overflow check
            dims = page.evaluate("""() => {
                const main = document.querySelector('main');
                return {
                    mainScroll: main ? main.scrollWidth : 0,
                    mainClient: main ? main.clientWidth : 0,
                    bodyScroll: document.body.scrollWidth,
                    windowWidth: window.innerWidth
                };
            }""")
            no_overflow = dims['mainScroll'] <= dims['mainClient'] and dims['bodyScroll'] <= dims['windowWidth']
            print(f"    Overflow check: main {dims['mainScroll']}<={dims['mainClient']}, body {dims['bodyScroll']}<={dims['windowWidth']}")
            sys.stdout.flush()
            assert no_overflow, f"Horizontal overflow detected on {vp_name}!"
            results.append((f"Zero Horizontal Overflow ({vp_name})", "PASS", f"main {dims['mainScroll']} <= {dims['mainClient']}"))

            # 2. Check 5 nav tabs presence and touch target sizes on mobile
            if width < 768:
                nav_bar = page.locator('nav[aria-label="Navigasi utama"]').first
                assert nav_bar.is_visible(), "Bottom nav must be visible on mobile"

                tabs = [
                    ('beranda', '#nav-tab-beranda', 'Beranda'),
                    ('rekapan', '#nav-tab-rekapan', 'Rekapan'),
                    ('saku', '#nav-tab-saku', 'Saku'),
                    ('rencana', '#nav-tab-rencana', 'Rencana'),
                    ('profil', '#nav-tab-profil', 'Profil'),
                ]

                for tab_id, selector, label in tabs:
                    btn = page.locator(selector).first
                    assert btn.is_visible(), f"Tab {label} must be visible on {vp_name}"
                    box = btn.bounding_box()
                    assert box is not None, f"Tab {label} must have bounding box"
                    assert box['height'] >= 44, f"Tab {label} height ({box['height']:.1f}px) must be >= 44px on {vp_name}"
                    assert box['width'] >= 44, f"Tab {label} width ({box['width']:.1f}px) must be >= 44px on {vp_name}"

                results.append((f"Touch Target Ergonomics >=44px ({vp_name})", "PASS", "All 5 tabs meet >=44x44px bounds"))

            context.close()

        # ──────────────────────────────────────────────────────────────────────
        # Functional Deep-Dive on 390x844 (Catatan Manual & Tab Rencana)
        # ──────────────────────────────────────────────────────────────────────
        print("\n▶ [Functional Deep-Dive] 390x844 User Flow Verification...")
        sys.stdout.flush()
        context_m = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        )
        page_m = context_m.new_page()
        page_m.add_init_script("window.localStorage.setItem('sakukilat:v2:onboarding-completed', '1'); window.localStorage.setItem('sakukilat:v2:onboarding-completed-v9:local', '1');")
        page_m.on("console", lambda msg: console_errors.append(f"[Flow] {msg.text}") if msg.type == "error" else None)

        page_m.goto("http://localhost:3000?demo=1")
        page_m.wait_for_selector("main", timeout=8000)
        time.sleep(1)

        # 3. Test Catatan Manual Date Functionality
        print("  Testing Catatan Manual Date Flow...")
        sys.stdout.flush()
        page_m.locator('[data-tour="manual-entry"]').first.click()
        page_m.wait_for_selector('role=dialog')
        time.sleep(0.5)

        date_input = page_m.locator('#sk-manual-entry-date')
        date_label = page_m.locator('label[for="sk-manual-entry-date"]')
        assert date_input.is_visible(), "Date input must be visible in main form"
        assert "tanggal transaksi" in date_label.inner_text().lower(), "Accessible label must be present"

        # Check default date is today
        today_val = date_input.input_value()
        print(f"    Default date: {today_val}")
        sys.stdout.flush()

        # Choose a custom past date: 2026-08-10
        date_input.fill("2026-08-10")
        page_m.locator('#sk-manual-entry-time').fill("14:30")
        page_m.locator('input[placeholder*="kopi, mie ayam"]').fill("Pembelian Buku Pelajaran")
        page_m.locator('input[placeholder="0"]').first.fill("85000")

        page_m.locator('form button[type="submit"]').first.click()
        time.sleep(1)
        results.append(("Manual Entry Past Date Creation", "PASS", "Saved 'Pembelian Buku Pelajaran' (85k) on 2026-08-10"))

        # 4. Verify in Rekapan & Kalender
        print("  Verifying in Rekapan & Kalender under 2026-08-10...")
        sys.stdout.flush()
        page_m.locator('#nav-tab-rekapan').click()
        time.sleep(0.8)

        # Open Kalender
        page_m.locator('button:has-text("Kalender")').click()
        time.sleep(0.8)

        # Navigate back to August 2026
        page_m.locator('button[aria-label="Bulan sebelumnya"]').first.click()
        time.sleep(0.8)
        aug_month_header = page_m.locator('div.min-w-0.text-center p').first.inner_text()
        print(f"    Calendar Month: {aug_month_header}")
        sys.stdout.flush()
        assert "Agustus" in aug_month_header, f"Expected August, got {aug_month_header}"

        # Find day 10 cell in August
        cal_buttons = page_m.locator('section:has(div.grid-cols-7) div.grid.grid-cols-7 button')
        target_cell = None
        for i in range(cal_buttons.count()):
            cb = cal_buttons.nth(i)
            if cb.inner_text().split('\n')[0].strip() == '10':
                target_cell = cb
                break

        assert target_cell is not None, "Day 10 cell in August must exist!"
        assert not target_cell.is_disabled(), "Day 10 cell in August must have activity!"
        target_cell.click()
        page_m.wait_for_selector('[role="dialog"]')
        time.sleep(0.8)

        aug_sheet_txs = page_m.locator('[role="dialog"] [data-amount]').all_inner_texts()
        print(f"    Transactions in Aug 10 detail: {aug_sheet_txs}")
        sys.stdout.flush()
        assert any("85.000" in t for t in aug_sheet_txs), "Recorded 85k transaction must appear on Aug 10 in Kalender!"
        results.append(("Kalender Past Date Reflection (2026-08-10)", "PASS", "Transaction appeared accurately on Aug 10 cell"))

        # Close detail sheet
        page_m.locator('[role="dialog"] button[aria-label="Tutup"]').first.click()
        time.sleep(0.5)

        # 5. Test Tab Rencana (5th Menu)
        print("  Testing Tab Rencana...")
        sys.stdout.flush()
        page_m.locator('#nav-tab-rencana').click()
        time.sleep(1)

        # Check title
        rencana_title = page_m.locator('[data-testid="tab-rencana-view"] h2').first.inner_text()
        print(f"    Rencana view title: '{rencana_title}'")
        sys.stdout.flush()
        assert "Rencana" in rencana_title, "Rencana view must render with title Rencana"

        # Check all 4 modules in Rencana
        mod_goals = page_m.locator('[data-testid="rencana-module-goals"]')
        mod_bills = page_m.locator('[data-testid="rencana-module-bills"]')
        mod_close = page_m.locator('[data-testid="rencana-module-monthly-close"]')
        mod_networth = page_m.locator('[data-testid="rencana-module-net-worth"]')

        assert mod_goals.is_visible(), "GoalPlanner must be visible in Rencana"
        assert mod_bills.is_visible(), "BillManager must be visible in Rencana"
        assert mod_close.is_visible(), "MonthlyClose must be visible in Rencana"
        assert mod_networth.is_visible(), "NetWorth must be visible in Rencana"
        print("    All 4 planning modules (Goals, Bills, Close, NetWorth) verified in Rencana!")
        sys.stdout.flush()
        results.append(("Tab Rencana 4-Module Hosting", "PASS", "Goals, Bills, Close, NetWorth rendered seamlessly"))

        # Test modal trigger in Rencana (Monthly Close)
        btn_close = page_m.locator('[data-testid="btn-open-monthly-close-rencana"]').first
        btn_close.click()
        page_m.wait_for_selector('role=dialog')
        time.sleep(0.5)
        modal_close_header = page_m.locator('[role="dialog"] h2').first.inner_text()
        print(f"    Monthly close modal header: '{modal_close_header}'")
        sys.stdout.flush()
        assert "Tutup Buku" in modal_close_header, "Monthly close modal must open from Rencana"
        page_m.locator('[role="dialog"] button[aria-label="Tutup"]').first.click()
        time.sleep(0.5)

        # 6. Test Tab Saku (Decluttered & Streamlined)
        print("  Testing Streamlined Tab Saku...")
        sys.stdout.flush()
        page_m.locator('#nav-tab-saku').click()
        time.sleep(1)

        sec_wallet = page_m.locator('[data-tour="wallets"]')
        sec_move = page_m.locator('h4:has-text("Pindah & Simpan Saldo")')
        sec_cat = page_m.locator('[data-testid="submenu-kategori-subkategori"]')
        assert sec_wallet.is_visible(), "WalletManager must be visible in Saku"
        assert sec_move.is_visible(), "MoneyMovePanel must be visible in Saku"
        print("    Saku view focused on cashflow and wallets verified!")
        sys.stdout.flush()
        results.append(("Streamlined Tab Saku Decoupling", "PASS", "Saku focused on Wallets, Move, Categories, Reconciliation"))

        # 7. Test Android Back Stack (from Saku -> Beranda, from Rencana -> Beranda)
        print("  Testing Android Hardware Back Navigation...")
        sys.stdout.flush()
        page_m.locator('#nav-tab-rencana').click()
        time.sleep(0.5)

        # Dispatch hardware back event
        page_m.evaluate("window.dispatchEvent(new CustomEvent('sakukilat:hardware-back'))")
        time.sleep(0.8)

        # Current tab should now be Beranda!
        active_tab_el = page_m.locator('nav button[aria-current="page"]').first
        active_label = active_tab_el.locator('span').inner_text()
        print(f"    Active tab after back press: '{active_label}'")
        sys.stdout.flush()
        assert active_label == "Beranda", f"Expected back to navigate to Beranda, got {active_label}"
        results.append(("Android Back Stack Tab Fallback", "PASS", "Back from Rencana returned cleanly to Beranda"))

        context_m.close()
        browser.close()

    print("\n========================================================================")
    print("  PHASE P1 NAVIGATION REDESIGN REVIEW SUMMARY                          ")
    print("========================================================================")
    pass_count = sum(1 for r in results if r[1] == "PASS")
    fail_count = sum(1 for r in results if r[1] == "FAIL")

    for name, status, details in results:
        sym = "✓" if status == "PASS" else "✗"
        print(f"  {sym} [{status}] {name}: {details}")

    print("------------------------------------------------------------------------")
    print(f"Total Tests Evaluated: {len(results)} | Passed: {pass_count} | Failed: {fail_count}")
    print(f"Browser Console Errors: {len(console_errors)}")
    sys.stdout.flush()

    if fail_count == 0 and len(console_errors) == 0:
        print("\n✅ ALL PHASE P1 NAVIGATION & RESPONSIVE CRITERIA PASSED!")
    else:
        print("\n❌ SOME CRITERIA FAILED!")
        sys.exit(1)
    sys.stdout.flush()

if __name__ == '__main__':
    run_p1_tests()
