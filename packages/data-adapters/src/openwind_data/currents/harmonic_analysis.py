# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tidal harmonic analysis: the inverse of :func:`harmonic.predict`.

Fits ``(amplitude, Greenwich phase G)`` per constituent to a time series by
linear least squares, in exactly the convention :func:`harmonic.predict`
reconstructs from::

    y(t) = Z0 + sum_i  H_i * f_i(t) * cos(sigma_i * t + V0_i(t) + u_i(t) - G_i)

Writing ``A_i = H_i cos G_i`` and ``B_i = H_i sin G_i`` makes the model linear
in ``(Z0, A_i, B_i)`` with regressors ``f_i cos(theta_i)`` and
``f_i sin(theta_i)``, where ``theta_i = sigma_i t + V0_i + u_i`` is computed by
the same Cartwright/Schureman code as the predictor. That shared code path is
the whole point of this module: constants produced here feed
:func:`harmonic.predict` without any convention translation, whatever the
source of the series (a forecast archive, a radar, a tide gauge).

Two things a short record needs, both standard (Schureman 1958, Foreman
1977), both implemented here:

- **Rayleigh selection** (:func:`select_constituents`): two constituents can
  only be separated when the record is longer than the beat period between
  them. ``M2`` and ``S2`` need 14.8 days, ``M2`` and ``N2`` 27.6 days, ``K1``
  and ``P1`` 182.6 days. The selection walks a priority list and keeps a
  constituent only when it is resolvable against every one already kept.
- **Constrained inference** (:class:`Inference`): a constituent that cannot be
  resolved is tied to a resolved one by a fixed amplitude ratio and phase lag
  taken from a reference atlas. The tied pair becomes a single packet with
  two unknowns, so the unresolved energy no longer folds into its neighbour
  and the reconstruction keeps the spring/neap modulation.

:class:`GridAnalysis` accumulates the normal equations time step by time
step for a whole grid, so an archive of any length streams through in
bounded memory. Its per-cell result is identical to :func:`analyze` on the
cell's series, which the tests check.

The module is numpy-only and is never imported by the runtime cascade; the
offline builders under ``scripts/`` are its callers.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

from openwind_data.currents.harmonic import (
    _NAME_TO_IDX,
    FREQS_DEG_PER_H,
    _astronomical_longitudes,
    _canonical,
    _equilibrium_argument,
    _nodal_corrections,
    _utc_to_mjd,
)

# Priority order for a shelf-sea current analysis: the semi-diurnal core, the
# diurnals, then the overtides that matter in estuaries, then the rest of the
# NOC-60 table. ``Z0`` (the mean) is always fitted and is not a constituent.
PRIORITY: tuple[str, ...] = (
    "M2", "S2", "N2", "K1", "O1", "M4", "MS4", "K2", "P1", "Q1", "MN4", "M6",
    "2N2", "NU2", "MU2", "L2", "2MS6", "MK4", "2MN6", "T2", "J1", "OO1", "MK3",
    "MO3", "MSF", "MM", "MF", "SA", "SSA", "2SM2", "LAM2", "S4", "SN4", "MSN2",
    "2SM6", "MSN6", "2MK6", "MSK6", "SK3", "SO3", "2Q1", "SIG1", "RO1", "CHI1",
    "PI1", "PHI1", "TH1", "PSI1", "S1", "M1", "MP1", "SO1", "OQ2", "MNS2",
    "OP2", "MKS2", "KJ2", "R2", "SK4", "M3",
)  # fmt: skip

