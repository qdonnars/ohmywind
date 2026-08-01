from __future__ import annotations

from datetime import UTC, datetime, timedelta

from mcp.server.fastmcp import FastMCP
from openwind_data.adapters.base import (
    ForecastBundle,
    SeaSeries,
    WindPoint,
    WindSeries,
)

from openwind_mcp_core import build_server


class StubAdapter:
    """Test adapter that records every fetch call.

    The fetch counter is the load-bearing assertion for the V1 surface: the
    point of merging estimate_passage + score_complexity into ``plan_passage``
    is to fetch Open-Meteo ONCE per A→B question, not twice.
    """

    def __init__(self) -> None:
        self.fetch_calls: int = 0

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        self.fetch_calls += 1
        models = models or ["meteofrance_arome_france"]
        points: list[WindPoint] = []
        t = start
        while t <= end:
            points.append(WindPoint(time=t, speed_kn=12.0, direction_deg=0.0, gust_kn=None))
            t = t + timedelta(hours=1)
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start,
            end=end,
            wind_by_model={m: WindSeries(model=m, points=tuple(points)) for m in models},
            sea=SeaSeries(points=()),
            requested_at=start,
        )


async def _call(server: FastMCP, name: str, args: dict) -> object:
    result = await server.call_tool(name, args)
    # FastMCP.call_tool returns (content, structured_or_dict)
    if isinstance(result, tuple):
        return result[1]
    return result


_BASE_PLAN_ARGS: dict = {
    "waypoints": [{"lat": 43.30, "lon": 5.35}, {"lat": 43.00, "lon": 6.20}],
    "departure": datetime(2026, 5, 1, 6, 0, tzinfo=UTC).isoformat(),
    "archetype": "cruiser_40ft",
}


class TestBuildServer:
    def test_returns_fastmcp(self) -> None:
        server = build_server(adapter=StubAdapter())
        assert isinstance(server, FastMCP)

    async def test_lists_five_tools(self) -> None:
        # The V1 surface: 3 functional tools + read_me for methodology Q&A
        # + feedback for LLM-side issue reporting.
        server = build_server(adapter=StubAdapter())
        tools = await server.list_tools()
        names = {t.name for t in tools}
        assert names == {
            "read_me",
            "list_boat_archetypes",
            "get_marine_forecast",
            "plan_passage",
            "feedback",
        }


class TestReadMe:
    async def test_returns_methodology_string(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "read_me", {})
        text = out["result"] if isinstance(out, dict) and "result" in out else out
        assert isinstance(text, str)
        assert len(text) > 500  # substantive content
        # Mentions key methodology keywords
        for keyword in ["polar", "VMG", "efficiency", "AROME"]:
            assert keyword in text, f"missing keyword: {keyword}"


class TestListArchetypes:
    async def test_returns_archetypes_with_metadata(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "list_boat_archetypes", {})
        items = out["result"] if isinstance(out, dict) and "result" in out else out
        assert len(items) == 7
        names = {a["name"] for a in items}
        assert "cruiser_40ft" in names
        assert {"cruiser_20ft", "cruiser_25ft"} <= names
        for a in items:
            assert {"length_ft", "type", "category", "performance_class", "examples"} <= a.keys()


