# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Where the tidal stream must set, at reference passes, from sources outside our pipeline.

The one error in a tidal stream that hurts a skipper is the wrong way round:
a flood served as an ebb sends a boat into the Raz de Sein against 6 kt. The
suites that use this module check the *sense* of the stream the cascade
serves, at a wide tolerance, against a truth none of our builders produced:

- **When**: high and low water at a reference port, predicted by our own
  harmonic predictor (``harmonic.predict``) from the tide-gauge constants of
  TICON-4 (Hart-Davis, Dettmering, Seitz, DGFI-TUM, SEANOE 2025,
  doi:10.17882/109129, CC BY 4.0). Heights from a tide gauge, never a current
  and never one of our atlases: an inverted current cannot shift them.
- **Which way**: published nautical knowledge (the source is named on each
  pass below), or plain geometry where a narrow entrance fills and empties a
  basin: while the water rises the stream runs in.

Each pass is sampled at a fixed offset from every high (or low) water of a
fifteen-day window that spans a spring and a neap tide (the 2026-03 equinox
springs, the window the weak-tide rule already uses), and every sample must
set within ``tolerance_deg`` of the expected bearing. The offsets sit in the
middle of the flood or the ebb, hours away from slack water, so a sample that
fails is the stream running the wrong way, not a slack-water wobble.

Imported by ``test_direction_*.py`` and by
``scripts/build_test_fixtures_currents.py``, which reads the pass list to
know what to extract. No pytest import at module level for that reason.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from openwind_data.adapters.base import (
    ForecastBundle,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)
from openwind_data.currents.harmonic import predict

# ---------------------------------------------------------------------------
# Reference ports: TICON-4 tide-gauge constants, amplitude in metres (the
# file gives centimetres), Greenwich phase lag in degrees, UTC. Eighteen
# constituents per port, the semi-diurnal and diurnal families plus the
# shallow-water ones that shape the curve in the Channel and the Elbe; that
# times high water to a few minutes, far inside the hours of margin the
# offsets below leave. Station ids are TICON-4's ``tide_gauge_name``.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RefPort:
    name: str
    ticon_station: str
    lat: float
    lon: float
    constants: dict[str, tuple[float, float]]


