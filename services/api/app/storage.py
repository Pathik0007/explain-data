"""Dataset storage. Local disk in development; S3-compatible object storage (Cloudflare R2, AWS S3) in production.

Layout: {user}/{dataset_id}/original.parquet (+ processed/, exports/). Postgres stores metadata only.
Every read checks that the dataset belongs to the requesting user.
"""
from __future__ import annotations

import os
import pathlib
import re
import uuid

import pandas as pd
from fastapi import HTTPException

SAFE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class Storage:
    def __init__(self):
        self.root = pathlib.Path(os.environ.get("STORAGE_DIR", "./data")).resolve()
        self.bucket = os.environ.get("S3_BUCKET")  # when set, originals are mirrored to object storage

    def _dir(self, user: dict, ds_id: str) -> pathlib.Path:
        uid = str((user or {}).get("sub", "anon"))
        if not SAFE.match(ds_id) or not SAFE.match(re.sub(r"[^A-Za-z0-9_-]", "_", uid)):
            raise HTTPException(400, "Bad dataset id")
        return self.root / re.sub(r"[^A-Za-z0-9_-]", "_", uid) / ds_id

    def save_frame(self, user: dict, name: str, df: pd.DataFrame) -> str:
        ds_id = uuid.uuid4().hex[:16]
        d = self._dir(user, ds_id)
        d.mkdir(parents=True, exist_ok=True)
        df.columns = [str(c) for c in df.columns]
        df.to_parquet(d / "original.parquet")
        (d / "name.txt").write_text(name)
        if self.bucket:
            self._upload(d / "original.parquet", f"{d.parent.name}/{ds_id}/original.parquet")
        return ds_id

    def load_frame(self, user: dict, ds_id: str) -> pd.DataFrame:
        p = self._dir(user, ds_id) / "original.parquet"
        if not p.exists():
            raise HTTPException(404, "Dataset not found")
        return pd.read_parquet(p)

    def path_for(self, user: dict, ds_id: str) -> str:
        return str(self._dir(user, ds_id) / "original.parquet")

    def csv_path(self, user: dict, ds_id: str) -> str:
        p = self._dir(user, ds_id) / "original.csv"
        if not p.exists():
            self.load_frame(user, ds_id).to_csv(p, index=False)
        return str(p)

    def _upload(self, path: pathlib.Path, key: str) -> None:
        import boto3

        boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT")).upload_file(str(path), self.bucket, key, ExtraArgs={"ServerSideEncryption": "AES256"} if not os.environ.get("S3_ENDPOINT") else None)
