# openwind-data

Pure Python domain logic for OhMyWind: marine data adapters, polars, routing, complexity scoring.

Cloud-agnostic no dependency on Gradio, FastMCP, or any deployment runtime. Reused by `openwind-mcp-core` and any future deployment wrapper.

## Install (dev)

```bash
uv sync --all-extras
```

## Test

```bash
uv run pytest
```

## Lint & format

```bash
uv run ruff check .
uv run ruff format .
```

## References

### Wave-induced slowdown (`wave_derate`)

`routing.passage.wave_derate(hs_m, twa_deg)` returns a multiplicative speed
factor in waves. Formula:

```
derate = max(floor, 1 - k * Hs^p * cos²(TWA / 2))
```

Defaults: `k=0.05`, `p=1.75`, `floor=0.5`. Justification:

- **Multiplicative-on-polar form, head-seas worst case, vanishing in following seas.**
  Matches the structure of the ORC VPP added-resistance term, where the wave
  direction dependency `f(μT) = cos(μT) / cos(40°)` peaks head-on and decays
  toward the stern.
  Source: *Offshore Racing Congress, "ORC VPP Documentation 2023", §6.8 "Added
  Resistance in Waves, RAW", eq. 6.62 and eq. 6.69, pp. 75–76.*
  <https://orc.org/uploads/files/ORC-VPP-Documentation-2023.pdf>

- **Power `p=1.75` on Hs.** Empirical exponent commonly quoted in seakeeping for
  added resistance vs significant wave height between the linear regime and
  the strict `Hs²` energy scaling that follows from integrating a
  Pierson-Moskowitz / Bretschneider spectrum × RAO. Used as the conservative
  midpoint here.
  Sources:
  - *ITTC Recommended Procedures 7.5-02-07-02.2 "Prediction of Power Increase
    in Irregular Waves from Model Test", §3 (added resistance scaling with
    `Hs²` via spectrum integration).*
    <https://www.ittc.info/media/8061/75-02-07-022.pdf>
  - *Pierson, W. J. & Moskowitz, L. (1964), "A proposed spectral form for
    fully developed wind seas based on the similarity theory of S. A.
    Kitaigorodskii", J. Geophys. Res. 69(24), 5181–5190.*

- **Coefficient `k=0.05`.** Calibrated qualitatively to give cruising-realistic
  derates: at `Hs=2 m` head-on, factor ≈ 0.83 (≈17% loss). At `Hs=1 m` head-on,
  ≈ 0.95 (≈5% loss). At `Hs=3 m` head-on, ≈ 0.65. These magnitudes match the
  ranges reported for ~10 m cruisers in:
  - *Gerritsma, J., Onnink, R., Versluis, A. (1981), "Geometry, Resistance and
    Stability of the Delft Systematic Yacht Hull Series", Int. Shipbuilding
    Progress 28(328) Delft series resistance-in-waves data.*
  - *Keuning, J. A. & Vermeulen, K. J. (2003), "On the Influence of the
    Sailing Yacht Hull Form on the Added Resistance in Waves", 16th HISWA
    Symposium on Yacht Design.*

  This is the sole *uncalibrated* parameter and should be revisited if real-world
  passage timings disagree systematically from the Mediterranean.

- **Floor `0.5`.** Hard physical lower bound: even in a storm the polar already
  collapses (TWS clamped to grid; sail area reefed implicitly); preventing
  derate below 50% avoids piling two pessimistic effects into a non-physical
  near-zero speed.

- **Angular factor `cos²(TWA/2)`.** Equivalent to `(1 + cos TWA) / 2`: a smooth
  half-cosine window peaking at TWA=0° (head seas) and zero at TWA=180°
  (following seas). Captures the well-documented qualitative pattern that
  added resistance is dominated by head-sea pitching, while a yacht surfing
  down-seas effectively gains time. Direction dependence is consistent with
  ORC eq. 6.69 (which uses linear `cos`, a near-equivalent shape at the
  cruising angles of interest).

The flag `use_wave_correction: bool = False` keeps this off by default. When
on, sea-state from the adapter (`bundle.sea`) is consumed; when sea data is
missing, the per-segment derate falls back to `1.0` and `hs_m` is reported as
`None`.
