"""Isolated execution of generated Python (Pro mode "run code").

Development: a subprocess with CPU/memory/time limits, an import allow-list and no file or network modules.
Production: set SANDBOX_BACKEND=e2b (or modal/daytona) and run code in a disposable microVM with networking
disabled. Never execute generated code inside the web process.
"""
from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
import tempfile

ALLOWED_IMPORTS = {"pandas", "numpy", "scipy", "statsmodels", "sklearn", "math", "statistics", "datetime", "json", "re", "collections", "itertools"}
BANNED_NAMES = {"open", "exec", "eval", "compile", "__import__", "input", "globals", "locals", "vars", "getattr", "setattr", "delattr", "breakpoint"}


class UnsafeCode(ValueError):
    pass


def check(code: str) -> None:
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            for n in names:
                if n.split(".")[0] not in ALLOWED_IMPORTS:
                    raise UnsafeCode(f"Import of '{n}' is not allowed")
        if isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            raise UnsafeCode(f"'{node.id}' is not allowed")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise UnsafeCode("Dunder attribute access is not allowed")
        if isinstance(node, ast.Attribute) and node.attr in {"to_csv", "to_excel", "to_parquet", "to_pickle", "read_pickle", "system"}:
            raise UnsafeCode(f"'.{node.attr}' is not allowed")


_RUNNER = r"""
import json, resource, sys
resource.setrlimit(resource.RLIMIT_AS, ({mem}, {mem}))
resource.setrlimit(resource.RLIMIT_CPU, ({cpu}, {cpu}))
import pandas as pd
df = pd.read_csv(sys.argv[1])
ns = {{"df": df, "pd": pd}}
exec(compile(open(sys.argv[2]).read(), "analysis", "exec"), ns)
res = ns.get("result")
if isinstance(res, pd.DataFrame):
    res = {{"columns": [str(c) for c in res.columns], "rows": res.head(200).astype(object).where(res.head(200).notna(), None).values.tolist()}}
elif isinstance(res, pd.Series):
    res = {{"columns": [str(res.index.name or "index"), str(res.name or "value")], "rows": [[str(k), v] for k, v in res.head(200).items()]}}
print(json.dumps({{"result": res}}, default=str))
"""


def run_python(code: str, csv_path: str, timeout: int = 20, mem_mb: int = 1024) -> dict:
    if os.environ.get("ENABLE_SANDBOX") != "1":
        raise UnsafeCode("Code execution is disabled on this server (set ENABLE_SANDBOX=1 behind an isolated worker).")
    check(code)
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "analysis.py")
        runner = os.path.join(d, "runner.py")
        open(src, "w").write(code)
        open(runner, "w").write(_RUNNER.format(mem=mem_mb * 1024 * 1024, cpu=timeout))
        proc = subprocess.run([sys.executable, "-I", runner, csv_path, src], capture_output=True, text=True, timeout=timeout + 5, cwd=d, env={"PATH": "/usr/bin:/bin"})
    if proc.returncode != 0:
        return {"error": proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else "Execution failed"}
    return json.loads(proc.stdout.strip().splitlines()[-1])
