"""Deep-links must point at the environment the server runs in.

The dev Space handed out production links: every plan produced while testing
sent the tester to the live site, and the dev front end was never exercised by
the thing meant to drive it. The web app has had ``VITE_API_BASE`` per
environment from the start; this is the missing mirror of it.

``render`` reads the variable at import, so each case reloads the module rather
than trying to mutate an already-resolved constant.
"""

from __future__ import annotations

import importlib

import pytest

import openwind_mcp_core.render as render_module


def _reload_with(monkeypatch: pytest.MonkeyPatch, value: str | None):
    if value is None:
        monkeypatch.delenv(render_module.WEB_BASE_ENV_VAR, raising=False)
    else:
        monkeypatch.setenv(render_module.WEB_BASE_ENV_VAR, value)
    return importlib.reload(render_module)


@pytest.fixture(autouse=True)
def _restore_module():
    """Leave the module resolved from the ambient env, whatever a test did."""
    yield
    importlib.reload(render_module)


def _url(mod) -> str:
    return mod.build_ohmywind_url(
        [{"lat": 43.3, "lon": 5.36}], "2026-08-02T08:00:00Z", "cruiser_40ft"
    )


def test_defaults_to_production_when_unset(monkeypatch) -> None:
    """An unconfigured deployment keeps the previous behaviour."""
    mod = _reload_with(monkeypatch, None)
    assert _url(mod).startswith("https://ohmywind.fr/plan?")


def test_dev_base_produces_dev_links(monkeypatch) -> None:
    mod = _reload_with(monkeypatch, "https://dev.ohmywind.fr")
    assert _url(mod).startswith("https://dev.ohmywind.fr/plan?")
    assert "//ohmywind.fr" not in _url(mod)


def test_trailing_slash_does_not_double_up(monkeypatch) -> None:
    """A base pasted from a browser bar usually carries one."""
    mod = _reload_with(monkeypatch, "https://dev.ohmywind.fr/")
    assert "//plan" not in _url(mod)
    assert _url(mod).startswith("https://dev.ohmywind.fr/plan?")


@pytest.mark.parametrize("bad", ["dev.ohmywind.fr", "ftp://dev.ohmywind.fr", "https://", "   "])
def test_a_malformed_base_falls_back_instead_of_shipping_broken_links(monkeypatch, bad) -> None:
    """The value is baked into every link we hand out, so it fails safe.

    A missing scheme is the likely typo, and left unchecked it would produce
    relative-looking URLs that no chat client can open.
    """
    mod = _reload_with(monkeypatch, bad)
    assert _url(mod).startswith("https://ohmywind.fr/plan?")


def test_host_is_exposed_for_display(monkeypatch) -> None:
    """The widget names the site it links to; both must agree."""
    mod = _reload_with(monkeypatch, "https://dev.ohmywind.fr")
    assert mod.WEB_HOST == "dev.ohmywind.fr"


@pytest.mark.asyncio
async def test_the_widget_resource_names_the_same_environment(monkeypatch) -> None:
    """End-to-end: the served HTML must carry no placeholder and no prod URL.

    The widget's fallback CTA is a separate code path from the deep-link, so a
    substitution missed there would show a production link inside a plan
    rendered on dev — the exact split this change exists to close.
    """
    import openwind_mcp_core.server as server_module

    monkeypatch.setenv(render_module.WEB_BASE_ENV_VAR, "https://dev.ohmywind.fr")
    importlib.reload(render_module)
    reloaded = importlib.reload(server_module)

    server = reloaded.build_server(adapter=object())
    contents = await server.read_resource(reloaded.PLAN_UI_RESOURCE_URI)
    html = next(iter(contents)).content

    assert "__WEB_BASE__" not in html and "__WEB_HOST__" not in html
    assert "dev.ohmywind.fr" in html
    assert "//ohmywind.fr" not in html

    importlib.reload(render_module)
    importlib.reload(server_module)