# Which resolved constituent a missing one is tied to, in order of preference.
# Same family (semi-diurnal to semi-diurnal, diurnal to diurnal, overtide to
# overtide): the ratio and lag are then physically meaningful across a shelf.
INFERENCE_PARTNERS: dict[str, tuple[str, ...]] = {
    "S2": ("M2",),
    "N2": ("M2",),
    "K2": ("S2", "M2"),
    "NU2": ("N2", "M2"),
    "2N2": ("N2", "M2"),
    "L2": ("M2",),
    "MU2": ("M2",),
    "T2": ("S2", "M2"),
    "LAM2": ("M2",),
    "P1": ("K1",),
    "O1": ("K1",),
    "K1": ("O1",),
    "Q1": ("O1", "K1"),
    "J1": ("K1",),
    "OO1": ("K1",),
    "MS4": ("M4",),
    "MN4": ("M4",),
    "MK4": ("M4",),
    "2MS6": ("M6",),
    "2MN6": ("M6",),
    "MSF": ("MM", "MF"),
}


def frequency_deg_per_h(name: str) -> float:
    """Angular frequency of a constituent in degrees per hour (``Z0`` is 0)."""
    if name == "Z0":
        return 0.0
    canonical = _canonical(name)
    if canonical is None:
        raise KeyError(f"unknown constituent {name!r}")
    return FREQS_DEG_PER_H[_NAME_TO_IDX[canonical]]


def rayleigh_hours(a: str, b: str) -> float:
    """Record length (hours) needed to separate ``a`` from ``b`` (Rayleigh criterion)."""
    df = abs(frequency_deg_per_h(a) - frequency_deg_per_h(b))
    return float("inf") if df == 0.0 else 360.0 / df


def select_constituents(
    record_hours: float,
    candidates: Sequence[str] = PRIORITY,
    *,
    rayleigh: float = 1.0,
) -> tuple[str, ...]:
    """Constituents a record of ``record_hours`` can resolve, in priority order.

    A candidate is kept when its frequency is at least ``rayleigh * 360 /
    record_hours`` degrees per hour away from the mean (frequency 0) and from
    every constituent already kept. ``rayleigh=1.0`` is the classical
    criterion; values below 1 are permissive and above 1 conservative.
    """
    if record_hours <= 0:
        return ()
    min_df = rayleigh * 360.0 / record_hours
    kept: list[str] = []
    for name in candidates:
        canonical = _canonical(name)
        if canonical is None or canonical in kept:
            continue
        freq = frequency_deg_per_h(canonical)
        if freq < min_df:
            continue  # not separable from the mean
        if all(abs(freq - frequency_deg_per_h(k)) >= min_df for k in kept):
            kept.append(canonical)
    return tuple(kept)


@dataclass(frozen=True, slots=True)
class Inference:
    """Tie an unresolved constituent to a resolved one.

    ``amp_name = ratio * amp_reference`` and ``G_name = G_reference + lag_deg``.
    """

    name: str
    reference: str
    ratio: float
    lag_deg: float


def inferences_from_reference(
    reference: dict[str, tuple[float, float]],
    resolved: Iterable[str],
    wanted: Iterable[str],
    *,
    partners: dict[str, tuple[str, ...]] = INFERENCE_PARTNERS,
) -> tuple[Inference, ...]:
    """Build :class:`Inference` constraints from a reference set of constants.

    For each constituent in ``wanted`` that is not in ``resolved``, the first
    partner (per ``partners``) that is resolved and present in ``reference``
    provides the ratio and lag. Constituents with no usable partner, or with a
    zero-amplitude partner in the reference, are skipped silently: the caller
    can compare the result's ``inferred`` tuple with what it asked for.
    """
    ref = {c: v for raw, v in reference.items() if (c := _canonical(raw)) is not None}
    resolved_set = {c for raw in resolved if (c := _canonical(raw)) is not None}
    out: list[Inference] = []
    for raw in wanted:
        name = _canonical(raw)
        if name is None or name in resolved_set or name not in ref:
            continue
        for partner in partners.get(name, ()):
            if partner in resolved_set and partner in ref and ref[partner][0] > 0.0:
                amp_x, g_x = ref[name]
                amp_p, g_p = ref[partner]
                out.append(Inference(name, partner, amp_x / amp_p, (g_x - g_p) % 360.0))
                break
    return tuple(out)