REFERENCE_PORTS: dict[str, RefPort] = {
    "BREST": RefPort(
        "Brest",
        "brest-3-fra-refmar",
        48.3829,
        -4.4950,
        {
            "M2": (2.0511, 108.99), "S2": (0.7489, 148.28), "N2": (0.4169, 90.62),
            "K2": (0.2137, 145.89), "2N2": (0.0570, 72.81), "MU2": (0.0857, 105.07),
            "NU2": (0.0778, 86.60), "L2": (0.0639, 102.92), "T2": (0.0417, 138.56),
            "K1": (0.0643, 75.09), "O1": (0.0658, 327.89), "P1": (0.0225, 63.65),
            "Q1": (0.0205, 281.35), "M4": (0.0545, 105.90), "MS4": (0.0327, 181.75),
            "MN4": (0.0194, 60.44), "M6": (0.0315, 354.85), "2MS6": (0.0168, 53.35),
        },
    ),
    "CHERBOURG": RefPort(
        "Cherbourg",
        "cherbourg-13-fra-refmar",
        49.6514,
        -1.6355,
        {
            "M2": (1.8684, 228.37), "S2": (0.6957, 272.22), "N2": (0.3710, 209.09),
            "K2": (0.1981, 270.12), "2N2": (0.0504, 190.32), "MU2": (0.0756, 222.47),
            "NU2": (0.0683, 201.56), "L2": (0.0650, 224.14), "T2": (0.0380, 261.17),
            "K1": (0.0931, 106.59), "O1": (0.0630, 356.74), "P1": (0.0325, 99.95),
            "Q1": (0.0173, 316.10), "M4": (0.1436, 355.32), "MS4": (0.0879, 45.82),
            "MN4": (0.0514, 329.83), "M6": (0.0252, 94.41), "2MS6": (0.0279, 133.10),
        },
    ),
    "CUXHAVEN": RefPort(
        "Cuxhaven (Steubenhöft)",
        "cuxhaven_steubenhoft-cux-deu-bfg",
        53.8677,
        8.7173,
        {
            "M2": (1.3500, 343.39), "S2": (0.3470, 52.36), "N2": (0.2102, 317.25),
            "K2": (0.1044, 50.64), "2N2": (0.0241, 292.05), "MU2": (0.1405, 73.33),
            "NU2": (0.0813, 303.68), "L2": (0.1092, 2.22), "T2": (0.0174, 28.84),
            "K1": (0.0696, 42.57), "O1": (0.0926, 251.15), "P1": (0.0291, 44.33),
            "Q1": (0.0293, 190.73), "M4": (0.1089, 212.22), "MS4": (0.0701, 276.23),
            "MN4": (0.0373, 189.54), "M6": (0.0650, 56.05), "2MS6": (0.0634, 119.44),
        },
    ),
    "TRONDHEIM": RefPort(
        "Trondheim",
        "trondheim-trd-nor-nhs",
        63.4365,
        10.3917,
        {
            "M2": (0.9257, 305.82), "S2": (0.3235, 344.02), "N2": (0.1859, 282.81),
            "K2": (0.0913, 341.55), "2N2": (0.0256, 260.79), "MU2": (0.0244, 263.55),
            "NU2": (0.0366, 286.93), "L2": (0.0253, 326.49), "T2": (0.0166, 340.09),
            "K1": (0.0657, 166.61), "O1": (0.0518, 36.69), "P1": (0.0185, 151.15),
            "Q1": (0.0208, 342.64), "M4": (0.0537, 237.05), "MS4": (0.0349, 328.98),
            "MN4": (0.0210, 196.35), "M6": (0.0065, 258.19), "2MS6": (0.0056, 305.76),
        },
    ),
    "CAPE_DOR": RefPort(
        "Cape d'Or (Minas Channel)",
        "cape_dor-240-can-meds",
        45.30,
        -64.78,
        {
            "M2": (4.8933, 110.31), "S2": (0.7768, 154.91), "N2": (0.9231, 82.37),
            "K2": (0.3265, 145.32), "2N2": (0.1604, 54.38), "MU2": (0.1445, 168.24),
            "NU2": (0.1731, 136.67), "L2": (0.3362, 165.15), "T2": (0.0937, 14.48),
            "K1": (0.2050, 198.98), "O1": (0.1396, 183.83), "P1": (0.0666, 186.41),
            "Q1": (0.0360, 163.80), "M4": (0.1019, 164.46), "MS4": (0.0265, 211.38),
            "MN4": (0.0391, 135.33), "M6": (0.0191, 88.76), "2MS6": (0.0084, 159.21),
        },
    ),
}  # fmt: skip

# Fifteen days hourly from the 2026-03-01 new moon: the 3 March equinoctial
# springs and the neaps after them, 29 high waters. Fixed, so the answer
# never depends on the date the suite runs.
WINDOW_START = datetime(2026, 3, 1, tzinfo=UTC)
WINDOW_DAYS = 15


@dataclass(frozen=True, slots=True)
class Phase:
    """One half of the tide at a pass: when to look, and which way it must set.

    ``event`` is ``"HW"`` or ``"LW"`` at the pass's reference port;
    ``offset_h`` is hours after it (negative before). ``expected_to_deg`` is
    the bearing the stream sets *to*, true, the convention of
    ``SeaPoint.current_direction_to_deg``.
    """

    label: str
    event: str
    offset_h: float
    expected_to_deg: float


@dataclass(frozen=True, slots=True)
class Pass:
    key: str
    name: str
    lat: float
    lon: float
    port: str
    flood: Phase
    ebb: Phase
    truth: str
    tolerance_deg: float = 60.0
    # Below this the direction of a sample means nothing; a sample this weak
    # at mid-flood says the timing is wrong, and that fails too.
    min_speed_kn: float = 0.15
    # The atlas the open fixture holds for this pass, for the fixture suite.
    fixture_atlas: str | None = None
    notes: tuple[str, ...] = field(default=())

    @property
    def phases(self) -> tuple[Phase, Phase]:
        return (self.flood, self.ebb)


