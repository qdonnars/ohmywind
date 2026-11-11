FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Vendored copies of the two local packages, populated by the sync workflow
# before push (see .github/workflows/sync-hf-space.yml). On HF, these are the
# code shipped to the Space repo — there is no monorepo context.
COPY vendor/data-adapters /app/data-adapters
COPY vendor/api /app/api
COPY vendor/mcp-core /app/mcp-core
# OhMyWind's version, which openwind-mcp-core takes at build time from
# ../web/package.json (see its pyproject): the only file of the web package
# the Space needs.
COPY vendor/web/package.json /app/web/package.json

RUN pip install /app/data-adapters /app/api /app/mcp-core "uvicorn[standard]>=0.30" \
    "huggingface_hub[hf_xet]>=0.24"

# Pull the tidal atlas dataset at build time (MARC PREVIMER + SHOM Atlas C2D).
# The dataset is private so we need an HF token with read access.
#
# It has to STAY private. It holds raw MARC PREVIMER NetCDF, which we are
# allowed to use under a no-redistribution commitment, and flipping the
# dataset to public would break that commitment in one click. fetch_atlases.py
# prints a loud warning at build time when the visibility has changed. On HF
# Spaces, define the secret in Settings -> Variables and secrets -> Secrets:
#   HF_TOKEN  (User Access Token with read scope on Qdonnars/openwind-tidal-atlas)
# Runtime reads MARC subdirs via MARC_ATLAS_DIR and the SHOM Parquet+JSON via
# SHOM_C2D_DIR; both point at the same shared directory because the layout
# inside the dataset places SHOM artefacts at root next to the per-atlas MARC
# subdirs.
#
# The build FAILS when the atlases do not come down (no secret, an expired
# token, the dataset unreachable or incomplete): an image without them plans
# the coast on Open-Meteo's 8 km global current and looks healthy from
# outside. ALLOW_MISSING_ATLASES=1 is the explicit escape hatch for a local
# build or a fork without access to the dataset:
#   docker build --build-arg ALLOW_MISSING_ATLASES=1 .
# It is kept in the runtime environment too, where the server logs at ERROR
# when it starts without atlases it was not allowed to miss. The secret mount
# stays required=false so that the escape hatch works without a secret; the
# script, not the mount, is what refuses a build that has none.
ARG ALLOW_MISSING_ATLASES=0
ARG REQUIRED_ATLASES=""
ENV ALLOW_MISSING_ATLASES=${ALLOW_MISSING_ATLASES}
ENV HF_DATASET_ID=Qdonnars/openwind-tidal-atlas
ENV ATLAS_DATA_DIR=/app/data/atlas
ENV MARC_ATLAS_DIR=/app/data/atlas
ENV SHOM_C2D_DIR=/app/data/atlas
COPY fetch_atlases.py /tmp/fetch_atlases.py
RUN --mount=type=secret,id=HF_TOKEN,required=false \
    sh -c 'if [ -f /run/secrets/HF_TOKEN ]; then export HF_TOKEN="$(cat /run/secrets/HF_TOKEN)"; fi; \
           python /tmp/fetch_atlases.py'

# The entry point, and nothing else: everything it used to carry lives in the
# two packages installed above. security.py moved into openwind_api.
COPY app.py /app/

# Landing assets (the demo video's poster). Served from this origin by the
# /static route, so that a visit loads nothing from YouTube until play.
COPY static /app/static

EXPOSE 7860

CMD ["python", "/app/app.py"]
