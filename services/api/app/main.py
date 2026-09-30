"""Explain Your Data — API service.

Routes
  GET  /health                     liveness + which AI providers are configured
  POST /ai/plan                    question + schema -> validated tool plan        (LLM decides)
  POST /ai/explain                 question + computed results -> verified answer  (LLM explains)
  POST /ai/complete                generic writing task (narratives, rewrites, chart specs)
  POST /convert                    SPSS / Stata / SAS / Parquet / Feather -> CSV for the browser engine
  POST /datasets                   upload + server-side profile (large files)
  POST /datasets/{id}/analysis     run a deterministic analysis on a stored dataset
  POST /datasets/{id}/jobs         queue a heavy analysis on the worker (Redis/RQ)
  GET  /jobs/{job_id}              job status and result
  POST /datasets/{id}/python       Pro mode: run generated code in the sandbox (disabled unless ENABLE_SANDBOX=1)

The browser does the numbers for normal-size files; the server never sees rows unless the user uploads
a file here. AI endpoints only receive a column summary and computed results.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .ai import prompts, router, verify
from .auth import current_user
from .engine import analysis, profiler, readers, sandbox
from .storage import Storage

app = FastAPI(title="Explain Your Data API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
store = Storage()

# ---------------------------------------------------------------- rate limiting (per user/IP, in memory)
_hits: dict[str, deque] = defaultdict(deque)
AI_PER_MINUTE = int(os.environ.get("AI_REQUESTS_PER_MINUTE", "20"))


def ai_quota(request: Request, user=Depends(current_user)):
    key = (user or {}).get("sub") or (request.client.host if request.client else "anon")
    q, now = _hits[key], time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= AI_PER_MINUTE:
        raise HTTPException(429, "Too many AI requests. Try again in a minute.")
    q.append(now)
    return key


def _ai(task: str, system: str, messages: list[dict], want_json: bool):
    try:
        return router.generate(task, system, messages, want_json=want_json)
    except router.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except router.AIRateLimited as e:
        raise HTTPException(429, str(e))


# ---------------------------------------------------------------- models
class ToolSpec(BaseModel):
    name: str
    description: str = ""
    input_schema: dict | None = None


class PlanIn(BaseModel):
    question: str = Field(max_length=2000)
    schema_: str = Field(alias="schema", max_length=60000)
    history: list[dict] = []
    tools: list[ToolSpec]


class ExplainIn(BaseModel):
    question: str = Field(max_length=2000)
    schema_: str = Field(alias="schema", max_length=60000)
    history: list[dict] = []
    results: list[dict]


class CompleteIn(BaseModel):
    input: str | list[dict]
    json_: bool = Field(False, alias="json")
    tier: str = "default"


class AnalysisIn(BaseModel):
    name: str
    params: dict = {}


class CodeIn(BaseModel):
    code: str = Field(max_length=20000)


# ---------------------------------------------------------------- routes
@app.get("/health")
def health():
    r = router.routes()
    return {"ok": True, "ai": {task: [f"{x.provider}:{x.model}" for x in v] for task, v in r.items()}}


def _history(h: list[dict]) -> list[dict]:
    out = []
    for turn in h[-4:]:
        if turn.get("q") and turn.get("a"):
            out += [{"role": "user", "content": str(turn["q"])[:2000]}, {"role": "assistant", "content": str(turn["a"])[:4000]}]
    return out


@app.post("/ai/plan")
def ai_plan(body: PlanIn, _=Depends(ai_quota)):
    allowed = {t.name for t in body.tools}
    tool_text = "\n".join(f"- {t.name}: {t.description}" for t in body.tools)
    msg = f"<schema>\n{body.schema_}\n</schema>\n\nTools:\n{tool_text}\n\nQuestion: {body.question}"
    raw = _ai("plan", prompts.PLANNER, _history(body.history) + [{"role": "user", "content": msg}], True)
    plan = router.parse_json(raw) or {}
    calls = [c for c in plan.get("calls", []) if isinstance(c, dict) and c.get("tool") in allowed and isinstance(c.get("args", {}), dict)][:4]
    return {"goal": plan.get("goal", ""), "calls": calls}


@app.post("/ai/explain")
def ai_explain(body: ExplainIn, _=Depends(ai_quota)):
    results = verify.safe_results_json(body.results)
    msg = f"<schema>\n{body.schema_}\n</schema>\n\n<results>\n{results}\n</results>\n\nQuestion: {body.question}"
    messages = _history(body.history) + [{"role": "user", "content": msg}]
    out = router.parse_json(_ai("explain", prompts.EXPLAINER, messages, True)) or {}
    bad = verify.unverified_numbers(str(out.get("answer", "")), body.results, body.question)
    if bad:  # one repair round, then flag anything still unsupported
        messages += [{"role": "assistant", "content": str(out)}, {"role": "user", "content": prompts.REPAIR.format(bad=", ".join(bad))}]
        out = router.parse_json(_ai("explain", prompts.EXPLAINER, messages, True)) or out
        bad = verify.unverified_numbers(str(out.get("answer", "")), body.results, body.question)
    return {"answer": out.get("answer", ""), "show": out.get("show", []), "followups": out.get("followups", []), "unverified": bad}


@app.post("/ai/complete")
def ai_complete(body: CompleteIn, _=Depends(ai_quota)):
    task = {"quick": "quick", "complex": "complex"}.get(body.tier, "narrative")
    messages = [{"role": "user", "content": body.input}] if isinstance(body.input, str) else [
        {"role": m.get("role", "user"), "content": str(m.get("content", ""))} for m in body.input if m.get("role") in ("user", "assistant")]
    text = _ai(task, prompts.COMPLETE, messages, body.json_)
    return {"text": text, "json": router.parse_json(text) if body.json_ else None}


@app.post("/convert", response_class=PlainTextResponse)
async def convert(file: UploadFile = File(...)):
    try:
        frames = readers.read_table(file.filename or "upload", await file.read())
    except (readers.UnsupportedFile, ValueError) as e:
        raise HTTPException(415, str(e))
    first = next(iter(frames.values()))
    return readers.to_csv(first)


@app.post("/datasets")
async def upload_dataset(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    try:
        frames = readers.read_table(file.filename or "upload", data)
    except (readers.UnsupportedFile, ValueError) as e:
        raise HTTPException(415, str(e))
    out = []
    for name, df in frames.items():
        ds_id = store.save_frame(user, name, df)
        out.append({"id": ds_id, "name": name, "profile": profiler.json_safe(profiler.profile(df))})
    return {"datasets": out}


@app.post("/datasets/{ds_id}/analysis")
def run_analysis(ds_id: str, body: AnalysisIn, user=Depends(current_user)):
    df = store.load_frame(user, ds_id)
    try:
        return analysis.run(df, body.name, body.params)
    except KeyError as e:
        raise HTTPException(400, str(e))


@app.post("/datasets/{ds_id}/jobs")
def queue_job(ds_id: str, body: AnalysisIn, user=Depends(current_user)):
    from .worker import enqueue

    store.load_frame(user, ds_id)  # authorisation check
    return {"job_id": enqueue(store.path_for(user, ds_id), body.name, body.params)}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    from .worker import status

    return status(job_id)


@app.post("/datasets/{ds_id}/python")
def run_code(ds_id: str, body: CodeIn, user=Depends(current_user)):
    store.load_frame(user, ds_id)
    try:
        return sandbox.run_python(body.code, store.csv_path(user, ds_id))
    except sandbox.UnsafeCode as e:
        raise HTTPException(400, str(e))
