"""
FastAPI wrapper for the Python scraper — intended for deployment on Render.

This file is NOT used in the current local-development setup. It exists as
a ready-to-deploy service for when you want to move the Python scraper off
the GitHub Actions runner and onto a persistent cloud host.

─── When to use this ────────────────────────────────────────────────────────
Use this if you encounter any of these pain points with local development:
  • The devcontainer firewall allowlist becomes too large to manage
  • WSL2 Playwright instability causes frequent test failures
  • You want the admin scraper tab to work from the deployed Vercel app
    (without a local devcontainer running)

─── How to deploy on Render ─────────────────────────────────────────────────
1. Add fastapi and uvicorn to a separate requirements file:
       echo "fastapi>=0.110\nuvicorn[standard]>=0.29" > scraper/render-requirements.txt

2. Create a new Web Service on render.com:
   - Root directory: scraper/
   - Build command: pip install -r requirements.txt -r render-requirements.txt &&
                    playwright install --with-deps chromium
   - Start command: uvicorn app:app --host 0.0.0.0 --port $PORT
   - Instance type: Starter ($7/mo) — free tier (512 MB RAM) may OOM on Playwright

3. Set environment variables on Render:
   - SCRAPER_SECRET   Same secret used by the Astro app and GitHub Actions

4. Update the Astro scrape API (src/pages/api/admin/scrape.ts):
   - Set SCRAPER_SERVICE_URL env var to your Render service URL
   - In runPythonScraper(), replace the child_process.spawn() call with:

       const res = await fetch(`${process.env.SCRAPER_SERVICE_URL}/scrape`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'x-scraper-secret': process.env.SCRAPER_SECRET ?? '',
         },
         body: JSON.stringify({ url }),
         signal: AbortSignal.timeout(PYTHON_TIMEOUT_MS),
       });
       if (!res.ok) throw new Error(await res.text());
       return res.json() as Promise<RawJob[]>;

   - Keep the subprocess fallback for local dev (when SCRAPER_SERVICE_URL is unset).
     See the existing comment block in runPythonScraper() for the conditional logic.

5. Update the GitHub Actions workflow (.github/workflows/scheduled-scrape.yml):
   - Remove the Node build + server steps (they are only needed while running locally)
   - Set SCRAPER_SERVICE_URL and APP_URL (Vercel) in the workflow env
   - Update batch_run.py to use SCRAPER_SERVICE_URL for /scrape and APP_URL for /upload
   - See the migration note at the top of scraper/batch_run.py for details

─── Security ────────────────────────────────────────────────────────────────
All endpoints require the X-Scraper-Secret header to match the SCRAPER_SECRET
environment variable. Keep the secret out of version control.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# These imports require fastapi and uvicorn to be installed.
# They are NOT in scraper/requirements.txt to avoid pulling them into
# the devcontainer. Add them to scraper/render-requirements.txt instead.
try:
    import uvicorn
    from fastapi import FastAPI, Header, HTTPException, Request
    from fastapi.responses import JSONResponse
except ImportError:
    print(
        "fastapi and uvicorn are not installed.\n"
        "This file is only used for Render deployment.\n"
        "Install them with: pip install fastapi uvicorn[standard]",
        file=sys.stderr,
    )
    sys.exit(1)

SCRAPER_SECRET = os.environ.get("SCRAPER_SECRET", "")
SCRAPER_MAIN = Path(__file__).parent / "main.py"

app = FastAPI(title="NonNativeWorks scraper service", docs_url=None, redoc_url=None)


def _verify_secret(x_scraper_secret: str | None) -> None:
    if not SCRAPER_SECRET:
        raise HTTPException(500, "SCRAPER_SECRET not configured on this server")
    if x_scraper_secret != SCRAPER_SECRET:
        raise HTTPException(401, "Invalid or missing X-Scraper-Secret header")


@app.post("/scrape")
async def scrape(
    request: Request,
    x_scraper_secret: str | None = Header(default=None),
) -> JSONResponse:
    """
    Runs main.py <url> and returns the RawJob[] JSON array.
    Mirrors the subprocess call in src/pages/api/admin/scrape.ts → runPythonScraper().
    """
    _verify_secret(x_scraper_secret)

    body = await request.json()
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(400, "Missing field: url")

    result = subprocess.run(
        [sys.executable, str(SCRAPER_MAIN), url],
        capture_output=True,
        text=True,
        timeout=700,  # 10+ min for njoyn
    )

    if result.returncode != 0:
        raise HTTPException(
            500,
            f"Scraper exited with code {result.returncode}. {result.stderr.strip()}",
        )

    import json

    try:
        jobs = json.loads(result.stdout)
    except json.JSONDecodeError as err:
        raise HTTPException(
            500, f"Scraper returned invalid JSON. {result.stderr.strip()}"
        ) from err

    return JSONResponse(content=jobs)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
