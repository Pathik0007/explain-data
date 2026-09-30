"""Golden-question evaluation. Measures numerical accuracy, hallucinated numbers and latency per model route.

It replays the same plan -> compute -> explain loop the browser uses, with a pandas implementation of the
`aggregate` tool, so it can run in CI against a deployed API.
"""
import argparse
import json
import re
import time

import httpx
import pandas as pd
import yaml

TOOLS = [{"name": "aggregate", "description": "Group and aggregate rows. by: [cols]; metrics: [{col, agg}] agg in sum|mean|median|min|max|count; filters: [{col, op, value}]; sort: {by, dir}; limit."}]


def aggregate(df, args):
    d = df
    for f in args.get("filters", []):
        c, op, v = f["col"], f.get("op", "="), f["value"]
        d = d[d[c].astype(str).str.lower() == str(v).lower()] if op == "=" else d.query(f"`{c}` {op} @v")
    by, ms = args.get("by", []), args.get("metrics", [])
    if not ms:
        out = d.groupby(by).size().reset_index(name="count") if by else pd.DataFrame({"count": [len(d)]})
    else:
        spec = {f'{m["agg"]}_{m["col"]}': (m["col"], m["agg"]) for m in ms}
        out = d.groupby(by).agg(**spec).reset_index() if by else pd.DataFrame({k: [d[c].agg(a)] for k, (c, a) in spec.items()})
    return {"columns": list(out.columns), "rows": out.head(50).round(4).values.tolist()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--golden", default="evals/golden.yaml")
    a = ap.parse_args()
    g = yaml.safe_load(open(a.golden))
    df = pd.read_csv(g["dataset"])
    schema = "Columns: " + ", ".join(f'"{c}" ({t})' for c, t in df.dtypes.astype(str).items())
    passed, rows = 0, []
    for item in g["questions"]:
        t0 = time.time()
        plan = httpx.post(f"{a.api}/ai/plan", json={"question": item["q"], "schema": schema, "tools": TOOLS}, timeout=120).json()
        results = [{"tool": c["tool"], "result": aggregate(df, c.get("args", {}))} for c in plan.get("calls", [])]
        ans = httpx.post(f"{a.api}/ai/explain", json={"question": item["q"], "schema": schema, "results": results}, timeout=120).json()
        expect = item.get("expect_text") or eval(item["expect_pandas"], {"df": df, "pd": pd})  # noqa: S307 (trusted eval file)
        text = ans.get("answer", "")
        ok = str(expect).lower() in text.lower() if isinstance(expect, str) else any(abs(float(x.replace(",", "")) - float(expect)) <= max(1, abs(float(expect)) * 0.01) for x in re.findall(r"\d[\d,]*\.?\d*", text))
        passed += ok
        rows.append({"q": item["q"], "ok": ok, "expected": str(expect), "answer": text, "unverified": ans.get("unverified"), "seconds": round(time.time() - t0, 1)})
    print(json.dumps(rows, indent=1))
    print(f"{passed}/{len(rows)} passed")


if __name__ == "__main__":
    main()