def _arguments(
    times_utc: Sequence[datetime], names: Sequence[str]
) -> tuple[np.ndarray, np.ndarray]:
    """``theta`` (degrees) and nodal factor ``f`` per time and constituent.

    ``theta_i(t) = sigma_i * hours + V0_i + u_i`` is exactly the argument the
    predictor puts inside its cosine before subtracting ``G``.
    """
    mjd = np.array([_utc_to_mjd(t) for t in times_utc])
    mjdn = np.floor(mjd).astype(int)
    hrs = 24.0 * (mjd - mjdn)
    s, h, p, en, p1 = _astronomical_longitudes(mjdn)
    v_arr = _equilibrium_argument(s, h, p, p1)
    u_arr, f_arr = _nodal_corrections(p, en)
    idx = np.array([_NAME_TO_IDX[n] for n in names], dtype=int)
    sigma = np.array(FREQS_DEG_PER_H)[idx]
    theta = sigma[None, :] * hrs[:, None] + v_arr[:, idx] + u_arr[:, idx]
    return theta, f_arr[:, idx]


def design_matrix(
    times_utc: Sequence[datetime],
    constituents: Sequence[str],
    inferences: Sequence[Inference] = (),
) -> tuple[np.ndarray, tuple[str, ...]]:
    """Regressors for the linear fit: ``Z0``, then ``(cos, sin)`` per constituent.

    An inferred constituent adds ``ratio * f_x * cos(theta_x - lag)`` to its
    reference's cosine column and the sine counterpart to the sine column, so
    the packet stays a two-unknown problem. Returns ``(X, columns)`` with ``X``
    of shape ``(n_times, 1 + 2 * len(constituents))``.
    """
    names = [c for raw in constituents if (c := _canonical(raw)) is not None]
    if len(names) != len(constituents):
        unknown = [raw for raw in constituents if _canonical(raw) is None]
        raise KeyError(f"unknown constituents: {unknown}")
    if len(set(names)) != len(names):
        raise ValueError("duplicate constituents")
    by_ref: dict[str, list[Inference]] = {}
    for inf in inferences:
        ref = _canonical(inf.reference)
        name = _canonical(inf.name)
        if ref is None or name is None:
            raise KeyError(f"unknown constituent in inference {inf!r}")
        if ref not in names:
            raise ValueError(f"inference {inf.name}: reference {inf.reference} is not fitted")
        if name in names:
            raise ValueError(f"inference {inf.name}: constituent is already fitted")
        by_ref.setdefault(ref, []).append(inf)

    n = len(times_utc)
    cols = ["Z0"]
    x = np.zeros((n, 1 + 2 * len(names)))
    x[:, 0] = 1.0
    theta, f = _arguments(times_utc, names)
    rad = np.pi / 180.0
    for j, name in enumerate(names):
        cos_col = f[:, j] * np.cos(rad * theta[:, j])
        sin_col = f[:, j] * np.sin(rad * theta[:, j])
        for inf in by_ref.get(name, ()):
            theta_x, f_x = _arguments(times_utc, [_canonical(inf.name) or inf.name])
            arg = rad * (theta_x[:, 0] - inf.lag_deg)
            cos_col = cos_col + inf.ratio * f_x[:, 0] * np.cos(arg)
            sin_col = sin_col + inf.ratio * f_x[:, 0] * np.sin(arg)
        x[:, 1 + 2 * j] = cos_col
        x[:, 2 + 2 * j] = sin_col
        cols += [f"{name}_cos", f"{name}_sin"]
    return x, tuple(cols)


def _constants_from_coefficients(
    coef: np.ndarray, names: Sequence[str], inferences: Sequence[Inference]
) -> dict[str, tuple[float, float]]:
    out: dict[str, tuple[float, float]] = {}
    for j, name in enumerate(names):
        a, b = float(coef[1 + 2 * j]), float(coef[2 + 2 * j])
        out[name] = (float(np.hypot(a, b)), float(np.rad2deg(np.arctan2(b, a)) % 360.0))
    for inf in inferences:
        ref = _canonical(inf.reference) or inf.reference
        name = _canonical(inf.name) or inf.name
        amp, g = out[ref]
        out[name] = (inf.ratio * amp, (g + inf.lag_deg) % 360.0)
    return out