class TestPlanPassage:
    """The single workhorse tool. Replaces estimate_passage + score_complexity.
    Contract: ONE call returns timing + complexity + openwind_url, fetches
    Open-Meteo ONCE. Rich rendering moved to MCP Apps via _meta.ui resource."""

    async def test_returns_full_payload(self) -> None:
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        out = await _call(server, "plan_passage", _BASE_PLAN_ARGS)

        assert {"passage", "complexity", "openwind_url"} <= out.keys()
        # html field is gone in the MCP Apps era.
        assert "html" not in out
        # Passage shape
        assert isinstance(out["passage"]["departure_time"], str)
        assert out["passage"]["archetype"] == "cruiser_40ft"
        assert len(out["passage"]["segments"]) >= 1
        # Complexity shape
        assert 1 <= out["complexity"]["level"] <= 5
        # URL always present
        assert out["openwind_url"].startswith("https://ohmywind.fr/plan?")

    async def test_no_double_fetch(self) -> None:
        # The whole point of the merge: estimate_passage fetches once per
        # sub-segment. The OLD two-tool flow (estimate_passage +
        # score_complexity) ran the whole pipeline twice → 2N fetches.
        # plan_passage scores from the same report → exactly N fetches.
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        out = await _call(server, "plan_passage", _BASE_PLAN_ARGS)
        n_segments = len(out["passage"]["segments"])
        assert adapter.fetch_calls == n_segments, (
            f"expected one fetch per segment ({n_segments}), got {adapter.fetch_calls} — "
            "score_complexity may be re-fetching"
        )

    async def test_openwind_url_uses_explicit_waypoints(self) -> None:
        # The URL encodes the user's original waypoints, not the (potentially
        # subdivided) segments — so partage SMS reproduit fidèlement la nav.
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _BASE_PLAN_ARGS)
        url = out["openwind_url"]
        assert "wpts=43.300,5.350;43.000,6.200" in url
        assert "archetype=cruiser_40ft" in url

    async def test_ui_resource_registered(self) -> None:
        # MCP Apps: the host needs to be able to fetch ui://openwind/plan-passage.
        from openwind_mcp_core.server import PLAN_UI_RESOURCE_URI

        server = build_server(adapter=StubAdapter())
        resources = await server.list_resources()
        uris = [str(r.uri) for r in resources]
        assert PLAN_UI_RESOURCE_URI in uris

    async def test_max_hs_factors_into_complexity(self) -> None:
        # max_hs_m used to be on its own tool (score_complexity); now it's
        # a kwarg on plan_passage. Confirm it still drives the score.
        server = build_server(adapter=StubAdapter())
        out_no_hs = await _call(server, "plan_passage", _BASE_PLAN_ARGS)
        out_with_hs = await _call(server, "plan_passage", {**_BASE_PLAN_ARGS, "max_hs_m": 2.5})
        assert out_no_hs["complexity"]["sea_level"] is None
        assert out_with_hs["complexity"]["sea_level"] == 4

    async def test_default_uses_auto_model(self) -> None:
        # No `model` arg → AUTO_MODEL → StubAdapter resolves on first try.
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _BASE_PLAN_ARGS)
        assert out["passage"]["model"] == "meteofrance_arome_france"


_SWEEP_ARGS: dict = {
    **_BASE_PLAN_ARGS,
    "latest_departure": datetime(2026, 5, 1, 9, 0, tzinfo=UTC).isoformat(),
    "sweep_interval_hours": 3,
}


class TestPlanPassageSweep:
    async def test_sweep_returns_multi_window_mode(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _SWEEP_ARGS)
        assert out["mode"] == "multi_window"
        assert "sweep" in out
        assert "windows" in out

    async def test_sweep_window_count_matches_interval(self) -> None:
        # departure 06:00, latest 09:00, interval 3h → 2 windows: 06:00, 09:00
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _SWEEP_ARGS)
        assert out["sweep"]["window_count"] == 2
        assert len(out["windows"]) == 2

    async def test_sweep_window_shape(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _SWEEP_ARGS)
        w = out["windows"][0]
        assert {
            "departure",
            "arrival",
            "duration_h",
            "distance_nm",
            "complexity",
            "conditions_summary",
            "warnings",
            "openwind_url",
        } <= w.keys()
        assert 1 <= w["complexity"]["level"] <= 5
        cs = w["conditions_summary"]
        assert {
            "tws_min_kn",
            "tws_max_kn",
            "predominant_sail_angle",
            "hs_min_m",
            "hs_max_m",
        } <= cs.keys()
        assert cs["predominant_sail_angle"] in ("pres", "travers", "largue", "portant")

    async def test_html_never_rendered_in_sweep(self) -> None:
        # html field is gone everywhere now (MCP Apps era).
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _SWEEP_ARGS)
        assert "html" not in out
        for w in out["windows"]:
            assert "html" not in w

    async def test_each_window_has_openwind_url(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _SWEEP_ARGS)
        for w in out["windows"]:
            assert w["openwind_url"].startswith("https://ohmywind.fr/plan?")
            assert "wpts=" in w["openwind_url"]

    async def test_sweep_departures_ordered_and_spaced(self) -> None:
        server = build_server(adapter=StubAdapter())
        args = {
            **_BASE_PLAN_ARGS,
            "latest_departure": datetime(2026, 5, 1, 8, 0, tzinfo=UTC).isoformat(),
            "sweep_interval_hours": 1,
        }
        out = await _call(server, "plan_passage", args)
        windows = out["windows"]
        assert len(windows) == 3  # 06:00, 07:00, 08:00
        deps = [datetime.fromisoformat(w["departure"]) for w in windows]
        for i in range(1, len(deps)):
            delta_h = (deps[i] - deps[i - 1]).total_seconds() / 3600
            assert abs(delta_h - 1.0) < 1e-9

    async def test_single_mode_backward_compatible(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _BASE_PLAN_ARGS)
        assert {"passage", "complexity", "openwind_url"} <= out.keys()
        assert "mode" not in out
        assert "html" not in out  # dropped in the MCP Apps migration

    async def test_target_eta_filters_windows(self) -> None:
        # With constant 12 kn from north, passage ~8h → arrival ~14:00 from 06:00
        # Requesting latest=12:00 at interval 3h → windows at 06:00, 09:00, 12:00
        # target_eta near 14:00 should keep 06:00 window (arrival closest to 14h)
        server = build_server(adapter=StubAdapter())
        args = {
            **_BASE_PLAN_ARGS,
            "latest_departure": datetime(2026, 5, 1, 12, 0, tzinfo=UTC).isoformat(),
            "sweep_interval_hours": 3,
            "target_eta": datetime(2026, 5, 1, 14, 0, tzinfo=UTC).isoformat(),
        }
        out = await _call(server, "plan_passage", args)
        assert "windows" in out
        # At least one window was evaluated
        assert len(out["windows"]) >= 1

    async def test_sweep_cap_exceeded_raises(self) -> None:

        server = build_server(adapter=StubAdapter())
        args = {
            **_BASE_PLAN_ARGS,
            "latest_departure": datetime(2026, 5, 20, 0, 0, tzinfo=UTC).isoformat(),
            "sweep_interval_hours": 1,
        }
        try:
            await _call(server, "plan_passage", args)
            assert False, "expected an exception for oversized sweep"
        except Exception as exc:
            assert "336" in str(exc) or "cap" in str(exc).lower() or "windows" in str(exc).lower()


