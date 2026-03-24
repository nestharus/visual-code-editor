from __future__ import annotations

from visual_code_editor.assets import APP_JS, STYLESHEET
from visual_code_editor.render.utils import (
    escape,
    format_path,
    mermaid_escape,
    mermaid_multiline_label,
    page_document,
    rel_href,
    render_claim_section,
    render_link_list,
    render_list,
    render_references,
    slugify,
    toolbar_html,
)


def test_asset_exports_are_non_empty() -> None:
    assert STYLESHEET
    assert APP_JS
    assert ".page-shell" in STYLESHEET
    assert "toggle-details" in APP_JS
    assert 'edge.behavioral-edge' in APP_JS
    assert 'data-edge-click-map' in APP_JS
    assert 'behavioral-edge' in APP_JS
    assert ".behavioral-edge-route" in STYLESHEET


def test_basic_render_utils_behave_like_generate_helpers() -> None:
    assert slugify("Hello, World!") == "hello-world"
    assert format_path("module.py") == "src/module.py"
    assert format_path("src/module.py") == "src/module.py"
    assert rel_href("pages/index.html", "assets/styles.css") == "../assets/styles.css"
    assert escape("<tag>") == "&lt;tag&gt;"
    assert mermaid_escape('A "quote"\nline') == 'A \\"quote\\"<br/>line'
    assert mermaid_multiline_label("line1\nline2") == "line1<br/>line2"


def test_html_render_helpers_emit_expected_markup() -> None:
    claim_html = render_claim_section(
        "claim-1",
        "Section Title",
        "<p>Body</p>",
        ["ref-1"],
        {"ref-1": {"id": "ref-1"}},
    )
    refs_html = render_references(
        [{"id": "ref-1", "display_path": "src/app.py", "symbols": ["main"], "all_symbols": False}]
    )
    doc_html = page_document("Title", "pages/index.html", "hash", "build-1", "<main>Body</main>")
    toolbar = toolbar_html("Title", "Subtitle", "coverage/index.html")
    link_list = render_link_list([("docs/page.html", "Docs", "More")])

    assert "<li>alpha</li>" in render_list(["alpha"])
    assert "No explicit items documented" in render_list([])
    assert 'href="docs/page.html"' in link_list
    assert "Docs" in link_list
    assert "More" in link_list
    assert 'data-claim="claim-1"' in claim_html
    assert "Sources <sup" in claim_html
    assert "src/app.py" in refs_html
    assert 'href="../assets/styles.css"' in doc_html
    assert "toggle-details" in toolbar
    assert "0/0 symbols" in toolbar
