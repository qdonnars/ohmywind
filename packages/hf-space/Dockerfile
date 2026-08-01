FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Vendored copies of the two local packages, populated by the sync workflow
# before push (see .github/workflows/sync-hf-space.yml). On HF, these are the
# code shipped to the Space repo — there is no monorepo context.
COPY vendor/data-adapters /app/data-adapters
COPY vendor/mcp-core /app/mcp-core

RUN pip install /app/data-adapters /app/mcp-core "uvicorn[standard]>=0.30" \
    "huggingface_hub[hf_xet]>=0.24"

# Pull the tidal atlas dataset at build time (MARC PREVIMER + SHOM Atlas C2D).
# The dataset is private so we need an HF token with read access. On HF
# Spaces, define the secret in Settings -> Variables and secrets -> Secrets:
#   HF_TOKEN  (User Access Token with read scope on Qdonnars/openwind-tidal-atlas)
# Runtime reads MARC subdirs via MARC_ATLAS_DIR and the SHOM Parquet+JSON via
# SHOM_C2D_DIR; both point at the same shared directory because the layout
# inside the dataset places SHOM artefacts at root next to the per-atlas MARC
# subdirs. The fetch script falls back gracefully (empty dir, runtime uses
# Open-Meteo SMOC only) when the secret is absent.
ENV HF_DATASET_ID=Qdonnars/openwind-tidal-atlas
ENV ATLAS_DATA_DIR=/app/data/atlas
ENV MARC_ATLAS_DIR=/app/data/atlas
ENV SHOM_C2D_DIR=/app/data/atlas
COPY fetch_atlases.py /tmp/fetch_atlases.py
RUN --mount=type=secret,id=HF_TOKEN,required=false \
    sh -c 'if [ -f /run/secrets/HF_TOKEN ]; then export HF_TOKEN="$(cat /run/secrets/HF_TOKEN)"; fi; \
           python /tmp/fetch_atlases.py'

# security.py is imported by app.py at boot — a missing COPY here is a hard
# crash on startup, not a degraded mode.
COPY app.py security.py /app/

EXPOSE 7860

CMD ["python", "/app/app.py"]
