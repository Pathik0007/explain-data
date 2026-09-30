"""Server-side file readers — covers formats the browser engine can't (SPSS, Stata, SAS, Parquet, Feather)."""
from __future__ import annotations

import io
import pathlib

import pandas as pd

MAX_BYTES = 500 * 1024 * 1024


class UnsupportedFile(ValueError):
    pass


def read_table(filename: str, data: bytes) -> dict[str, pd.DataFrame]:
    """Return {name: DataFrame}. Multi-sheet Excel files return one frame per sheet."""
    if len(data) > MAX_BYTES:
        raise UnsupportedFile("File is larger than 500 MB.")
    ext = pathlib.Path(filename).suffix.lower().lstrip(".")
    buf = io.BytesIO(data)
    if ext in ("csv", "txt"):
        return {filename: pd.read_csv(buf, sep=None, engine="python")}
    if ext in ("tsv", "tab"):
        return {filename: pd.read_csv(buf, sep="\t")}
    if ext in ("xlsx", "xlsm", "xls", "ods"):
        sheets = pd.read_excel(buf, sheet_name=None)
        return {f"{filename} › {k}": v for k, v in sheets.items() if not v.empty}
    if ext == "json":
        return {filename: pd.json_normalize(pd.read_json(buf).to_dict(orient="records"))}
    if ext == "parquet":
        return {filename: pd.read_parquet(buf)}
    if ext == "feather":
        return {filename: pd.read_feather(buf)}
    if ext == "sav":
        return {filename: _via_tmp(pd.read_spss, data, ".sav")}
    if ext == "dta":
        return {filename: pd.read_stata(buf)}
    if ext in ("sas7bdat", "xpt"):
        return {filename: pd.read_sas(buf, format="xport" if ext == "xpt" else "sas7bdat")}
    raise UnsupportedFile(f".{ext} is not supported by the server engine.")


def _via_tmp(fn, data: bytes, suffix: str) -> pd.DataFrame:
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(data)
        f.flush()
        return fn(f.name)


def to_csv(df: pd.DataFrame) -> str:
    out = df.copy()
    # guard against spreadsheet formula injection when the CSV is reopened in Excel
    for c in out.select_dtypes(include=["object", "string"]).columns:
        out[c] = out[c].map(lambda v: "'" + v if isinstance(v, str) and v[:1] in "=+-@" and not v[1:2].isdigit() else v)
    return out.to_csv(index=False)
