import pathlib

import pandas as pd
import pytest

from app.ai import verify
from app.engine import analysis, profiler, sandbox

DATA = pathlib.Path(__file__).parent.parent / "evals" / "data"


@pytest.fixture(scope="module")
def retail():
    df = pd.read_csv(DATA / "retail_sales_2025-26.csv")
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
    return df


def test_profile_finds_known_issues(retail):
    p = profiler.profile(retail)
    assert p["rows"] == len(retail)
    assert p["duplicates"] >= 40
    region = next(c for c in p["cols"] if c["name"] == "region")
    assert region.get("inconsistent") is True
    assert 0 < p["health"]["score"] <= 100


def test_group_summary_matches_pandas(retail):
    r = analysis.run(retail, "group", {"by": "product", "measure": "revenue", "agg": "sum"})
    expected = retail.groupby("product")["revenue"].sum().sort_values(ascending=False)
    assert r["table"]["rows"][0][0] == expected.index[0]
    assert r["table"]["rows"][0][1] == pytest.approx(expected.iloc[0])


def test_compare_groups_anova(retail):
    r = analysis.run(retail, "compare", {"measure": "revenue", "group": "category"})
    assert "ANOVA" in r["summary"] and r["stats"][1]["value"].startswith("0.0")


def test_unknown_column_is_rejected(retail):
    with pytest.raises(KeyError):
        analysis.run(retail, "group", {"by": "nope"})


def test_number_verification():
    results = [{"result": {"rows": [["Dune Sofa", 324117.5], ["Birch Desk", 248000]], "share": 0.233}}]
    assert verify.unverified_numbers("Dune Sofa leads with $324K, 23.3% of revenue.", results) == []
    assert verify.unverified_numbers("Dune Sofa leads with $512K.", results) == ["$512K"]


def test_sandbox_blocks_dangerous_code():
    for bad in ["import os\nos.system('ls')", "open('/etc/passwd').read()", "df.to_csv('/tmp/x')", "().__class__.__bases__"]:
        with pytest.raises(sandbox.UnsafeCode):
            sandbox.check(bad)
    sandbox.check("import pandas as pd\nresult = df.groupby('region')['revenue'].sum()")
