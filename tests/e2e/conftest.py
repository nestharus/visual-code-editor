"""E2E test fixtures: serve the generated diagram site for Playwright tests."""
from __future__ import annotations

import os
import socket
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import pytest


def _find_site_dir() -> Path:
    """Locate the generated diagram site directory."""
    env = os.environ.get("DIAGRAM_SITE_DIR")
    if env:
        return Path(env)
    candidate = (
        Path.home()
        / "projects"
        / "agent-implementation-skill"
        / "execution-philosophy"
        / "diagrams"
        / "site"
    )
    if candidate.is_dir() and (candidate / "index.html").exists():
        return candidate
    raise FileNotFoundError(
        "No diagram site found. Set DIAGRAM_SITE_DIR or generate the site first."
    )


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _make_handler(site_dir: str):
    """Create a request handler that serves from the given directory."""

    class _Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=site_dir, **kwargs)

        def log_message(self, format, *args):  # noqa: A002
            pass

    return _Handler


@pytest.fixture(scope="session")
def site_url():
    """Start an HTTP server serving the generated site; yield its base URL."""
    site_dir = _find_site_dir()
    port = _free_port()
    handler = _make_handler(str(site_dir))
    server = HTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture(scope="session")
def browser_context(site_url):
    """Provide a Playwright browser context for the test session."""
    from playwright.sync_api import sync_playwright

    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    yield context
    context.close()
    browser.close()
    pw.stop()


@pytest.fixture
def page(browser_context, site_url):
    """Provide a fresh page loaded to the site root."""
    p = browser_context.new_page()
    p.goto(site_url, wait_until="networkidle", timeout=30000)
    # Wait for diagram render — Cytoscape renders a <canvas> inside .cy-container
    p.wait_for_function(
        """() => {
            const orgCy = document.getElementById('root-cy');
            const behCy = document.getElementById('root-behavioral-cy');
            const orgCanvas = orgCy && orgCy.querySelector('canvas');
            const behCanvas = behCy && behCy.querySelector('canvas');
            return !!(orgCanvas || behCanvas);
        }""",
        timeout=30000,
    )
    yield p
    p.close()