def _flood(event: str, offset_h: float, to_deg: float) -> Phase:
    return Phase("flot", event, offset_h, to_deg)


def _ebb(event: str, offset_h: float, to_deg: float) -> Phase:
    return Phase("jusant", event, offset_h, to_deg)


# ---------------------------------------------------------------------------
# The passes. French ones are served by SHOM C2D or MARC, which may not be
# redistributed: their suite reads the private dataset (``real_atlas``). The
# others have an open fixture extracted from the same atlas.
# ---------------------------------------------------------------------------

RAZ_DE_SEIN = Pass(
    key="raz_de_sein",
    name="Raz de Sein",
    lat=48.0345,
    lon=-4.7722,
    port="BREST",
    # Slack before the ebb at PM Brest -0h45 to -0h30, before the flood at
    # about PM Brest +5h40: mid-flood is PM -3h30, mid-ebb PM +2h30.
    flood=_flood("HW", -3.5, 20.0),
    ebb=_ebb("HW", 2.5, 200.0),
    truth=(
        "Flot vers le nord-est, jusant vers le sud-ouest : Rouch, Les Marées, "
        "Payot 1961, p. 123 (cité par fr.wikipedia.org/wiki/Raz_de_Sein) ; "
        "« vers le nord » et « vers le sud » chez les plaisanciers, d'où "
        "l'attendu entre les deux (020 et 200). Étales à PM Brest -0h45/-0h30 "
        "et PM Brest +5h40 (Atlas SHOM 560-UJA, résumé par "
        "boatmap.app/fr/blog/courants-raz-sein-memo)."
    ),
)

FROMVEUR = Pass(
    key="fromveur",
    name="Passage du Fromveur",
    # In the channel between Ouessant and Kéréon, where the stream peaks. The
    # gazetteer point (48.4267, -5.0167) sits 2 km south of it on the edge of
    # the Molène shoals, where the atlases hold half a knot.
    lat=48.445,
    lon=-5.025,
    port="BREST",
    flood=_flood("HW", -3.0, 45.0),
    ebb=_ebb("HW", 3.0, 225.0),
    truth=(
        "Chenal orienté NE-SW entre Ouessant et Kéréon, flot vers le NE comme "
        "dans toute l'Iroise (Atlas SHOM 560-UJA) ; étales à PM Brest ± 10 min "
        "et BM Brest ± 5 min (boatmap.app/fr/blog/courants-fromveur), donc "
        "mi-flot à PM -3h et mi-jusant à PM +3h."
    ),
)

GOULET_DE_BREST = Pass(
    key="goulet_de_brest",
    name="Goulet de Brest",
    lat=48.3417,
    lon=-4.5667,
    port="BREST",
    # The goulet runs from Le Petit Minou (48.336 N 4.615 W) to Le Portzic
    # (48.359 N 4.532 W), a bearing of 068: the flood fills the Rade along it.
    flood=_flood("HW", -2.0, 68.0),
    ebb=_ebb("HW", 4.0, 248.0),
    truth=(
        "Goulet d'un bassin fermé : la rade se remplit tant que la mer monte, "
        "le flot entre vers l'ENE le long de l'axe Petit Minou - Portzic (068) "
        "et le jusant sort vers l'WSW ; le jusant commence dans le goulet "
        "environ 1 h après PM (livret « Rade de Brest », voileaviron.org)."
    ),
)

CHENAL_DU_FOUR = Pass(
    key="chenal_du_four",
    name="Chenal du Four (Saint-Mathieu)",
    lat=48.350,
    lon=-4.800,
    port="BREST",
    flood=_flood("HW", -3.0, 0.0),
    ebb=_ebb("HW", 3.0, 180.0),
    truth=(
        "Courant portant au nord de PM Brest -5h25 à PM -1h, nul à PM, puis "
        "portant au sud jusqu'à la renverse de Saint-Mathieu vers PM +6h "
        "(bateaux.com, « Conseils pour passer le chenal du Four »)."
    ),
)

