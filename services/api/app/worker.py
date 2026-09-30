"""Background jobs for heavy analyses (Redis + RQ). Run a worker with:  rq worker eyd --url $REDIS_URL"""
from __future__ import annotations

import os


def _queue():
    from redis import Redis
    from rq import Queue

    return Queue("eyd", connection=Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379")), default_timeout=600)


def run_job(parquet_path: str, name: str, params: dict) -> dict:
    import pandas as pd

    from .engine import analysis

    return analysis.run(pd.read_parquet(parquet_path), name, params)


def enqueue(parquet_path: str, name: str, params: dict) -> str:
    return _queue().enqueue(run_job, parquet_path, name, params, result_ttl=3600).id


def status(job_id: str) -> dict:
    from rq.job import Job

    job = Job.fetch(job_id, connection=_queue().connection)
    s = job.get_status()
    return {"id": job_id, "status": str(s), "result": job.result if s == "finished" else None, "error": str(job.exc_info)[-500:] if s == "failed" else None}
