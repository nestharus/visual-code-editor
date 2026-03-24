"""E2E tests for the diagram site — lock behavior before SolidJS rewrite."""
from __future__ import annotations

import pytest


# Helper: the root Cytoscape instances are in a JS closure (state.rootCy,
# state.rootBehavioralCy), not on DOM elements. We can interact via the
# public API by dispatching Cytoscape events on elements found through
# the canvas container, or by injecting a global reference at init time.
#
# For these tests we rely on DOM structure and Playwright actions rather
# than direct Cytoscape API calls where possible.


# ---------------------------------------------------------------------------
# Root render
# ---------------------------------------------------------------------------

class TestRootRender:
    def test_page_loads(self, page):
        assert page.title()

    def test_toolbar_visible(self, page):
        assert page.locator(".toolbar").is_visible()

    def test_view_toggle_exists(self, page):
        org = page.locator("[data-view-toggle='organizational']")
        beh = page.locator("[data-view-toggle='behavioral']")
        assert org.count() == 1
        assert beh.count() == 1

    def test_cytoscape_canvas_rendered(self, page):
        """At least one root container has a Cytoscape canvas."""
        org_canvas = page.locator("#root-cy canvas")
        beh_canvas = page.locator("#root-behavioral-cy canvas")
        assert org_canvas.count() > 0 or beh_canvas.count() > 0

    def test_organizational_has_canvas(self, page):
        page.locator("[data-view-toggle='organizational']").click()
        page.wait_for_timeout(1000)
        assert page.locator("#root-cy canvas").count() > 0

    def test_behavioral_has_canvas(self, page):
        page.locator("[data-view-toggle='behavioral']").click()
        page.wait_for_timeout(1000)
        assert page.locator("#root-behavioral-cy canvas").count() > 0


# ---------------------------------------------------------------------------
# View toggle
# ---------------------------------------------------------------------------

class TestViewToggle:
    def test_toggle_to_organizational_shows_container(self, page):
        page.locator("[data-view-toggle='organizational']").click()
        page.wait_for_timeout(500)
        org = page.locator("#root-cy")
        assert org.is_visible()

    def test_toggle_to_behavioral_shows_container(self, page):
        page.locator("[data-view-toggle='behavioral']").click()
        page.wait_for_timeout(500)
        beh = page.locator("#root-behavioral-cy")
        assert beh.is_visible()

    def test_toggle_back_and_forth(self, page):
        """Toggling views preserves canvases."""
        page.locator("[data-view-toggle='organizational']").click()
        page.wait_for_timeout(300)
        page.locator("[data-view-toggle='behavioral']").click()
        page.wait_for_timeout(300)
        page.locator("[data-view-toggle='organizational']").click()
        page.wait_for_timeout(300)
        assert page.locator("#root-cy canvas").count() > 0


# ---------------------------------------------------------------------------
# Breadcrumbs
# ---------------------------------------------------------------------------

class TestBreadcrumbs:
    def test_breadcrumb_exists(self, page):
        breadcrumb = page.locator("#breadcrumb")
        assert breadcrumb.count() == 1

    def test_breadcrumb_has_current(self, page):
        current = page.locator("#breadcrumb .breadcrumb-current")
        assert current.count() >= 1


# ---------------------------------------------------------------------------
# Detail panel
# ---------------------------------------------------------------------------

class TestDetailPanel:
    def test_detail_panel_exists(self, page):
        panel = page.locator("#detail-panel")
        assert panel.count() == 1

    def test_detail_panel_initially_closed(self, page):
        is_open = page.evaluate(
            "() => document.getElementById('detail-panel')?.classList.contains('is-open') || false"
        )
        assert not is_open


# ---------------------------------------------------------------------------
# Page structure
# ---------------------------------------------------------------------------

class TestPageStructure:
    def test_has_back_button(self, page):
        assert page.locator("#back-button").count() == 1

    def test_has_viewport(self, page):
        assert page.locator("#diagram-viewport").count() == 1

    def test_has_cytoscape_script(self, page):
        has_cy = page.evaluate("() => typeof window.cytoscape === 'function'")
        assert has_cy

    def test_has_mermaid_script(self, page):
        has_mermaid = page.evaluate("() => typeof window.mermaid === 'object'")
        assert has_mermaid