RAZ_BLANCHARD = Pass(
    key="raz_blanchard",
    name="Raz Blanchard",
    lat=49.7178,
    lon=-2.0686,
    port="CHERBOURG",
    flood=_flood("HW", 0.0, 45.0),
    ebb=_ebb("LW", 0.0, 225.0),
    truth=(
        "« Au milieu du passage, le courant de flot porte au nord-est [...]. Son "
        "maximum survient aux environs de l'heure de la pleine mer de "
        "Cherbourg, tandis que le maximum du jusant, portant au sud-ouest, a "
        "lieu vers l'heure de la basse mer de Cherbourg » "
        "(fr.wikipedia.org/wiki/Raz_Blanchard, section Hydrographie)."
    ),
)

GOLFE_DU_MORBIHAN = Pass(
    key="golfe_du_morbihan",
    name="Golfe du Morbihan, goulet de Port-Navalo",
    lat=47.5433,
    lon=-2.92,
    port="BREST",
    # The gulf lags the open sea, so its entrance floods past high water and
    # ebbs late: PM -2h is mid-flood and PM +4h mid-ebb with an hour of margin
    # either side.
    flood=_flood("HW", -2.0, 0.0),
    ebb=_ebb("HW", 4.0, 180.0),
    truth=(
        "Goulet d'un bassin fermé : le golfe, au nord de l'entrée, se remplit "
        "tant que la mer monte dehors, le flot entre vers le nord et le jusant "
        "sort vers le sud. Port-Navalo n'est pas dans TICON-4 ; sa PM tombe à "
        "quelques minutes de celle de Brest (M2 à 2° près dans la table des "
        "ports de référence SHOM), d'où Brest comme port de calage."
    ),
)

_ELBE_TRUTH = (
    "L'Elbe coule de Hambourg (E-SE) vers la mer du Nord (W-NW) : le flot "
    "remonte le chenal vers l'E-SE, le jusant le descend vers l'W-NW. À "
    "Cuxhaven le flot de surface s'établit environ 1h40 après la BM et le "
    "courant renverse après la PM (Lentz 1879, rééd. Die Küste 46, 1988, "
    "p. 221) : PM -2h est en plein flot, PM +4h en plein jusant."
)

ELBE_KUGELBAKE = Pass(
    key="elbe_kugelbake",
    name="Elbe, devant la Kugelbake (Cuxhaven)",
    lat=53.895,
    lon=8.69,
    port="CUXHAVEN",
    flood=_flood("HW", -2.0, 120.0),
    ebb=_ebb("HW", 4.0, 300.0),
    truth=_ELBE_TRUTH,
    fixture_atlas="BSH_AUSALT",
)

ELBE_OTTERNDORF = Pass(
    key="elbe_otterndorf",
    name="Elbe, chenal devant Otterndorf",
    lat=53.84,
    lon=8.85,
    port="CUXHAVEN",
    flood=_flood("HW", -2.0, 120.0),
    ebb=_ebb("HW", 4.0, 300.0),
    truth=_ELBE_TRUTH,
    fixture_atlas="BSH_CUXBRU",
)

AGDENES = Pass(
    key="agdenes",
    name="Trondheimsfjord, entrée d'Agdenes",
    lat=63.6228,
    lon=9.7845,
    port="TRONDHEIM",
    flood=_flood("HW", -3.0, 135.0),
    ebb=_ebb("HW", 3.0, 315.0),
    truth=(
        "Entrée d'un fjord de 130 km : il se remplit tant que la mer monte, le "
        "flot entre vers le SE (le fjord s'ouvre au SE d'Agdenes, vers "
        "Trondheim) et le jusant sort vers le NW. Calage sur la PM de "
        "Trondheim, au fond du même bassin."
    ),
    fixture_atlas="NORKYST_TRONDELAG",
)

