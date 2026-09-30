"""AI router: one interface, several providers.

Tasks are routed by cost/complexity:
    quick     -> OpenAI fast model (or Claude Haiku)      intent, small JSON, rewrites
    plan      -> OpenAI main model (or Claude Sonnet)     structured tool plans
    explain   -> Claude Sonnet                            interpreting verified results
    narrative -> Claude Sonnet (Opus for academic/long)   report writing
    complex   -> Claude Opus                              deep, ambiguous investigations

Model IDs come from environment variables so they can be updated without code changes.
Providers are called over plain HTTPS with httpx, so SDK version drift can't break the app.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

import httpx


class AIUnavailable(RuntimeError):
    """No provider is configured (the client then falls back to its built-in engine)."""


class AIRateLimited(RuntimeError):
    pass


@dataclass
class Route:
    provider: str  # "anthropic" | "openai" | "mock"
    model: str
    max_tokens: int = 2000


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def routes() -> dict[str, list[Route]]:
    """Preferred route per task, with fallbacks. Only providers with a key are kept."""
    sonnet = _env("ANTHROPIC_MODEL_SONNET", "claude-sonnet-4-5")
    opus = _env("ANTHROPIC_MODEL_OPUS", "claude-opus-4-1")
    haiku = _env("ANTHROPIC_MODEL_HAIKU", "claude-haiku-4-5")
    gpt_main = _env("OPENAI_MODEL_MAIN", "gpt-4.1")
    gpt_fast = _env("OPENAI_MODEL_FAST", "gpt-4.1-mini")
    table = {
        "quick": [Route("openai", gpt_fast, 800), Route("anthropic", haiku, 800)],
        "plan": [Route("openai", gpt_main, 1200), Route("anthropic", sonnet, 1200)],
        "explain": [Route("anthropic", sonnet, 1500), Route("openai", gpt_main, 1500)],
        "narrative": [Route("anthropic", sonnet, 4000), Route("openai", gpt_main, 4000)],
        "complex": [Route("anthropic", opus, 4000), Route("anthropic", sonnet, 4000), Route("openai", gpt_main, 4000)],
    }
    if _env("AI_PROVIDER") == "mock":
        return {k: [Route("mock", "mock")] for k in table}
    have = {"anthropic": bool(_env("ANTHROPIC_API_KEY")), "openai": bool(_env("OPENAI_API_KEY"))}
    return {k: [r for r in v if have[r.provider]] for k, v in table.items()}


def available() -> bool:
    return any(routes().values())


def generate(task: str, system: str, messages: list[dict], want_json: bool = False, timeout: float = 90) -> str:
    """Run a task through the first working route. Returns the model's text."""
    candidates = routes().get(task) or []
    if not candidates:
        raise AIUnavailable("No AI provider configured. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.")
    last: Exception | None = None
    for r in candidates:
        try:
            if r.provider == "mock":
                return _mock(task, messages, want_json)
            if r.provider == "anthropic":
                return _anthropic(r, system, messages, want_json, timeout)
            return _openai(r, system, messages, want_json, timeout)
        except AIRateLimited as e:
            last = e
        except httpx.HTTPError as e:
            last = e
    if isinstance(last, AIRateLimited):
        raise last
    raise AIUnavailable(f"All providers failed for task '{task}': {last}")


def _anthropic(r: Route, system: str, messages: list[dict], want_json: bool, timeout: float) -> str:
    body = {"model": r.model, "max_tokens": r.max_tokens, "system": system, "messages": messages}
    if want_json:
        body["system"] = system + "\n\nReply with a single JSON object and nothing else."
    res = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": _env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json=body,
        timeout=timeout,
    )
    if res.status_code == 429:
        raise AIRateLimited("Anthropic rate limit")
    res.raise_for_status()
    return "".join(b.get("text", "") for b in res.json().get("content", []) if b.get("type") == "text")


def _openai(r: Route, system: str, messages: list[dict], want_json: bool, timeout: float) -> str:
    body = {"model": r.model, "max_tokens": r.max_tokens, "messages": [{"role": "system", "content": system}] + messages}
    if want_json:
        body["response_format"] = {"type": "json_object"}
    res = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"authorization": f"Bearer {_env('OPENAI_API_KEY')}", "content-type": "application/json"},
        json=body,
        timeout=timeout,
    )
    if res.status_code == 429:
        raise AIRateLimited("OpenAI rate limit")
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"] or ""


def _mock(task: str, messages: list[dict], want_json: bool) -> str:
    """Deterministic provider for tests and offline development."""
    last = messages[-1]["content"] if messages else ""
    if task == "plan":
        return json.dumps({"calls": [{"tool": "aggregate", "args": {"by": ["region"], "metrics": [{"col": "revenue", "agg": "sum"}], "sort": {"by": "sum_revenue", "dir": "desc"}}}]})
    if task == "explain":
        nums = re.findall(r'"rows": \[\[\s*"([^"]+)",\s*([0-9.]+)', last)
        answer = f"{nums[0][0]} is highest at {float(nums[0][1]):,.0f}." if nums else "The results are shown below."
        return json.dumps({"answer": answer, "show": ["r1"], "followups": ["Show this over time"]})
    if want_json:
        return json.dumps({"summary": "Mock summary.", "notes": {}, "recommendations": [], "limitations": []})
    return "Mock response."


def parse_json(text: str):
    """Tolerant JSON extraction: whole text, fenced block, or first {...} / [...] span."""
    text = text.strip()
    for candidate in (text, *re.findall(r"```(?:json)?\s*(.*?)```", text, re.S)):
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            pass
    m = re.search(r"[\[{].*[\]}]", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return None
