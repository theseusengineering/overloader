#!/usr/bin/env python3
import os

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("OVERLOADER_BASE_URL", "http://127.0.0.1:8799")


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844}, accept_downloads=True)
        page.goto(BASE_URL)
        page.wait_for_selector("text=Start Workout", timeout=10000)

        run(results, "home Manage opens Templates", lambda: test_manage(page))
        run(results, "top data button opens data menu", lambda: test_data_menu(page))
        run(results, "template editor steppers stay open and save", lambda: test_template_editor(page))
        run(results, "template add exercise returns to draft editor", lambda: test_template_add_exercise(page))
        run(results, "exercise settings inputs stay open and save", lambda: test_exercise_settings(page))
        run(results, "data export downloads JSON", lambda: test_export(page))
        run(results, "active workout controls", lambda: test_active_workout(page))
        run(results, "mobile layout has no horizontal overflow", lambda: assert_no_overflow(page))

        browser.close()

    for status, name, detail in results:
        print(f"{status} {name}{': ' + detail if detail else ''}")

    failed = [item for item in results if item[0] == "FAIL"]
    if failed:
        raise SystemExit(1)


def run(results, name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
    except Exception as error:
        results.append(("FAIL", name, str(error)))


def test_manage(page):
    page.locator("[data-action=close-modal]").click(timeout=1000) if page.locator("[data-action=close-modal]").count() else None
    page.locator("[data-view=workout]").last.click()
    page.wait_for_selector("text=Start Workout")
    page.get_by_role("button", name="Manage").click()
    expect(page.locator("h1").filter(has_text="Templates")).to_be_visible()


def test_data_menu(page):
    page.locator("[data-view=workout]").last.click()
    page.locator("[data-action=open-data-menu]").click()
    expect(page.locator("text=Data")).to_be_visible()
    page.get_by_role("button", name="Open data screen").click()
    expect(page.locator("h1").filter(has_text="Data")).to_be_visible()


def test_template_editor(page):
    page.locator("[data-view=templates]").last.click()
    page.locator("[data-action=edit-template][data-template-id=pull-balmain]").click()
    page.wait_for_selector("text=Edit Template")
    set_input = page.locator("[data-field=template-working]").first
    before = int(set_input.input_value())
    set_input.press("ArrowUp")
    page.wait_for_timeout(100)
    assert page.locator("text=Edit Template").count() == 1
    assert int(set_input.input_value()) == before + 1
    page.locator("[data-action=save-template-editor]").click()
    page.wait_for_selector("text=Template saved")
    page.locator("[data-action=edit-template][data-template-id=pull-balmain]").click()
    assert int(page.locator("[data-field=template-working]").first.input_value()) == before + 1
    page.locator("[data-action=close-modal]").click()


def test_template_add_exercise(page):
    page.locator("[data-view=templates]").last.click()
    page.locator("[data-action=edit-template][data-template-id=legs-balmain]").click()
    page.wait_for_selector("text=Edit Template")
    before = page.locator(".template-editor-row").count()
    page.locator("[data-action=template-add-exercise]").click()
    page.wait_for_selector("text=Add Exercises")
    page.locator("[data-action=picker-filter]").fill("Bench Press (Barbell)")
    page.locator(".exercise-list-item").first.click()
    page.wait_for_selector("text=Edit Template")
    assert page.locator(".template-editor-row").count() == before + 1
    page.locator("[data-action=save-template-editor]").click()
    page.wait_for_selector("text=Template saved")


def test_exercise_settings(page):
    page.locator("[data-view=exercises]").last.click()
    page.locator("[data-action=filter-exercises]").fill("Bicep Curl (Cable)")
    page.locator(".exercise-list-item").first.click()
    page.wait_for_selector("text=Exercise Settings")
    page.locator("input[name=increment]").fill("1.25")
    assert page.locator("text=Exercise Settings").count() == 1
    page.locator("[data-action=save-exercise-settings]").click()
    page.wait_for_selector("text=Exercise Settings", state="detached")


def test_export(page):
    page.locator("[data-view=data]").last.click()
    with page.expect_download() as download_info:
        page.locator("[data-action=export-backup]").click()
    download = download_info.value
    assert download.suggested_filename.endswith(".json")


def test_active_workout(page):
    page.locator("[data-view=workout]").last.click()
    if page.locator("text=Cancel Workout").count():
        page.on("dialog", lambda dialog: dialog.accept())
        page.locator("[data-action=cancel-workout]").click()
        page.wait_for_selector("text=Start Workout")
    page.locator("[data-action=start-template][data-template-id=push-balmain]").first.click()
    page.wait_for_selector("text=Workout Location")
    page.locator("[data-action=start-template-confirm]").click()
    page.wait_for_selector("text=Chest Press Machine")
    page.locator("[data-action=open-template-session-actions]").click()
    page.wait_for_selector("text=Workout Options")
    page.locator("[data-action=close-modal]").click()
    page.locator("[data-action=open-focus]").first.click()
    page.wait_for_selector("text=Focus Metric")
    page.locator("[data-action=close-modal]").click()
    page.locator("[data-action=open-exercise-history]").first.click()
    page.wait_for_selector("text=Chest Press Machine")
    page.locator("[data-action=close-modal]").click()
    page.locator("[data-action=toggle-set-complete]").nth(1).click()
    page.locator("[data-field=rpe]").nth(1).fill("9")
    assert page.locator("[data-field=rir]").nth(1).input_value() == "1"
    page.locator("[data-action=add-working-set]").first.click()
    page.locator("[data-action=open-exercise-menu]").first.click()
    page.wait_for_selector("text=Add Note")
    page.locator("[data-action=replace-exercise]").click()
    page.wait_for_selector("text=Replace Exercise")
    page.locator("[data-action=picker-filter]").fill("Pec Deck")
    page.locator(".exercise-list-item").first.click()
    page.wait_for_selector("text=Pec Deck")


def assert_no_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth") == page.evaluate("window.innerWidth")


if __name__ == "__main__":
    main()
