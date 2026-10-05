"""Validation layer: the LLM may only state numbers that the deterministic engine produced."""
from __future__ import annotations

import json
import math
import re

_NUM = re.compile(r"(?<![\w.])[-−]?[$€£¥₹৳]?\d(?:[\d,]*\d)?(?:\.\d+)?\s?(?:%|[kKmMbB](?![a-zA-Z]))?")
_SCALE = {"k": 1e3, "m": 1e6, "b": 1e9}


def _to_float(token: str) -> tuple[float, bool] | None:
    t = re.sub(r"[$€£¥₹৳,\s]", "", token.strip().replace("−", "-"))
    pct = t.endswith("%")
    t = t.rstrip("%")
    scale = 1.0
    if t and t[-1].lower() in _SCALE:
        scale = _SCALE[t[-1].lower()]
        t = t[:-1]
    try:
        return float(t) * scale, pct
    except ValueError:
        return None


def numbers_in(obj) -> list[float]:
    """Every number found anywhere in a JSON-like structure (including inside strings)."""
    out: list[float] = []

    def walk(o):
        if isinstance(o, bool) or o is None:
            return
        if isinstance(o, (int, float)):
            if math.isfinite(o):
                out.append(float(o))
        elif isinstance(o, str):
            for tok in _NUM.findall(o):
                v = _to_float(tok)
                if v:
                    out.append(v[0])
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, (list, tuple)):
            for v in o:
                walk(v)

    walk(obj)
    return out


def _matches(value: float, is_pct: bool, known: list[float]) -> bool:
    candidates = [value]
    if is_pct:
        candidates.append(value / 100)  # 18.4% may be stored as 0.184
    candidates += [-c for c in candidates]  # "falls 0.28" for a coefficient of -0.28
    for c in candidates:
        for k in known:
            if k == c:
                return True
            tol = max(abs(k), abs(c)) * 0.011  # rounding to ~1% (e.g. $1.24M vs 1,238,492)
            if abs(k - c) <= max(tol, 0.051 if abs(c) < 10 else 0.51):
                return True
    return False


def unverified_numbers(answer: str, results, question: str = "") -> list[str]:
    """Numbers in the answer that are not supported by the results (or the question itself)."""
    known = numbers_in(results) + numbers_in(question)
    # small counting words and list numbering are always allowed
    known += [float(i) for i in range(0, 13)]
    bad = []
    for tok in _NUM.findall(answer):
        v = _to_float(tok)
        if v is None:
            continue
        value, pct = v
        if re.fullmatch(r"(19|20)\d\d", tok.strip()):
            continue  # years
        if not _matches(value, pct, known):
            bad.append(tok.strip())
    return bad


def safe_results_json(results, limit: int = 60000) -> str:
    s = json.dumps(results, default=str)
    return s if len(s) <= limit else s[:limit] + '..."(truncated)"'
