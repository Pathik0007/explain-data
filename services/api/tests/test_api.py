import os

os.environ["AI_PROVIDER"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
TOOLS = [{"name": "aggregate", "description": "group and aggregate"}, {"name": "run_analysis", "description": "stats"}]


def test_health():
    assert client.get("/health").json()["ok"] is True


def test_plan_is_validated():
    r = client.post("/ai/plan", json={"question": "Which region sells most?", "schema": "columns: region, revenue", "tools": TOOLS})
    assert r.status_code == 200
    assert all(c["tool"] in {"aggregate", "run_analysis"} for c in r.json()["calls"])


def test_explain_verifies_numbers():
    results = [{"tool": "aggregate", "result": {"id": "r1", "rows": [["North", 490000], ["East", 338000]]}}]
    r = client.post("/ai/explain", json={"question": "Which region sells most?", "schema": "x", "results": results})
    body = r.json()
    assert body["answer"] and body["unverified"] == []


def test_convert_csv_roundtrip(tmp_path):
    csv = b"a,b\n1,=cmd\n2,x\n"
    r = client.post("/convert", files={"file": ("t.csv", csv, "text/csv")})
    assert r.status_code == 200 and "'=cmd" in r.text


def test_upload_and_analyse():
    csv = b"region,revenue\nNorth,10\nSouth,5\nNorth,7\n"
    up = client.post("/datasets", files={"file": ("s.csv", csv, "text/csv")}).json()
    ds = up["datasets"][0]
    assert ds["profile"]["rows"] == 3
    r = client.post(f"/datasets/{ds['id']}/analysis", json={"name": "group", "params": {"by": "region", "measure": "revenue"}}).json()
    assert r["table"]["rows"][0][:2] == ["North", 17.0]


def test_ai_unavailable_returns_503(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = client.post("/ai/complete", json={"input": "hi"})
    assert r.status_code == 503