MINAS_PASSAGE = Pass(
    key="minas_passage",
    name="Minas Passage (baie de Fundy)",
    lat=45.34,
    lon=-64.40,
    port="CAPE_DOR",
    flood=_flood("HW", -3.0, 90.0),
    ebb=_ebb("HW", 3.0, 270.0),
    truth=(
        "Seule entrée du Minas Basin, qui s'étend à l'est du passage : le "
        "bassin se remplit tant que la mer monte, le flot porte à l'est et le "
        "jusant à l'ouest. Calage sur la PM du cap d'Or, à l'entrée du Minas "
        "Channel."
    ),
    fixture_atlas="GOMOFS_FUNDY",
)

# Served from the private dataset: SHOM C2D and MARC (non redistributable),
# plus the Elbe, whose BSH atlas is served there too.
REAL_ATLAS_PASSES: tuple[Pass, ...] = (
    RAZ_DE_SEIN,
    FROMVEUR,
    GOULET_DE_BREST,
    CHENAL_DU_FOUR,
    RAZ_BLANCHARD,
    GOLFE_DU_MORBIHAN,
    ELBE_KUGELBAKE,
    ELBE_OTTERNDORF,
)

# Open atlases, small extracts committed under ``fixtures/atlas_open``.
OPEN_FIXTURE_PASSES: tuple[Pass, ...] = (ELBE_KUGELBAKE, ELBE_OTTERNDORF, AGDENES, MINAS_PASSAGE)

OPEN_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "atlas_open"
REAL_ATLAS_PATTERNS_FILE = Path(__file__).parent / "fixtures" / "real_atlas_patterns.txt"


# ---------------------------------------------------------------------------
# Tide events and angles
# ---------------------------------------------------------------------------

_EVENT_STEP = timedelta(minutes=5)


def tide_events(
    port: str, event: str, start: datetime = WINDOW_START, days: int = WINDOW_DAYS
) -> list[datetime]:
    """Every high (``"HW"``) or low (``"LW"``) water at ``port`` in the window.

    Turning points of the TICON-4 prediction sampled every 5 minutes, with
    the double tops of a shallow-water curve merged (two crests closer than
    three hours are one high water, its higher crest wins).
    """
    n = days * 24 * 12
    times = [start + i * _EVENT_STEP for i in range(n)]
    h = predict(times, REFERENCE_PORTS[port].constants)
    w = h if event == "HW" else -h
    turning = np.nonzero((w[1:-1] >= w[:-2]) & (w[1:-1] > w[2:]))[0] + 1
    picked: list[int] = []
    for i in turning:
        if picked and int(i - picked[-1]) * _EVENT_STEP < timedelta(hours=3):
            if w[i] > w[picked[-1]]:
                picked[-1] = int(i)
            continue
        picked.append(int(i))
    return [times[i] for i in picked]


def phase_times(pass_: Pass, phase: Phase) -> list[datetime]:
    return [t + timedelta(hours=phase.offset_h) for t in tide_events(pass_.port, phase.event)]


def angular_distance(a: float, b: float) -> float:
    """Smallest angle between two bearings, in [0, 180]."""
    return abs((a - b + 180.0) % 360.0 - 180.0)


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial great-circle bearing from point 1 to point 2, true degrees."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return math.degrees(math.atan2(y, x)) % 360.0


def offset_point(lat: float, lon: float, bearing: float, distance_nm: float) -> tuple[float, float]:
    """The point ``distance_nm`` from (lat, lon) along ``bearing``, flat earth (short legs)."""
    d_deg = distance_nm / 60.0
    lat2 = lat + d_deg * math.cos(math.radians(bearing))
    lon2 = lon + d_deg * math.sin(math.radians(bearing)) / math.cos(math.radians(lat))
    return lat2, lon2


# ---------------------------------------------------------------------------
# Querying the cascade through its public doors
# ---------------------------------------------------------------------------

