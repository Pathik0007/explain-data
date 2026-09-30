"""Deterministic analysis engine (pandas / SciPy / statsmodels / scikit-learn).

Each function returns a result block with the same shape as the browser engine:
{kind, title, summary, stats, table: {columns, rows}, code: {py, r}}
The server engine is used for large datasets and heavy jobs (run through the worker queue).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from .profiler import infer_types, json_safe


def _p(p: float) -> str:
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def group_summary(df: pd.DataFrame, by: str, measure: str | None = None, agg: str = "sum", limit: int = 50) -> dict:
    if measure:
        g = df.groupby(by, dropna=True)[measure].agg(agg).sort_values(ascending=False)
        label = f"{agg} of {measure}"
    else:
        g = df.groupby(by, dropna=True).size().sort_values(ascending=False)
        label = "rows"
    total = g.sum()
    rows = [[str(k), float(v), float(v / total) if total and agg in ("sum", "size") or not measure else None] for k, v in g.head(limit).items()]
    top = rows[0] if rows else None
    return json_safe({
        "kind": "group", "title": f"{label} by {by}",
        "summary": f"{top[0]} has the highest {label} ({top[1]:,.2f})." if top else "No groups.",
        "table": {"columns": [by, label, "share"], "rows": rows},
        "code": {"py": f"df.groupby({by!r})[{measure!r}].{agg}().sort_values(ascending=False)" if measure else f"df[{by!r}].value_counts()",
                 "r": f"df %>% group_by(`{by}`) %>% summarise(value = {agg}(`{measure}`, na.rm = TRUE))" if measure else f"count(df, `{by}`)"},
    })


def compare_groups(df: pd.DataFrame, measure: str, group: str) -> dict:
    groups = [(str(k), g[measure].dropna().astype(float)) for k, g in df.groupby(group) if g[measure].notna().sum() >= 2]
    if len(groups) < 2:
        return {"kind": "compare", "title": "Compare groups", "summary": "Need at least two groups with data.", "error": True}
    table = [[k, int(len(v)), float(v.mean()), float(v.median()), float(v.std())] for k, v in groups]
    if len(groups) == 2:
        t = stats.ttest_ind(groups[0][1], groups[1][1], equal_var=False)
        mw = stats.mannwhitneyu(groups[0][1], groups[1][1])
        summary = (f"{groups[0][0]} averages {groups[0][1].mean():,.3g} vs {groups[1][0]} {groups[1][1].mean():,.3g}. "
                   f"Welch t = {t.statistic:.2f}, {_p(t.pvalue)}; Mann–Whitney {_p(mw.pvalue)}.")
        st = [{"label": "t", "value": f"{t.statistic:.2f}"}, {"label": "p", "value": f"{t.pvalue:.4f}"}]
    else:
        f = stats.f_oneway(*[v for _, v in groups])
        kw = stats.kruskal(*[v for _, v in groups])
        allv = pd.concat([v for _, v in groups])
        ssb = sum(len(v) * (v.mean() - allv.mean()) ** 2 for _, v in groups)
        eta2 = ssb / ((allv - allv.mean()) ** 2).sum()
        summary = f"One-way ANOVA F = {f.statistic:.2f}, {_p(f.pvalue)}, η² = {eta2:.3f}; Kruskal–Wallis {_p(kw.pvalue)}."
        st = [{"label": "F", "value": f"{f.statistic:.2f}"}, {"label": "p", "value": f"{f.pvalue:.4f}"}, {"label": "η²", "value": f"{eta2:.3f}"}]
    return json_safe({"kind": "compare", "title": f"{measure} by {group}", "summary": summary, "stats": st,
                      "table": {"columns": [group, "n", "mean", "median", "sd"], "rows": table},
                      "code": {"py": f"stats.f_oneway(*[g[{measure!r}].dropna() for _, g in df.groupby({group!r})])",
                               "r": f"summary(aov(`{measure}` ~ `{group}`, data = df))"}})


def correlation(df: pd.DataFrame, method: str = "pearson") -> dict:
    num = df.select_dtypes("number")
    pairs = []
    cols = list(num.columns)
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            d = num[[a, b]].dropna()
            if len(d) < 3:
                continue
            r, p = (stats.pearsonr if method == "pearson" else stats.spearmanr)(d[a], d[b])
            pairs.append([a, b, float(r), float(p), int(len(d))])
    pairs.sort(key=lambda x: -abs(x[2]))
    top = pairs[0] if pairs else None
    return json_safe({"kind": "correlation", "title": f"{method.title()} correlations",
                      "summary": f"Strongest: {top[0]} and {top[1]} (r = {top[2]:.2f}, {_p(top[3])})." if top else "Need two numeric columns.",
                      "table": {"columns": ["a", "b", "r", "p", "n"], "rows": pairs[:20]},
                      "code": {"py": f"df.select_dtypes('number').corr(method={method!r})", "r": "cor(df %>% select(where(is.numeric)), use = 'pairwise.complete.obs')"}})


def regression(df: pd.DataFrame, target: str, predictors: list[str]) -> dict:
    import statsmodels.formula.api as smf

    types = infer_types(df[[target, *predictors]])
    terms = [f'Q("{p}")' if types[p] == "number" else f'C(Q("{p}"))' for p in predictors]
    model = smf.ols(f'Q("{target}") ~ ' + " + ".join(terms), data=df).fit()
    rows = [[name, float(model.params[name]), float(model.bse[name]), float(model.tvalues[name]), float(model.pvalues[name])] for name in model.params.index]
    return json_safe({"kind": "regression", "title": f"What drives {target}",
                      "summary": f"R² = {model.rsquared:.3f} (adjusted {model.rsquared_adj:.3f}), F {_p(model.f_pvalue)}, n = {int(model.nobs)}.",
                      "stats": [{"label": "R²", "value": f"{model.rsquared:.3f}"}, {"label": "n", "value": str(int(model.nobs))}],
                      "table": {"columns": ["term", "coef", "se", "t", "p"], "rows": rows},
                      "code": {"py": f"smf.ols({model.model.formula!r}, data=df).fit().summary()", "r": f"summary(lm(`{target}` ~ {' + '.join('`'+p+'`' for p in predictors)}, data = df))"}})


def forecast(df: pd.DataFrame, date: str, measure: str, horizon: int = 6, freq: str = "MS") -> dict:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    s = df.assign(**{date: pd.to_datetime(df[date], errors="coerce", dayfirst=True)}).dropna(subset=[date]).set_index(date)[measure].resample(freq).sum()
    if len(s) < 6:
        return {"kind": "forecast", "title": "Forecast", "summary": "Need at least 6 periods.", "error": True}
    seasonal = 12 if freq == "MS" and len(s) >= 24 else None
    fit = ExponentialSmoothing(s, trend="add", seasonal="add" if seasonal else None, seasonal_periods=seasonal).fit()
    fc = fit.forecast(horizon)
    sigma = float(np.std(fit.resid, ddof=1))
    rows = [[str(ix.date()), float(v), float(v - 1.2816 * sigma * np.sqrt(i + 1)), float(v + 1.2816 * sigma * np.sqrt(i + 1))] for i, (ix, v) in enumerate(fc.items())]
    return json_safe({"kind": "forecast", "title": f"{measure} forecast", "summary": f"Next period {rows[0][1]:,.0f} (80% interval {rows[0][2]:,.0f}–{rows[0][3]:,.0f}).",
                      "table": {"columns": ["period", "forecast", "lo80", "hi80"], "rows": rows},
                      "code": {"py": "ExponentialSmoothing(s, trend='add').fit().forecast(%d)" % horizon, "r": f"forecast::forecast(forecast::ets(ts_data), h = {horizon})"}})


def clusters(df: pd.DataFrame, cols: list[str], k: int = 3) -> dict:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    X = df[cols].dropna()
    labels = KMeans(n_clusters=k, n_init=10, random_state=7).fit_predict(StandardScaler().fit_transform(X))
    prof = X.assign(segment=labels).groupby("segment").agg(["mean"]).round(3)
    rows = [[f"Segment {int(i) + 1}", int((labels == i).sum()), *[float(v) for v in prof.loc[i].values]] for i in prof.index]
    return json_safe({"kind": "clusters", "title": f"{k} segments", "summary": f"k-means with k = {k} on {', '.join(cols)}.",
                      "table": {"columns": ["segment", "rows", *[f"avg {c}" for c in cols]], "rows": rows},
                      "code": {"py": f"KMeans({k}, n_init=10, random_state=7).fit_predict(StandardScaler().fit_transform(df[{cols!r}].dropna()))", "r": f"kmeans(scale(na.omit(df[, c({', '.join(repr(c) for c in cols)})])), {k})"}})


RUNNERS = {
    "group": lambda df, p: group_summary(df, p["by"], p.get("measure"), p.get("agg", "sum")),
    "compare": lambda df, p: compare_groups(df, p["measure"], p["group"]),
    "correlation": lambda df, p: correlation(df, p.get("method", "pearson")),
    "regression": lambda df, p: regression(df, p["target"], p["predictors"]),
    "forecast": lambda df, p: forecast(df, p["date"], p["measure"], int(p.get("horizon", 6))),
    "clusters": lambda df, p: clusters(df, p["cols"], int(p.get("k", 3))),
}


def run(df: pd.DataFrame, name: str, params: dict) -> dict:
    if name not in RUNNERS:
        raise KeyError(f"Unknown analysis '{name}'")
    for key in ("by", "measure", "group", "target", "date"):
        if params.get(key) and params[key] not in df.columns:
            raise KeyError(f"No column named '{params[key]}'")
    return RUNNERS[name](df, params)