@dataclass(frozen=True, slots=True)
class AnalysisResult:
    """Constants fitted (and inferred) from one series, with fit diagnostics."""

    constants: dict[str, tuple[float, float]]
    z0: float
    resolved: tuple[str, ...]
    inferred: tuple[str, ...]
    n_samples: int
    record_hours: float
    rmse: float
    variance_explained: float
    coefficients: np.ndarray = field(repr=False)


def analyze(
    times_utc: Sequence[datetime],
    values: np.ndarray | Sequence[float],
    constituents: Sequence[str],
    inferences: Sequence[Inference] = (),
) -> AnalysisResult:
    """Fit ``constituents`` (plus ``inferences``) to one series.

    ``values`` may hold NaN for gaps; those samples are dropped. Raises
    ``ValueError`` when fewer finite samples remain than unknowns.
    """
    y = np.asarray(values, dtype=float)
    if y.shape != (len(times_utc),):
        raise ValueError("values must have one entry per time")
    x, _ = design_matrix(times_utc, constituents, inferences)
    mask = np.isfinite(y)
    if mask.sum() < x.shape[1]:
        raise ValueError(f"{int(mask.sum())} finite samples for {x.shape[1]} unknowns")
    coef, *_ = np.linalg.lstsq(x[mask], y[mask], rcond=None)
    fitted = x[mask] @ coef
    resid = y[mask] - fitted
    var_y = float(np.var(y[mask]))
    names = [_canonical(c) or c for c in constituents]
    mjd = [_utc_to_mjd(t) for t in times_utc]
    return AnalysisResult(
        constants=_constants_from_coefficients(coef, names, inferences),
        z0=float(coef[0]),
        resolved=tuple(names),
        inferred=tuple(_canonical(i.name) or i.name for i in inferences),
        n_samples=int(mask.sum()),
        record_hours=24.0 * (max(mjd) - min(mjd)) if mjd else 0.0,
        rmse=float(np.sqrt(np.mean(resid**2))),
        variance_explained=1.0 - float(np.var(resid)) / var_y if var_y > 0 else 0.0,
        coefficients=coef,
    )