# What the stub upstream stamps on its sea points. Never a source the cascade
# writes, so a point that keeps it was not overridden by any atlas.
DECOY_SOURCE = "openmeteo_smoc"


def bare_bundle(lat: float, lon: float, times: Sequence[datetime]) -> ForecastBundle:
    """The bundle ``get_tidal_stream`` hands the cascade: times, nothing else."""
    return ForecastBundle(
        lat=lat,
        lon=lon,
        start=min(times),
        end=max(times),
        sea=SeaSeries(
            points=tuple(
                SeaPoint(
                    time=t,
                    wave_height_m=None,
                    wave_period_s=None,
                    wave_direction_deg=None,
                    wind_wave_height_m=None,
                    swell_wave_height_m=None,
                )
                for t in times
            )
        ),
    )


class StubUpstream:
    """An Open-Meteo stand-in: steady wind, no wave, and no current of its own.

    Hourly on the whole hour, as Open-Meteo answers. Its sea points carry no
    current and the SMOC label, so a point that comes back with a current was
    written by the cascade and a point that kept the label was not touched.
    """

    def __init__(self, wind_kn: float = 12.0, wind_from_deg: float = 0.0) -> None:
        self.wind_kn = wind_kn
        self.wind_from_deg = wind_from_deg

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        first = start.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
        axis: list[datetime] = []
        t = first
        while t <= end + timedelta(hours=1):
            axis.append(t)
            t += timedelta(hours=1)
        wind = tuple(
            WindPoint(time=t, speed_kn=self.wind_kn, direction_deg=self.wind_from_deg, gust_kn=None)
            for t in axis
        )
        sea = tuple(
            SeaPoint(
                time=t,
                wave_height_m=None,
                wave_period_s=None,
                wave_direction_deg=None,
                wind_wave_height_m=None,
                swell_wave_height_m=None,
                current_source=DECOY_SOURCE,
            )
            for t in axis
        )
        requested = models or ["meteofrance_arome_france"]
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start,
            end=end,
            wind_by_model={m: WindSeries(model=m, points=wind) for m in requested},
            sea=SeaSeries(points=sea),
        )


@dataclass(frozen=True, slots=True)
class PhaseResult:
    """What the cascade served at one phase of one pass, over every tide of the window."""

    pass_key: str
    phase: Phase
    sources: tuple[str | None, ...]
    directions: tuple[float | None, ...]
    speeds: tuple[float | None, ...]
    times: tuple[datetime, ...]

    @property
    def mean_direction(self) -> float:
        d = np.deg2rad([x for x in self.directions if x is not None])
        return float(np.rad2deg(np.arctan2(np.sin(d).mean(), np.cos(d).mean())) % 360.0)

    @property
    def errors(self) -> list[float]:
        return [
            angular_distance(d, self.phase.expected_to_deg)
            for d in self.directions
            if d is not None
        ]

    def failures(self, tolerance_deg: float, min_speed_kn: float) -> list[str]:
        out: list[str] = []
        for t, s, d, src in zip(
            self.times, self.speeds, self.directions, self.sources, strict=True
        ):
            if src is None or src == DECOY_SOURCE or s is None or d is None:
                out.append(f"{t:%Y-%m-%d %H:%M}Z: no atlas current (source {src!r})")
                continue
            err = angular_distance(d, self.phase.expected_to_deg)
            if s < min_speed_kn:
                out.append(f"{t:%Y-%m-%d %H:%M}Z: {s:.2f} kt, under {min_speed_kn} kt ({src})")
            elif err > tolerance_deg:
                out.append(
                    f"{t:%Y-%m-%d %H:%M}Z: sets to {d:.0f}, expected "
                    f"{self.phase.expected_to_deg:.0f} +- {tolerance_deg:.0f} "
                    f"(off by {err:.0f}), {s:.2f} kt ({src})"
                )
        return out

    def summary(self) -> str:
        speeds = [s for s in self.speeds if s is not None]
        errs = self.errors
        srcs = sorted({str(s) for s in self.sources})
        return (
            f"{self.pass_key} {self.phase.label} ({self.phase.event}{self.phase.offset_h:+.1f}h): "
            f"expected {self.phase.expected_to_deg:.0f}, mean {self.mean_direction:.0f}, "
            f"max error {max(errs) if errs else float('nan'):.0f} deg, "
            f"speed {min(speeds) if speeds else float('nan'):.2f}-"
            f"{max(speeds) if speeds else float('nan'):.2f} kt, "
            f"n={len(self.times)}, source {', '.join(srcs)}"
        )


