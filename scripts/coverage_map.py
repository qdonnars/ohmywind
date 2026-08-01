"""Render coverage maps of MARC PREVIMER + SHOM Atlas C2D zones.

Two output modes:

- ``--mode dev`` (default): two-panel side-by-side diagnostic with per-atlas
  labels and resolutions, written to ``docs/coverage_map.png``. Used during
  development to compare the two sources visually.
- ``--mode web``: single-panel Europe-extent figure with both layers
  overlaid in distinct colours, no resolution labels, no per-atlas legend.
  Written to ``packages/web/public/methodologie/coverage_map.png`` so the
  user-facing methodology page can embed it. Aim: visual storytelling, not
  diagnostic detail.

Reads ``build/marc/<atlas>/coverage.geojson`` for each MARC atlas (each is
a single polygon bbox built by ``scripts/build_marc_atlas.py``) and walks
``build/c2d/C2D/CD_COURANTS2D/DONNEES/<atlas_id>/<ZONE>_<atlas_id>`` for
SHOM C2D zones (each is a scattered point cloud whose bbox we derive from
the parsed points).

Run from repo root::

    uv run --project packages/data-adapters --with matplotlib \\
        python scripts/coverage_map.py --mode web

Both PNG outputs are gitignored; rerun whenever atlases change.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.figure import Figure

from openwind_data.currents.shom_c2d import load_c2d_directory

REPO_ROOT = Path(__file__).resolve().parents[1]
MARC_ROOT = REPO_ROOT / "build" / "marc"
C2D_DONNEES = REPO_ROOT / "build" / "c2d" / "C2D" / "CD_COURANTS2D" / "DONNEES"
DEV_OUT = REPO_ROOT / "docs" / "coverage_map.png"
WEB_OUT = REPO_ROOT / "packages" / "web" / "public" / "methodologie" / "coverage_map.png"

DEV_EXTENT = (-7.5, 3.5, 42.0, 52.5)  # (lon_min, lon_max, lat_min, lat_max)
# Wider extent for the web map: covers the full MARC ATLNE NE-Atlantic
# reach plus a generous buffer so the Mediterranean shows as "uncovered".
WEB_EXTENT = (-15.0, 18.0, 35.0, 60.0)

# Single colour per source for the web map; per-atlas shades for the dev map.
WEB_MARC_COLOR = "#2c7fb8"   # cool blue
WEB_SHOM_COLOR = "#e34a33"   # warm red

MARC_COLORS = {
    "ATLNE": "#9ecae1", "MANGA": "#6baed6", "MANE": "#4292c6",
    "MANW": "#2171b5", "FINIS": "#08519c", "SUDBZH": "#08306b",
    "AQUI": "#3182bd",
}
SHOM_COLORS = {
    557: ("Pas de Calais", "#fee5d9"),
    558: ("Bretagne sud", "#a50f15"),
    559: ("Vendée-Gironde", "#fc9272"),
    560: ("Iroise / Brest", "#cb181d"),
    561: ("Baie de Seine", "#fcae91"),
    562: ("Golfe Normand-Breton", "#ef3b2c"),
    563: ("Bretagne nord", "#99000d"),
    564: ("Manche", "#fb6a4a"),
    565: ("Gascogne", "#67000d"),
}


def _bbox_from_geojson(path: Path) -> tuple[float, float, float, float] | None:
    """Return ``(lat_min, lon_min, lat_max, lon_max)`` from a Polygon GeoJSON.

    The MARC coverage.geojson is always a single Polygon feature in
    decimal-degree WGS84; we shrink to the bbox. Returns ``None`` if the
    file is missing or malformed.
    """
    if not path.exists():
        return None
    payload = json.loads(path.read_text())
    feats = payload.get("features", [])
    if not feats:
        return None
    coords = feats[0]["geometry"]["coordinates"][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return (min(lats), min(lons), max(lats), max(lons))


def _add_box(
    ax: plt.Axes,
    bbox: tuple[float, float, float, float],
    *,
    color: str,
    alpha: float,
    label: str | None = None,
    edgecolor: str | None = None,
    linewidth: float = 0.8,
) -> None:
    lat_min, lon_min, lat_max, lon_max = bbox
    rect = mpatches.Rectangle(
        (lon_min, lat_min),
        lon_max - lon_min,
        lat_max - lat_min,
        linewidth=linewidth,
        edgecolor=edgecolor if edgecolor else color,
        facecolor=color,
        alpha=alpha,
        label=label,
    )
    ax.add_patch(rect)


def _setup_axes(
    ax: plt.Axes,
    title: str,
    extent: tuple[float, float, float, float],
    cities: dict[str, tuple[float, float]],
) -> None:
    lon_min, lon_max, lat_min, lat_max = extent
    ax.set_xlim(lon_min, lon_max)
    ax.set_ylim(lat_min, lat_max)
    ax.set_aspect("equal", adjustable="box")
    ax.grid(True, color="lightgray", linewidth=0.4, alpha=0.6)
    ax.set_xlabel("Longitude (°E)")
    ax.set_ylabel("Latitude (°N)")
    ax.set_title(title, fontsize=12)
    for name, (lon, lat) in cities.items():
        ax.plot(lon, lat, marker="o", color="black", markersize=2.5)
        ax.annotate(
            name, (lon, lat), xytext=(3, 3), textcoords="offset points",
            fontsize=7, color="dimgray",
        )


# ----------------------------------------------------------------------
# Dev mode: detailed two-panel diagnostic
# ----------------------------------------------------------------------

_DEV_CITIES = {
    "Brest": (-4.49, 48.39),
    "La Rochelle": (-1.15, 46.16),
    "Bordeaux": (-0.58, 44.84),
    "Cherbourg": (-1.62, 49.65),
    "Marseille": (5.37, 43.30),
}


def _render_marc_dev(ax: plt.Axes) -> None:
    _setup_axes(ax, "MARC PREVIMER (Ifremer)", DEV_EXTENT, _DEV_CITIES)
    plot_lon_min, plot_lon_max, plot_lat_min, plot_lat_max = DEV_EXTENT
    for atlas_dir in sorted(MARC_ROOT.iterdir()):
        if not atlas_dir.is_dir():
            continue
        bbox = _bbox_from_geojson(atlas_dir / "coverage.geojson")
        if bbox is None:
            continue
        color = MARC_COLORS.get(atlas_dir.name, "gray")
        _add_box(ax, bbox, color=color, alpha=0.30)
        clipped_lon = (max(bbox[1], plot_lon_min) + min(bbox[3], plot_lon_max)) / 2
        clipped_lat = (max(bbox[0], plot_lat_min) + min(bbox[2], plot_lat_max)) / 2
        ax.text(
            clipped_lon, clipped_lat, atlas_dir.name,
            ha="center", va="center", fontsize=8, color=color, weight="bold", alpha=0.9,
        )


def _render_shom_dev(ax: plt.Axes) -> None:
    _setup_axes(ax, "SHOM Atlas C2D (édition 2005)", DEV_EXTENT, _DEV_CITIES)
    if not C2D_DONNEES.exists():
        ax.text(
            0.5, 0.5, "SHOM C2D not extracted\n(see build/c2d/)",
            transform=ax.transAxes, ha="center", va="center", fontsize=10, color="red",
        )
        return
    zones = load_c2d_directory(C2D_DONNEES)
    drawn_atlases: set[int] = set()
    legend_handles: list[mpatches.Patch] = []
    for zone in zones:
        if zone.atlas_id == 564 and zone.name == "MANCHE":
            continue
        if zone.atlas_id == 565 and zone.name == "GASCOGNE":
            continue
        if zone.name in {"BRETAGNE_SUD", "VENDEE_GIRONDE", "BRETAGNE_NORD"}:
            continue
        label_name, color = SHOM_COLORS.get(zone.atlas_id, (str(zone.atlas_id), "gray"))
        new_atlas = zone.atlas_id not in drawn_atlases
        _add_box(ax, zone.bbox, color=color, alpha=0.45)
        if new_atlas:
            legend_handles.append(
                mpatches.Patch(facecolor=color, alpha=0.45, label=f"{zone.atlas_id} {label_name}")
            )
            drawn_atlases.add(zone.atlas_id)
    ax.legend(
        handles=legend_handles, loc="lower left", fontsize=7, framealpha=0.85,
        ncol=2, title="Atlas SHOM C2D",
    )


def render_dev_map() -> Figure:
    fig, axes = plt.subplots(1, 2, figsize=(14, 8))
    _render_shom_dev(axes[0])
    _render_marc_dev(axes[1])
    fig.suptitle(
        "Couverture des atlas de courants — SHOM C2D vs MARC PREVIMER",
        fontsize=14, weight="bold",
    )
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    return fig


# ----------------------------------------------------------------------
# Web mode: single-panel, Europe extent, simplified for the methodology page
# ----------------------------------------------------------------------

_WEB_CITIES = {
    "London": (-0.13, 51.51),
    "Paris": (2.35, 48.86),
    "Brest": (-4.49, 48.39),
    "Bordeaux": (-0.58, 44.84),
    "Madrid": (-3.70, 40.42),
    "Lisbon": (-9.14, 38.72),
    "Dublin": (-6.27, 53.35),
    "Marseille": (5.37, 43.30),
    "Amsterdam": (4.90, 52.37),
}


def render_web_map() -> Figure:
    """Single-panel Europe-extent map for the methodology page.

    Stacks MARC (cool blue) below SHOM (warm red) on the same axes. No
    per-atlas resolution labels — the goal is to communicate "where does
    OhMyWind have high-precision tidal currents?" at a glance, not to
    teach the reader about Ifremer/SHOM atlas naming conventions.
    """
    fig, ax = plt.subplots(figsize=(11, 8))
    _setup_axes(
        ax,
        "Couverture des atlas de courants haute précision en Europe",
        WEB_EXTENT,
        _WEB_CITIES,
    )

    # MARC layer first so SHOM sits on top.
    marc_drawn = False
    for atlas_dir in sorted(MARC_ROOT.iterdir()):
        if not atlas_dir.is_dir():
            continue
        bbox = _bbox_from_geojson(atlas_dir / "coverage.geojson")
        if bbox is None:
            continue
        _add_box(
            ax, bbox, color=WEB_MARC_COLOR, alpha=0.22,
            edgecolor=WEB_MARC_COLOR, linewidth=0.4,
        )
        marc_drawn = True

    shom_drawn = False
    if C2D_DONNEES.exists():
        zones = load_c2d_directory(C2D_DONNEES)
        for zone in zones:
            # Drop the deliberately wide general zones so the SHOM layer
            # tells the "where SHOM zooms" story rather than overprinting
            # the whole MARC area in red. The cartouches under those
            # general zones already trace the meaningful detail.
            if zone.atlas_id == 564 and zone.name == "MANCHE":
                continue
            if zone.atlas_id == 565 and zone.name == "GASCOGNE":
                continue
            if zone.name in {"BRETAGNE_SUD", "VENDEE_GIRONDE", "BRETAGNE_NORD"}:
                continue
            _add_box(
                ax, zone.bbox, color=WEB_SHOM_COLOR, alpha=0.55,
                edgecolor=WEB_SHOM_COLOR, linewidth=0.4,
            )
            shom_drawn = True

    # Legend built from single proxy handles per source.
    handles = []
    if marc_drawn:
        handles.append(
            mpatches.Patch(
                facecolor=WEB_MARC_COLOR, alpha=0.22, edgecolor=WEB_MARC_COLOR,
                label="MARC PREVIMER (Ifremer)",
            )
        )
    if shom_drawn:
        handles.append(
            mpatches.Patch(
                facecolor=WEB_SHOM_COLOR, alpha=0.55, edgecolor=WEB_SHOM_COLOR,
                label="SHOM Atlas C2D",
            )
        )
    handles.append(
        mpatches.Patch(
            facecolor="none", edgecolor="dimgray",
            label="Hors couverture : Open-Meteo SMOC 8 km",
        )
    )
    ax.legend(handles=handles, loc="lower right", fontsize=10, framealpha=0.92)

    fig.tight_layout()
    return fig


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode", choices=("dev", "web"), default="dev",
        help="dev = two-panel diagnostic (docs/), web = single-panel methodology (public/)",
    )
    args = parser.parse_args()

    if args.mode == "dev":
        fig = render_dev_map()
        DEV_OUT.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(DEV_OUT, dpi=140, bbox_inches="tight")
        print(f"wrote {DEV_OUT}")
    else:
        fig = render_web_map()
        WEB_OUT.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(WEB_OUT, dpi=140, bbox_inches="tight")
        print(f"wrote {WEB_OUT}")


if __name__ == "__main__":
    main()
