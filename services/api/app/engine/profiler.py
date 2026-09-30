"""Dataset profiling and health score (server twin of the browser profiler, for large files)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def infer_types(df: pd.DataFrame) -> dict[str, str]:
    types = {}
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_bool_dtype(s):
            types[c] = "category"
        elif pd.api.types.is_numeric_dtype(s):
            types[c] = "id" if ("id" in str(c).lower() and s.nunique() > 0.9 * max(1, s.notna().sum())) else "number"
        elif pd.api.types.is_datetime64_any_dtype(s):
            types[c] = "date"
        else:
            nonnull = s.dropna().astype(str)
            if nonnull.empty:
                types[c] = "category"
                continue
            parsed = pd.to_numeric(nonnull.str.replace(r"[$,%\s]", "", regex=True), errors="coerce")
            if parsed.notna().mean() >= 0.9:
                types[c] = "number"
                continue
            dates = pd.to_datetime(nonnull, errors="coerce", dayfirst=True, format="mixed")
            if dates.notna().mean() >= 0.85:
                types[c] = "date"
                continue
            uniq = nonnull.nunique()
            avg_len = nonnull.str.len().mean()
            if uniq <= max(25, len(nonnull) * 0.02) or (uniq / len(nonnull) < 0.5 and avg_len < 30):
                types[c] = "category"
            elif avg_len > 35:
                types[c] = "text"
            else:
                types[c] = "id" if uniq / len(nonnull) > 0.9 else "category"
    return types


def profile(df: pd.DataFrame) -> dict:
    n, k = df.shape
    types = infer_types(df)
    cells = max(1, n * k)
    missing = int(df.isna().sum().sum())
    dup = int(df.duplicated().sum())
    cols = []
    inconsistent_cols = 0
    for c in df.columns:
        s = df[c]
        info = {"name": str(c), "type": types[c], "missing": int(s.isna().sum()), "unique": int(s.nunique())}
        if types[c] == "number":
            v = pd.to_numeric(s, errors="coerce").dropna()
            if len(v):
                q1, q3 = v.quantile([0.25, 0.75])
                info.update(mean=float(v.mean()), median=float(v.median()), sd=float(v.std()) if len(v) > 1 else 0.0,
                            min=float(v.min()), max=float(v.max()), skew=float(v.skew()) if len(v) > 2 else 0.0,
                            outliers=int(((v < q1 - 1.5 * (q3 - q1)) | (v > q3 + 1.5 * (q3 - q1))).sum()))
        elif types[c] == "category":
            vc = s.dropna().astype(str).value_counts()
            info["top"] = [[str(a), int(b)] for a, b in vc.head(8).items()]
            norm = s.dropna().astype(str).str.lower().str.replace(r"[^0-9a-z]+", "", regex=True)
            if norm.nunique() < s.dropna().astype(str).nunique():
                info["inconsistent"] = True
                inconsistent_cols += 1
        cols.append(info)
    health = {
        "completeness": 100 * (1 - missing / cells),
        "uniqueness": 100 * (1 - min(1, dup / max(1, n) * 8)),
        "validity": 100.0,
        "consistency": max(0.0, 100 - inconsistent_cols * 25),
        "structure": 100 * (1 - min(1, sum(1 for c in cols if c["unique"] <= 1) / max(1, k)) * 0.8),
    }
    health["score"] = round(health["completeness"] * 0.3 + health["uniqueness"] * 0.2 + health["validity"] * 0.2
                            + health["consistency"] * 0.15 + health["structure"] * 0.15)
    return {"rows": n, "columns": k, "missing_cells": missing, "duplicates": dup, "health": health, "cols": cols}


def json_safe(obj):
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        return None if not np.isfinite(obj) else float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    return obj