class GridAnalysis:
    """Streaming least squares for many cells sharing the same time axis.

    Feed chunks of ``(times, values[n_times, n_cells])`` in any order with
    :meth:`add`; call :meth:`solve` once. Gaps (NaN) are allowed per cell:
    the shared normal matrix is corrected cell by cell for the samples the
    cell missed, so memory stays ``O(p^2)`` plus ``O(p^2)`` per gappy cell,
    never ``O(n_times)``.
    """

    def __init__(
        self,
        n_cells: int,
        constituents: Sequence[str],
        inferences: Sequence[Inference] = (),
    ) -> None:
        self.n_cells = n_cells
        self.names = tuple(_canonical(c) or c for c in constituents)
        self.inferences = tuple(inferences)
        self.p = 1 + 2 * len(self.names)
        self._xtx = np.zeros((self.p, self.p))
        self._xty = np.zeros((self.p, n_cells))
        self._yy = np.zeros(n_cells)
        self._ysum = np.zeros(n_cells)
        self._n_total = 0
        self._n_valid = np.zeros(n_cells, dtype=int)
        self._gap_xtx: dict[int, np.ndarray] = {}
        self._mjd_min = np.inf
        self._mjd_max = -np.inf

    def add(self, times_utc: Sequence[datetime], values: np.ndarray) -> None:
        """Accumulate one chunk; ``values`` is ``(n_times, n_cells)`` with NaN gaps."""
        y = np.asarray(values, dtype=float)
        if y.shape != (len(times_utc), self.n_cells):
            raise ValueError(f"values must be (n_times={len(times_utc)}, n_cells={self.n_cells})")
        x, _ = design_matrix(times_utc, self.names, self.inferences)
        finite = np.isfinite(y)
        y0 = np.where(finite, y, 0.0)
        self._xtx += x.T @ x
        self._xty += x.T @ y0
        self._yy += np.sum(y0 * y0, axis=0)
        self._ysum += np.sum(y0, axis=0)
        self._n_total += len(times_utc)
        self._n_valid += finite.sum(axis=0)
        gappy = np.where(~finite.all(axis=0))[0]
        for cell in gappy:
            rows = x[~finite[:, cell]]
            self._gap_xtx[int(cell)] = self._gap_xtx.get(int(cell), 0.0) + rows.T @ rows
        mjd = [_utc_to_mjd(t) for t in times_utc]
        self._mjd_min = min(self._mjd_min, min(mjd))
        self._mjd_max = max(self._mjd_max, max(mjd))

    @property
    def record_hours(self) -> float:
        return 24.0 * (self._mjd_max - self._mjd_min) if self._n_total else 0.0

    def solve(self, *, min_samples: int | None = None) -> GridResult:
        """Solve every cell. Cells with too few samples or a singular system get NaN."""
        need = max(self.p, min_samples or 0)
        k_all = len(self.names) + len(self.inferences)
        amp = np.full((k_all, self.n_cells), np.nan)
        phase = np.full((k_all, self.n_cells), np.nan)
        z0 = np.full(self.n_cells, np.nan)
        rmse = np.full(self.n_cells, np.nan)
        all_names = list(self.names) + [_canonical(i.name) or i.name for i in self.inferences]
        # Cells without gaps share one factorisation.
        full_cells = np.array(
            [c for c in range(self.n_cells) if c not in self._gap_xtx and self._n_valid[c] >= need],
            dtype=int,
        )
        if full_cells.size:
            coef = self._solve_block(self._xtx, self._xty[:, full_cells])
            self._fill(coef, full_cells, amp, phase, z0, rmse)
        for cell, gap in self._gap_xtx.items():
            if self._n_valid[cell] < need:
                continue
            coef = self._solve_block(self._xtx - gap, self._xty[:, [cell]])
            if coef is not None:
                self._fill(coef, np.array([cell]), amp, phase, z0, rmse)
        return GridResult(
            names=tuple(all_names),
            amp=amp,
            phase_deg=phase,
            z0=z0,
            rmse=rmse,
            n_valid=self._n_valid.copy(),
            record_hours=self.record_hours,
            resolved=self.names,
            inferred=tuple(_canonical(i.name) or i.name for i in self.inferences),
        )

    @staticmethod
    def _solve_block(xtx: np.ndarray, xty: np.ndarray) -> np.ndarray | None:
        try:
            return np.linalg.solve(xtx, xty)
        except np.linalg.LinAlgError:
            return None

    def _fill(
        self,
        coef: np.ndarray | None,
        cells: np.ndarray,
        amp: np.ndarray,
        phase: np.ndarray,
        z0: np.ndarray,
        rmse: np.ndarray,
    ) -> None:
        if coef is None:
            return
        z0[cells] = coef[0]
        for j, _name in enumerate(self.names):
            a, b = coef[1 + 2 * j], coef[2 + 2 * j]
            amp[j, cells] = np.hypot(a, b)
            phase[j, cells] = np.rad2deg(np.arctan2(b, a)) % 360.0
        for i, inf in enumerate(self.inferences):
            ref_j = self.names.index(_canonical(inf.reference) or inf.reference)
            k = len(self.names) + i
            amp[k, cells] = inf.ratio * amp[ref_j, cells]
            phase[k, cells] = (phase[ref_j, cells] + inf.lag_deg) % 360.0
        # Residual sum of squares from the normal equations:
        # RSS = y'y - 2 c'X'y + c'X'Xc, per cell, without revisiting the series.
        xty = self._xty[:, cells]
        rss = np.empty(cells.size)
        for i, cell in enumerate(cells):
            xtx = self._xtx - self._gap_xtx.get(int(cell), 0.0)
            c = coef[:, i]
            rss[i] = self._yy[cell] - 2.0 * c @ xty[:, i] + c @ xtx @ c
        rss = np.maximum(rss, 0.0)
        rmse[cells] = np.sqrt(rss / np.maximum(self._n_valid[cells], 1))


