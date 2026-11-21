# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Wait until a Hugging Face Space serves a given commit, then smoke it.

``git push`` to a Space only means the Hub accepted the files. The Docker
build and the app's start come after, out of the workflow's sight: a build
that fails or an app that crashes at boot used to leave the sync job green.
This script closes that gap, in two steps.

1. Poll the Space's runtime (``/api/spaces/<id>/runtime``) until it is
   ``RUNNING`` on the pushed commit. The runtime's ``sha`` is the commit the
   serving container was built from: while the new one builds and starts,
   the old one keeps serving (``RUNNING_BUILDING``, ``RUNNING_APP_STARTING``)
   under the old ``sha``, so a stage alone would declare victory too early.
   A build, config or runtime error fails the job, with a link to the logs.
2. Smoke every URL given: ``/healthz`` answers ``"status": "ok"`` (the tidal
   atlases and the land mask are loaded), ``/`` serves the landing page, and
   ``/mcp`` answers an MCP ``initialize``. Nothing here calls Open-Meteo, so
   a deployment costs no forecast quota.

Standard library only, so the runner needs nothing installed. Exits 0 when
live and healthy, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

# Stages that end the wait in failure. NO_APP_FILE and CONFIG_ERROR mean the
# Space cannot even try; the other two are a build or a boot that failed.
ERROR_STAGES = {"BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE"}
# Stages that only a deliberate action produces: waiting would not help.
HALTED_STAGES = {"STOPPED", "PAUSED"}
# Stages that show the Hub has taken the push in hand.
PROGRESS_STAGES = {"BUILDING", "RUNNING_BUILDING", "APP_STARTING", "RUNNING_APP_STARTING"}
# Right after the push the runtime can still describe the previous state,
# an error included (a push that fixes a broken Space starts from one). An
# error counts once the new build has been seen moving, or after this long.
ERROR_GRACE_S = 300

MCP_INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "ohmywind-deploy-check", "version": "1"},
    },
}


def _request(
    url: str, *, token: str | None = None, body: dict | None = None, timeout: float = 30
) -> tuple[int, str]:
    headers = {"User-Agent": "ohmywind-deploy-check"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json, text/event-stream"
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
        return 0, str(error)


def _annotate(level: str, message: str) -> None:
    """A GitHub annotation on the run when in Actions, a plain line otherwise."""
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::{level}::{message}", flush=True)
    else:
        print(f"{level.upper()}: {message}", flush=True)


def wait_until_live(
    space: str, sha: str, token: str | None, timeout_s: float, interval_s: float
) -> bool:
    url = f"https://huggingface.co/api/spaces/{space}/runtime"
    logs = f"https://huggingface.co/spaces/{space}?logs=build"
    start = time.monotonic()
    seen_progress = False
    last = None
    while True:
        elapsed = time.monotonic() - start
        status, text = _request(url, token=token)
        if status == 200:
            runtime = json.loads(text)
            stage, running_sha = runtime.get("stage"), runtime.get("sha") or ""
            state = (stage, running_sha[:7])
            if state != last:
                print(f"[{elapsed:5.0f}s] stage={stage} serving={running_sha[:7]}", flush=True)
                last = state
            if stage == "RUNNING" and running_sha == sha:
                print(f"Live on {sha[:7]} after {elapsed:.0f}s.", flush=True)
                return True
            seen_progress = seen_progress or stage in PROGRESS_STAGES
            if stage in ERROR_STAGES and (seen_progress or elapsed > ERROR_GRACE_S):
                _annotate(
                    "error", f"Space {space} is in {stage} after the push of {sha[:7]}: {logs}"
                )
                return False
            if stage in HALTED_STAGES:
                _annotate("error", f"Space {space} is {stage}: restart it from the Hub ({logs})")
                return False
        else:
            print(f"[{elapsed:5.0f}s] runtime API answered {status}: {text[:200]}", flush=True)
        if elapsed > timeout_s:
            _annotate(
                "error",
                f"Space {space} not live on {sha[:7]} after {timeout_s:.0f}s "
                f"(last seen: {last}): {logs}",
            )
            return False
        time.sleep(interval_s)


def _check(base: str, path: str, body: dict | None, expect) -> str | None:
    """None when ``expect`` accepts the answer, else what went wrong."""
    status, text = _request(base + path, body=body)
    if status != 200:
        return f"{path} answered {status}: {text[:200]}"
    return expect(text)


def _health(text: str) -> str | None:
    try:
        health = json.loads(text)
    except ValueError:
        return f"/healthz is not JSON: {text[:200]}"
    if health.get("status") != "ok":
        return f"/healthz says {health.get('status')}: {health.get('problems')}"
    return None


def _landing(text: str) -> str | None:
    return None if "<html" in text and "{{" not in text else "/ is not the rendered landing page"


def _mcp(text: str) -> str | None:
    return None if '"serverInfo"' in text else f"/mcp initialize gave no serverInfo: {text[:200]}"


def smoke(base: str, attempts: int, pause_s: float) -> bool:
    """Every check on ``base``, each retried: a proxy can lag the flip."""
    base = base.rstrip("/")
    checks = (
        ("/healthz", None, _health),
        ("/", None, _landing),
        ("/mcp", MCP_INITIALIZE, _mcp),
    )
    healthy = True
    for path, body, expect in checks:
        for attempt in range(1, attempts + 1):
            problem = _check(base, path, body, expect)
            if problem is None:
                print(f"ok   {base}{path}", flush=True)
                break
            if attempt == attempts:
                _annotate("error", f"{base}: {problem}")
                healthy = False
            else:
                time.sleep(pause_s)
    return healthy


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--space", required=True, help="owner/name of the Space")
    parser.add_argument("--sha", required=True, help="the Space commit that was pushed")
    parser.add_argument(
        "--url", action="append", default=[], help="a base URL to smoke (repeatable)"
    )
    parser.add_argument("--timeout", type=float, default=1800, help="seconds to wait for live")
    parser.add_argument("--interval", type=float, default=20, help="seconds between polls")
    parser.add_argument("--attempts", type=int, default=6, help="tries per smoke check")
    args = parser.parse_args(argv)

    token = os.environ.get("HF_TOKEN") or None
    if not wait_until_live(args.space, args.sha, token, args.timeout, args.interval):
        return 1
    results = [smoke(url, args.attempts, pause_s=10) for url in args.url]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
