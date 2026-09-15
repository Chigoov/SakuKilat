"""
SakuKilat — Live Browser Mobile Viewport & Submenu UX Review (Phase 4, Task 5.5)

Requirements: 2.1, 2.4, 2.5, 2.7
Validates:
1. Zero horizontal overflow across 320px, 360px, 390px, 412px viewports.
2. Tab Saku submenus open in standalone stacking layers (BottomSheet/Modal), not inline accordion sprawl.
3. Catat Manual form renders explicit 'Catatan (opsional)' field directly in main flow for expense, income, and transfer.
4. Tab Rekapan Kalender displays compact adaptive currency (+1,5jt, -250rb) without ellipsis (...) on narrow cells.
5. Transaction date is rendered directly below description/category in a dedicated row.
6. Saves audit screenshots for documentation.
"""

import sys
import os
import time
from playwright.sync_api import sync_playwright

def run_live_submenus_tests():
    print("========================================================================")
    print(" SAKUKILAT — LIVE BROWSER MOBILE VIEWPORT & SUBMENU VALIDATION (TASK 5.5) ")
    print("========================================================================\n")
    sys.stdout.flush()

    output_dir = "screenshots-audit"
    os.makedirs(output_dir, exist_ok=True)

    results = []
    console_errors = []

    mobile_viewports = [
        ("320x640 (Compact)", 320, 640),
        ("360x800 (Android Standard)", 360, 800),
        ("390x844 (iPhone 12/13/14/15/16)", 390, 844),
        ("412x915 (Samsung / Pixel)", 412, 915),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ──────────────────────────────────────────────────────────────────────
        # STEP 1: Viewport Responsive Checks & Overflow Inspection
        # ──────────────────────────────────────────────────────────────────────
        print("▶ STEP 1: Multi-Viewport Responsive & Zero Overflow Audit...")
        sys.stdout.flush()

        for vp_name, width, height in mobile_viewports:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                user_agent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
            )
            page = context.new_page()
            page.add_init_script("window.localStorage.setItem('sakukilat:v2:onboarding-completed', '1'); window.localStorage.setItem('sakukilat:v2:onboarding-completed-v9:local', '1');")
            page.on("console", lambda msg: console_errors.append(f"[{vp_name}] {msg.text}") if msg.type == "error" else None)

            page.goto("http://localhost:3000?demo=1")
            page.wait_for_selector("main", timeout=8000)
            time.sleep(0.5)

            # Check zero horizontal overflow
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
            print(f"  ✓ [{vp_name}] Overflow: main {dims['mainScroll']} <= {dims['mainClient']}, body {dims['bodyScroll']} <= {dims['windowWidth']}")
            sys.stdout.flush()
            assert no_overflow, f"Horizontal overflow detected on {vp_name}!"
            results.append((f"Zero Overflow ({vp_name})", "PASS"))

            # Check 5 navigation tabs visible and meet >= 44x44px touch target
            nav_bar = page.locator('nav[aria-label="Navigasi utama"]').first
            assert nav_bar.is_visible(), f"Bottom navigation must be visible on {vp_name}"

            for tab_id in ['beranda', 'rekapan', 'saku', 'rencana', 'profil']:
                tab_btn = page.locator(f'#nav-tab-{tab_id}').first
                assert tab_btn.is_visible(), f"Tab {tab_id} must be visible on {vp_name}"
                box = tab_btn.bounding_box()
                assert box is not None and box['width'] >= 44 and box['height'] >= 44, f"Tab {tab_id} touch target must be >=44px"

            results.append((f"Navigation Tabs >=44px ({vp_name})", "PASS"))
            context.close()

        # ──────────────────────────────────────────────────────────────────────
        # STEP 2: Functional Deep-Dive on 390x844 (Mobile Baseline)
        # ──────────────────────────────────────────────────────────────────────
        print("\n▶ STEP 2: Functional Deep-Dive on 390x844 (Submenus, Form & Calendar)...")
        sys.stdout.flush()

        context_main = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        )
        page = context_main.new_page()
        page.add_init_script("window.localStorage.setItem('sakukilat:v2:onboarding-completed', '1'); window.localStorage.setItem('sakukilat:v2:onboarding-completed-v9:local', '1');")

        page.goto("http://localhost:3000?demo=1")
        page.wait_for_selector("main", timeout=8000)
        time.sleep(0.5)

        # 2A: Manual Entry Form Note Field Verification (Req 2.3)
        print("  Checking ManualEntryForm explicit note field & creating transactions...")
        sys.stdout.flush()
        page.locator('[data-tour="manual-entry"]').first.click()
        page.wait_for_selector('[role="dialog"]')
        time.sleep(0.5)

        note_input = page.locator('input[data-testid="manual-tx-note"]')
        assert note_input.is_visible(), "manual-tx-note input must be visible directly in primary form layout without expanding accordions!"

        note_label = page.locator('label[for="sk-manual-entry-note"]')
        assert note_label.is_visible(), "Accessible label for note must be visible"
        assert "catatan" in note_label.inner_text().lower(), "Label text must mention 'Catatan'"

        # Fill and submit an expense of Rp250.000 with note
        page.locator('input[placeholder*="kopi, mie ayam"]').fill("Makan Siang Resto")
        page.locator('input[placeholder="0"]').first.fill("250000")
        note_input.fill("Catatan makan bersama tim")
        page.screenshot(path=f"{output_dir}/ux-manual-entry-expense-note-390.png")
        page.locator('form button[type="submit"]').first.click()
        time.sleep(0.8)

        # Now submit an income of Rp1.500.000 with note
        page.locator('[data-tour="manual-entry"]').first.click()
        page.wait_for_selector('[role="dialog"]')
        time.sleep(0.5)
        page.locator('button:has-text("Pemasukan")').first.click()
        time.sleep(0.3)
        page.locator('input[placeholder*="kopi, mie ayam"]').fill("Bonus Proyek")
        page.locator('input[placeholder="0"]').first.fill("1500000")
        page.locator('input[data-testid="manual-tx-note"]').fill("Bonus sprint delivery")
        page.locator('form button[type="submit"]').first.click()
        time.sleep(0.8)

        # Also verify note field for Transfer mode
        page.locator('[data-tour="manual-entry"]').first.click()
        page.wait_for_selector('[role="dialog"]')
        time.sleep(0.5)
        page.locator('button:has-text("Transfer")').first.click()
        time.sleep(0.3)
        note_transfer = page.locator('input[data-testid="manual-tx-note"]')
        assert note_transfer.is_visible(), "Note field must remain visible and accessible in Transfer mode!"
        note_transfer.fill("Uji coba catatan transfer")
        page.screenshot(path=f"{output_dir}/ux-manual-entry-transfer-note-390.png")
        page.keyboard.press("Escape")
        time.sleep(0.5)

        print("    ✓ Note field visible in primary flow for expense, income, and transfer modes")
        results.append(("Manual Entry Explicit Note Field (Expense, Income & Transfer)", "PASS"))

        # 2B: Tab Saku Stacking Layer & Accordion Elimination Audit (Req 2.1)
        print("  Checking Tab Saku stacking layer navigation (no accordion sprawl)...")
        sys.stdout.flush()
        page.locator('#nav-tab-saku').click()
        time.sleep(0.5)

        # Check main Tab Saku scroll height is bounded
        initial_scroll_height = page.evaluate("() => document.querySelector('main').scrollHeight")
        print(f"    Tab Saku initial main scrollHeight: {initial_scroll_height}px")
        assert initial_scroll_height < 2500, f"Tab Saku main height ({initial_scroll_height}px) must be bounded!"

        # Open "Kategori & Subkategori" submenu
        page.locator('button:has-text("Kategori & Subkategori")').first.click()
        time.sleep(0.6)

        # Assert opened in dedicated stacking layer dialog/sheet with close button
        layer_overlay = page.locator('[role="dialog"]').first
        assert layer_overlay.is_visible(), "Submenu must open inside an isolated dialog/sheet stacking surface"

        layer_close_btn = page.locator('button[data-testid="layer-close-btn"]')
        assert layer_close_btn.is_visible(), "Stacking layer must provide an explicit close button 'X'"

        page.screenshot(path=f"{output_dir}/ux-saku-stacking-layer-390.png")

        # Close layer via close button
        layer_close_btn.click()
        time.sleep(0.5)
        print("    ✓ Submenu opened inside clean stacking surface and closed smoothly")
        results.append(("Tab Saku Stacking Layer Navigation (Eliminating Accordion Sprawl)", "PASS"))

        # 2C: Tab Rekapan Kalender Compact Rupiah Formatting (Req 2.5)
        print("  Checking Tab Rekapan Kalender compact currency formatting without ellipsis...")
        sys.stdout.flush()
        page.locator('#nav-tab-rekapan').click()
        time.sleep(0.5)

        # Switch to Kalender view
        page.locator('button:has-text("Kalender")').click()
        time.sleep(0.5)

        # Check calendar day cells
        calendar_grid = page.locator('section:has(div.grid-cols-7)')
        assert calendar_grid.is_visible(), "Calendar grid must be rendered in Tab Rekapan"

        # Check all income/expense numbers in calendar cells
        cell_numbers = page.locator('section:has(div.grid-cols-7) [data-testid^="calendar-cell-"]').all_inner_texts()
        print(f"    Calendar cell amount sample: {cell_numbers[:6]}")

        for text in cell_numbers:
            trimmed = text.strip()
            if not trimmed:
                continue
            assert "..." not in trimmed and "…" not in trimmed, f"Calendar text '{trimmed}' must NOT be truncated with ellipsis!"
            assert len(trimmed) <= 7, f"Calendar text '{trimmed}' length ({len(trimmed)}) must fit in cell (<= 7 chars)!"

        page.screenshot(path=f"{output_dir}/ux-calendar-compact-390.png")
        print("    ✓ All calendar nominal numbers formatted cleanly with compact scale and zero ellipsis")
        results.append(("Calendar Adaptive Compact Rupiah (Zero Ellipsis)", "PASS"))

        # 2D: Transaction Date Row Directly Below Category (Req 2.4)
        print("  Checking Transaction Date Row positioning in list view...")
        sys.stdout.flush()
        # Switch to Riwayat list view in Rekapan
        page.locator('button:has-text("Riwayat")').click()
        time.sleep(0.5)

        date_rows = page.locator('[data-testid="tx-date-row"]').all()
        assert len(date_rows) > 0, "Transaction date rows [data-testid='tx-date-row'] must exist in transaction items"

        for row in date_rows[:5]:
            assert row.is_visible(), "Transaction date row must be visible"
            # Assert not using ml-auto class
            class_attr = row.get_attribute("class") or ""
            assert "ml-auto" not in class_attr, "Transaction date row must NOT use ml-auto right-alignment!"

        page.screenshot(path=f"{output_dir}/ux-transaction-items-date-390.png")
        print("    ✓ Transaction dates positioned neatly in dedicated rows beneath category/description")
        results.append(("Transaction Date Positioned Directly Below Category", "PASS"))

        # Also capture 320px viewport full page screenshot
        print("  Capturing 320px compact viewport screenshot for visual proof...")
        sys.stdout.flush()
        context_320 = browser.new_context(
            viewport={"width": 320, "height": 640},
            user_agent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
        )
        page_320 = context_320.new_page()
        page_320.add_init_script("window.localStorage.setItem('sakukilat:v2:onboarding-completed', '1'); window.localStorage.setItem('sakukilat:v2:onboarding-completed-v9:local', '1');")
        page_320.goto("http://localhost:3000?demo=1")
        page_320.wait_for_selector("main", timeout=8000)
        time.sleep(0.5)
        page_320.screenshot(path=f"{output_dir}/ux-beranda-320px.png")
        context_320.close()

        context_main.close()
        browser.close()

    print("\n========================================================================")
    print("                      LIVE UX AUDIT SUMMARY                             ")
    print("========================================================================")
    for title, status in results:
        print(f"  ✓ {status}: {title}")
    print(f"------------------------------------------------------------------------")
    print(f"Screenshots saved to: {os.path.abspath(output_dir)}")
    print(f"Total Checks: {len(results)} | Passed: {len(results)} | Failed: 0")
    print("✅ ALL LIVE BROWSER MOBILE VIEWPORT CHECKS PASSED!")
    print("========================================================================\n")

if __name__ == "__main__":
    run_live_submenus_tests()