def stream_by_apply_atlases(adapter, pass_: Pass, phase: Phase) -> PhaseResult:
    """The cascade as ``get_tidal_stream`` runs it: ``apply_atlases`` on a bare series."""
    times = phase_times(pass_, phase)
    points = adapter.apply_atlases(bare_bundle(pass_.lat, pass_.lon, times), pass_.lat, pass_.lon)
    return _result(pass_, phase, times, points.sea.points)


async def stream_by_fetch(adapter, pass_: Pass, phase: Phase) -> PhaseResult:
    """The cascade as ``plan_passage`` reaches it: ``fetch`` through the upstream.

    One fetch per tide, a two-hour window around the instant, read at the
    upstream's hourly point nearest to it, as the engine reads a segment.
    """
    times = phase_times(pass_, phase)
    sources, dirs, speeds = [], [], []
    for t in times:
        bundle = await adapter.fetch(
            pass_.lat, pass_.lon, t - timedelta(hours=1), t + timedelta(hours=1)
        )
        p = min(bundle.sea.points, key=lambda sp: abs(sp.time - t))
        sources.append(p.current_source)
        dirs.append(p.current_direction_to_deg)
        speeds.append(p.current_speed_kn)
    return PhaseResult(pass_.key, phase, tuple(sources), tuple(dirs), tuple(speeds), tuple(times))


def _result(
    pass_: Pass, phase: Phase, times: list[datetime], points: Sequence[SeaPoint]
) -> PhaseResult:
    return PhaseResult(
        pass_key=pass_.key,
        phase=phase,
        sources=tuple(p.current_source for p in points),
        directions=tuple(p.current_direction_to_deg for p in points),
        speeds=tuple(p.current_speed_kn for p in points),
        times=tuple(times),
    )


# ---------------------------------------------------------------------------
# Through the passage engine: the sign of the current along the course
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class EngineSample:
    time: datetime
    along_kn: float | None
    direction_to_deg: float | None
    source: str | None


async def engine_along_track(
    adapter, pass_: Pass, phase: Phase, course_deg: float, *, tides: int = 4, leg_nm: float = 1.0
) -> list[EngineSample]:
    """What ``estimate_passage`` makes of the stream on a short leg through the pass.

    One leg of ``leg_nm`` centred on the pass and laid along ``course_deg``,
    departing so that its single segment is sampled at the phase instant, on
    the first ``tides`` events of the window (the springs). ``along_kn`` is
    over-ground minus through-water speed: the current the engine projected
    on the course, positive when it carries the boat. The wind blows on the
    beam so the polar answers anywhere.
    """
    from openwind_data.routing import Point, estimate_passage

    a = offset_point(pass_.lat, pass_.lon, (course_deg + 180.0) % 360.0, leg_nm / 2)
    b = offset_point(pass_.lat, pass_.lon, course_deg, leg_nm / 2)
    out: list[EngineSample] = []
    for t in phase_times(pass_, phase)[:tides]:
        report = await estimate_passage(
            [Point(lat=a[0], lon=a[1]), Point(lat=b[0], lon=b[1])],
            t - timedelta(minutes=5),
            "cruiser_30ft",
            segment_length_nm=10.0,
            adapter=adapter,
        )
        seg = report.segments[0]
        along = None if seg.sog_kn is None else seg.sog_kn - seg.boat_speed_kn
        out.append(EngineSample(t, along, seg.current_direction_to_deg, seg.current_source))
    return out
