# Screenshots

Hero assets referenced from the READMEs and the Starlette landing of the HF
Space.

- `plan.png` the OhMyWind passage view on
  [ohmywind.fr](https://ohmywind.fr) (5 waypoints, ETA, complexity score).
  Used as the hero image in the root README, the HF Space README, and the
  Starlette landing. Replace by `plan.gif` (animated demo) later update
  the `<img src="…">` in
  [packages/hf-space/app.py](../../packages/hf-space/app.py) and the
  markdown references in the two READMEs.

Both READMEs and the Starlette landing reference the file via the GitHub raw
URL on `main` so the image resolves on huggingface.co and from the live HF
Space without extra plumbing.