class TestFeedback:
    """The feedback tool is the LLM-side issue reporting channel.

    Contract: the sink receives a normalised entry with stable keys; the
    tool never raises (a failing sink degrades to ``ack="buffered"``);
    the LLM-facing payload only exposes ``feedback_id``, ``received_at``,
    and ``ack``."""

    @staticmethod
    def _args(**overrides: object) -> dict:
        base = {
            "category": "wrong_result",
            "tool_name": "plan_passage",
            "severity": "medium",
            "message": "distance_nm=0 for Marseille -> Calvi",
        }
        base.update(overrides)
        return base

    async def test_feedback_listed(self) -> None:
        server = build_server(adapter=StubAdapter())
        tools = await server.list_tools()
        names = {t.name for t in tools}
        assert "feedback" in names

    async def test_default_sink_does_not_raise(self) -> None:
        # No sink provided → stderr_sink default. Tool returns ack="thanks".
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "feedback", self._args())
        assert out["ack"] == "thanks"
        assert isinstance(out["feedback_id"], str) and len(out["feedback_id"]) > 0
        assert isinstance(out["received_at"], str)

    async def test_custom_sink_receives_normalised_entry(self) -> None:
        captured: list[dict] = []

        def sink(entry: dict) -> None:
            captured.append(entry)

        server = build_server(adapter=StubAdapter(), feedback_sink=sink)
        await _call(
            server,
            "feedback",
            self._args(context_json={"waypoints": [[43.3, 5.35], [42.5, 8.7]]}),
        )
        assert len(captured) == 1
        e = captured[0]
        assert {
            "feedback_id",
            "received_at",
            "category",
            "tool_name",
            "severity",
            "message",
            "context_json",
            "client_hint",
        } <= e.keys()
        assert e["category"] == "wrong_result"
        assert e["tool_name"] == "plan_passage"
        assert e["severity"] == "medium"
        assert e["context_json"] == {"waypoints": [[43.3, 5.35], [42.5, 8.7]]}
        assert e["client_hint"] is None

    async def test_failing_sink_degrades_to_buffered(self) -> None:
        def sink(_entry: dict) -> None:
            raise RuntimeError("HF push failed")

        server = build_server(adapter=StubAdapter(), feedback_sink=sink)
        out = await _call(server, "feedback", self._args())
        assert out["ack"] == "buffered"
        # ID and timestamp still returned, so the LLM never sees a tool error.
        assert isinstance(out["feedback_id"], str) and len(out["feedback_id"]) > 0

    async def test_long_message_is_truncated(self) -> None:
        captured: list[dict] = []
        server = build_server(adapter=StubAdapter(), feedback_sink=captured.append)
        await _call(server, "feedback", self._args(message="x" * 5000))
        assert "[truncated]" in captured[0]["message"]
        assert len(captured[0]["message"]) < 5000

    async def test_response_does_not_leak_message(self) -> None:
        # The tool response should be a thin ack — not echo back the
        # user's full message (no point round-tripping it to the LLM).
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "feedback", self._args(message="some private note"))
        assert "some private note" not in str(out)


class TestGetMarineForecast:
    async def test_returns_serializable_bundle(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(
            server,
            "get_marine_forecast",
            {
                "lat": 43.30,
                "lon": 5.35,
                "start": datetime(2026, 5, 1, 6, 0, tzinfo=UTC).isoformat(),
                "end": datetime(2026, 5, 1, 18, 0, tzinfo=UTC).isoformat(),
            },
        )
        assert "wind" in out
        assert "meteofrance_arome_france" in out["wind"]
        assert isinstance(out["wind"]["meteofrance_arome_france"][0]["time"], str)