@dataclass(frozen=True, slots=True)
class GridResult:
    """Per-cell constants: ``amp[k, cell]`` and ``phase_deg[k, cell]`` for ``names[k]``."""

    names: tuple[str, ...]
    amp: np.ndarray
    phase_deg: np.ndarray
    z0: np.ndarray
    rmse: np.ndarray
    n_valid: np.ndarray
    record_hours: float
    resolved: tuple[str, ...]
    inferred: tuple[str, ...]

    def constants_at(self, cell: int) -> dict[str, tuple[float, float]]:
        """Constants of one cell in the ``{name: (amp, G)}`` form the predictor takes."""
        out: dict[str, tuple[float, float]] = {}
        for k, name in enumerate(self.names):
            a, g = float(self.amp[k, cell]), float(self.phase_deg[k, cell])
            if np.isfinite(a) and np.isfinite(g):
                out[name] = (a, g)
        return out


@dataclass(frozen=True, slots=True)
class Ellipse:
    """Tidal current ellipse of one constituent.

    ``semi_major`` and ``semi_minor`` in the input units (m/s), ``minor`` signed
    (positive = anticlockwise rotation), ``inclination_deg`` of the major axis
    measured anticlockwise from east, ``phase_deg`` Greenwich phase of
    maximum current along the major axis.
    """

    semi_major: float
    semi_minor: float
    inclination_deg: float
    phase_deg: float


def current_ellipse(u: tuple[float, float], v: tuple[float, float]) -> Ellipse:
    """Ellipse parameters from ``(amp, G)`` of the east and north components.

    Classic decomposition into counter-rotating circular components
    (Pugh 1987, Foreman 1978): with ``U = A_u e^{-i G_u}`` and
    ``V = A_v e^{-i G_v}``, the anticlockwise and clockwise radii are
    ``|U + iV| / 2`` and ``|U - iV| / 2``.
    """
    au, gu = u
    av, gv = v
    cu = au * np.exp(-1j * np.deg2rad(gu))
    cv = av * np.exp(-1j * np.deg2rad(gv))
    w_plus = 0.5 * (cu + 1j * cv)  # anticlockwise
    w_minus = 0.5 * (cu - 1j * cv)  # clockwise
    r_plus, r_minus = abs(w_plus), abs(w_minus)
    th_plus, th_minus = np.angle(w_plus), np.angle(w_minus)
    semi_major = r_plus + r_minus
    semi_minor = r_plus - r_minus
    # The clockwise phasor is the conjugate of ``w_minus``, so its angle is
    # ``-th_minus``: alignment of the two phasors gives the major axis at
    # ``(th_plus - th_minus) / 2`` and the maximum at ``G = -(th_plus + th_minus) / 2``.
    # ``(inclination, phase)`` is defined up to the simultaneous shift
    # ``(+180, +180)``: reversing the axis direction moves the maximum half a
    # period later. Normalising the inclination to [0, 180) therefore has to
    # carry the same multiple of 180 into the phase, or two ellipses of the
    # same current would read as anti-phased.
    inc_raw = np.rad2deg(0.5 * (th_plus - th_minus))
    k = np.floor(inc_raw / 180.0)
    inclination = inc_raw - 180.0 * k
    phase = (np.rad2deg(-0.5 * (th_plus + th_minus)) + 180.0 * k) % 360.0
    return Ellipse(float(semi_major), float(semi_minor), float(inclination), float(phase))
