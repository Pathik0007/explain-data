# Explain Your Data

Upload any data. Ask it anything. Clean → Understand → Analyze → Visualize → Explain → Report → Share.

**Live app:** https://explain-your-data.onrender.com (free hosting; the first load can take up to a minute)

**Project page:** https://pathik0007.github.io/explain-data/

**Core principle:** LLMs decide *what* analysis should happen. Deterministic code (JavaScript in the browser, pandas/SciPy/statsmodels on the server) performs it. A validator checks the numbers. Then the LLM explains the verified result. The model is never allowed to invent a figure: `/ai/explain` rejects answers containing numbers that are not in the computed results, asks the model to repair the answer once, and flags anything that still doesn't match.

## What's in this repo

```
client-src/          The analysis workspace (vanilla JS, no build step). Runs entirely in the browser.
  engine.js          parsing, type inference, dataset model, 14 replayable cleaning ops (+ pandas & R codegen), aggregation, joins
  stats.js           descriptive stats, t/ANOVA/chi²/Mann-Whitney/Kruskal/Jarque-Bera, OLS, k-means, PCA, forecasting, Cronbach's α
  insights.js        profiling, 0-100 health score, issue detection with fixes, "Discover", text-document analysis
  analysis.js        15 analyses returning verified result blocks {summary, stats, table, chart, code, plan}
  charts.js          chart spec → validated Plotly figure; chart validator; NL → chart spec; Python/R chart code
  ask.js             local intent engine + Claude tool loop + server plan→compute→explain loop
  io.js              CSV/TSV/TXT/Excel/ODS/JSON/NDJSON/GeoJSON/XML/ZIP/DOCX/PDF/Markdown/HTML readers; SPSS/Stata/SAS/Parquet via the server
  app*.js            UI: landing, overview, discover, clean, analyze, visualize, ask, dashboard, report, ⌘K palette
apps/web/            Next.js: serves the workspace, proxies AI + conversion to the API (keys stay server-side), security headers
services/api/        FastAPI: AI router (GPT / Claude Sonnet / Claude Opus), number verifier, pandas engine, sandbox, worker, storage, auth
  app/db/schema.sql  Postgres schema (projects, datasets, lineage versions, conversations, jobs, reports, usage, subscriptions)
  tests/             pytest: engine accuracy, number verification, sandbox safety, API contracts (17 tests)
  evals/             golden-question harness + the three sample datasets as CSV
scripts/build_client.py   bundles client-src into apps/web/public/app.html (or a single-file artifact)
docs/                     GitHub Pages project page (screenshots, architecture, validator); not a copy of the app
```

## Run locally

```bash
cp .env.example .env                        # add ANTHROPIC_API_KEY and/or OPENAI_API_KEY
python3 scripts/build_client.py             # bundle the workspace into apps/web/public/app.html
docker compose up --build                   # web :3000, api :8000, worker, postgres, redis
```

Without Docker:

```bash
cd services/api && pip install -r requirements.txt && uvicorn app.main:app --reload     # :8000
cd apps/web && npm install && API_URL=http://localhost:8000 npm run dev                   # :3000
cd services/api && pytest -q                                                              # 17 passed
```

With no AI keys the app still works: the AI endpoints return 503 and the browser falls back to its built-in engine.

## Deploy ("make it live")

| Piece | Recommended | Notes |
|---|---|---|
| Web | Vercel | Import `apps/web`, set `API_URL`. Build: `npm run build`. |
| API + worker | Render, Railway or Fly.io | Deploy `services/api/Dockerfile` twice: one web service, one worker (`rq worker eyd --url $REDIS_URL`). |
| Database + auth | Supabase | Run `schema.sql` (includes row-level security). Set `SUPABASE_JWT_SECRET` on the API. |
| Queue | Upstash Redis | `REDIS_URL` |
| Files | Cloudflare R2 | `S3_BUCKET`, `S3_ENDPOINT`, keys. No egress fees. |
| Code sandbox | E2B / Modal / Daytona | Keep `ENABLE_SANDBOX=0` on the web API; run Pro-mode code only on an isolated host. |
| Billing | Stripe | Tables `usage` and `subscriptions` are ready; meter credits per `kind`. |

### GitHub Pages (project page)

Settings → Pages → Build and deployment: Source **Deploy from a branch**, Branch **main**, folder **/docs**. The page is published at `https://pathik0007.github.io/explain-data/` and links to the live app.

### Render (Blueprint)

`render.yaml` defines two free web services: `explain-your-data` (Next.js, served at `https://explain-your-data.onrender.com`) and `eyd-api` (FastAPI). In Render choose New → Blueprint, pick this repo, and set `API_URL=https://eyd-api.onrender.com` on the web service. Add `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` on `eyd-api` to turn on AI answers. Render subdomains are global, so if `explain-your-data` is already taken it will append a suffix.

Custom domain: add it on the web service in Render (Settings → Custom Domains) or in Vercel.

## Architecture

```
Browser (client-src)                       Next.js (apps/web)            FastAPI (services/api)
 parse → profile → clean → analyze   ─┐    /api/ai/*   ──proxy──▶   /ai/plan     GPT (planner)
 charts, report, exports               │    /api/convert ─proxy──▶   /ai/explain  Claude Sonnet (+ verifier)
 Ask: question + column summary ───────┘                              /ai/complete Sonnet / Opus / fast model
      ◀── plan (tool calls)                                           /convert     SPSS/Stata/SAS/Parquet → CSV
      run tools locally on the rows                                   /datasets    big files, pandas engine, RQ jobs
      results ──▶ verified answer                                     Postgres · Redis · object storage
```

Rows never leave the browser for normal use. The AI sees the schema summary and computed results only. Every prompt wraps file content in tags marked as untrusted, which protects against prompt injection hidden in cells.

## Built vs. roadmap (against the product plan)

**Built (MVP + most of v1.5):** upload of 20+ formats including ZIP and Google Forms exports; automatic profiling and health score; Discover with ranked, evidence-backed insights; cleaning with preview, undo/redo, lineage and Python/R export; EDA and statistical tests; regression; forecasting with intervals; k-means segments; Likert/survey analysis; "explain a change"; a chart builder with validator and natural-language input; Ask with follow-ups and "explain like…"; dashboards with filters; a report builder in five styles with HTML/PDF/Markdown export; multi-file relationship detection and joins; ⌘K palette; Beginner/Pro modes; dark mode; mobile layout; AI router with fallbacks; number verification; sandbox; job queue; schema; tests; evals.

**Next (v2):** projects and version history persisted to Postgres (schema ready, UI currently in-memory); sign-in UI with Supabase; public share links `/story/{slug}` and embeddable charts; DOCX/PPTX export; Google Sheets, Drive and database connectors; scheduled reports; team workspaces; Stripe billing with credits; the data gallery and SEO example pages.
