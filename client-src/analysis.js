/* Explain Your Data — analysis toolkit. Every function returns a verified result block:
   {kind, title, summary, stats:[{label,value}], table:{columns,rows}, chart:spec, code:{py,r}, plan:[...], followups:[...]} */
(function () {
  const E = window.EYD, S = E.S, isNum = E.isNum, fmt = E.fmt;
  const A = (E.A = {});
  const sh = (n) => E.short(n, 34);
  const q = E.pyStr, rn = E.rName;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const groupsOf = (ds, g, m) => { const gc = E.col(ds, g), mc = E.col(ds, m); let keys = [...new Set(gc.values.filter((v) => v != null))]; if (gc.order) keys = gc.order.filter((k) => keys.includes(k)); return keys.map((k) => ({ name: k, values: mc.values.filter((_, i) => gc.values[i] === k) })); };

  A.describe = function (ds, cols) {
    const p = E.profile(ds);
    const nums = (cols && cols.length ? cols : p.numeric).map((n) => E.col(ds, n)).filter((c) => c && c.type === 'number');
    const rows = nums.map((c) => { const d = S.describe(c.values); return [c.name, d.n, d.mean, d.sd, d.min, d.q1, d.median, d.q3, d.max, d.skew, d.kurt, d.cv]; });
    const cats = ds.cols.filter((c) => c.type === 'category').slice(0, 8).map((c) => { const pc = p.cols.find((x) => x.name === c.name); return [c.name, pc.unique, pc.top && pc.top[0] ? `${pc.top[0][0]} (${pc.top[0][1]})` : '—', fmt.pct(pc.missingPct)]; });
    const widest = nums.map((c) => [c, S.describe(c.values)]).sort((a, b) => Math.abs(b[1].cv || 0) - Math.abs(a[1].cv || 0))[0];
    return {
      kind: 'describe', title: 'Descriptive statistics', table: { columns: ['Column', 'n', 'Mean', 'Std dev', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Skew', 'Kurtosis', 'CV'], rows }, table2: cats.length ? { columns: ['Category column', 'Distinct', 'Most common', 'Missing'], rows: cats } : null,
      summary: nums.length ? `${nums.length} numeric column${nums.length > 1 ? 's' : ''} summarised. ${widest ? `${sh(widest[0].name)} varies the most relative to its mean (CV ${widest[1].cv.toFixed(2)}).` : ''} Skew above 1 or below −1 means the median is a better "typical value" than the mean.` : 'No numeric columns to summarise.',
      chart: nums[0] ? { type: 'box', y: (widest || [nums[0]])[0].name, title: `Spread of ${sh((widest || [nums[0]])[0].name)}` } : null,
      code: { py: `df.describe(include="all").T\ndf.select_dtypes("number").agg(["skew", "kurt"]).T`, r: `summary(df)\npsych::describe(df %>% select(where(is.numeric)))` },
      plan: ['Select numeric columns', 'Compute n, mean, SD, quartiles, skewness, kurtosis', 'Summarise categorical columns'], followups: ['Show the distribution of ' + (widest ? widest[0].name : ''), 'Find outliers', 'Show correlations'],
    };
  };

  A.distribution = function (ds, col) {
    const c = E.col(ds, col); const d = S.describe(c.values); const jb = S.jarqueBera(c.values);
    const shape = Math.abs(d.skew) < 0.5 ? 'roughly symmetric' : d.skew > 0 ? 'right-skewed (long tail of high values)' : 'left-skewed (long tail of low values)';
    return {
      kind: 'distribution', title: `Distribution of ${sh(col)}`,
      summary: `${cap(sh(col))} is ${shape}. Half the values fall between ${fmt.compact(d.q1, c.unit)} and ${fmt.compact(d.q3, c.unit)}, with a median of ${fmt.compact(d.median, c.unit)}. ${jb ? (jb.p < 0.05 ? `A Jarque–Bera test rejects normality (${fmt.p(jb.p)}), so prefer non-parametric tests or a transformation.` : `A Jarque–Bera test does not reject normality (${fmt.p(jb.p)}).`) : ''} ${d.outliers ? `${d.outliers} values sit outside 1.5×IQR.` : ''}`,
      stats: [{ label: 'Mean', value: fmt.compact(d.mean, c.unit) }, { label: 'Median', value: fmt.compact(d.median, c.unit) }, { label: 'Std dev', value: fmt.compact(d.sd, c.unit) }, { label: 'Skewness', value: d.skew.toFixed(2) }, { label: 'Outliers (IQR)', value: String(d.outliers) }],
      chart: { type: 'histogram', x: col, title: `Distribution of ${sh(col)}` },
      table: { columns: ['Statistic', 'Value'], rows: [['n', d.n], ['Mean', d.mean], ['Std dev', d.sd], ['Min', d.min], ['5th pct', d.p5], ['Q1', d.q1], ['Median', d.median], ['Q3', d.q3], ['95th pct', d.p95], ['Max', d.max], ['Skewness', d.skew], ['Excess kurtosis', d.kurt]].concat(jb ? [['Jarque–Bera p', jb.p]] : []) },
      code: { py: `from scipy import stats\ns = df[${q(col)}].dropna()\ns.describe(), s.skew(), stats.jarque_bera(s)`, r: `summary(df$${rn(col)})\ntseries::jarque.bera.test(na.omit(df$${rn(col)}))\nggplot(df, aes(${rn(col)})) + geom_histogram(bins = 30)` },
      plan: ['Drop missing values', 'Compute quantiles and moments', 'Test normality (Jarque–Bera)', 'Plot histogram with median'], followups: [`Find outliers in ${col}`, `Compare ${col} across groups`],
    };
  };

  A.correlation = function (ds, method = 'pearson', cols) {
    const p = E.profile(ds); const names = (cols && cols.length ? cols : p.numeric).filter((n) => E.col(ds, n) && E.col(ds, n).type === 'number').slice(0, 14);
    const pairs = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const r = S.correlation(E.col(ds, names[i]).values, E.col(ds, names[j]).values, method); if (isNum(r.r)) pairs.push([names[i], names[j], r.r, r.p, r.n]); }
    pairs.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
    const top = pairs[0];
    return {
      kind: 'correlation', title: `${method === 'spearman' ? 'Spearman' : 'Pearson'} correlations`,
      summary: top ? `The strongest relationship is between ${sh(top[0])} and ${sh(top[1])} (r = ${top[2].toFixed(2)}, ${S.effectLabel('r', top[2])}, ${fmt.p(top[3])}). ${pairs.filter((x) => x[3] < 0.05).length} of ${pairs.length} pairs are statistically significant at 5%. ${Math.abs(top[2]) > 0.95 ? 'A correlation this close to 1 often means one column is calculated from the other.' : ''}` : 'Need at least two numeric columns.',
      chart: { type: 'corr', cols: names, method, title: 'Correlation matrix' },
      table: { columns: ['Column A', 'Column B', 'r', 'p-value', 'n'], rows: pairs.slice(0, 15) },
      code: { py: `df.select_dtypes("number").corr(method=${q(method)})`, r: `cor(df %>% select(where(is.numeric)), use = "pairwise.complete.obs", method = ${JSON.stringify(method)})` },
      plan: ['Select numeric columns', `Compute pairwise ${method} r with p-values`, 'Rank pairs by |r|'], followups: top ? [`Scatter ${top[0]} vs ${top[1]}`, `What drives ${p.measure || top[0]}?`] : [],
    };
  };

  A.groupSummary = function (ds, by, measure, agg) {
    const m = measure && E.col(ds, measure); agg = m ? agg || E.defaultAgg(m) : 'count';
    const spec = { by: [by], metrics: m ? [{ col: measure, agg }, { col: measure, agg: 'count' }] : [], sort: undefined };
    const t = E.aggregate(ds, spec); const bc = E.col(ds, by);
    const tot = S.sum(t.rows.map((r) => r[1] || 0));
    let rows = t.rows.map((r) => (m ? [bc.type === 'date' ? fmt.date(r[0], t.grain) : r[0], r[1], r[2], agg === 'sum' ? r[1] / tot : null] : [bc.type === 'date' ? fmt.date(r[0], t.grain) : r[0], r[1], r[1] / tot]));
    const sorted = t.rows.slice().sort((a, b) => b[1] - a[1]);
    const label = m ? `${E.AGG_LABEL[agg].toLowerCase()} ${sh(measure)}` : 'rows';
    const best = sorted[0], worst = sorted[sorted.length - 1];
    const fv = (v) => (m ? fmt.compact(v, agg === 'count' ? null : m.unit) : fmt.num(v, 0));
    return {
      kind: 'group', title: `${cap(label)} by ${sh(by)}`,
      summary: best ? `${bc.type === 'date' ? fmt.date(best[0], t.grain) : best[0]} has the highest ${label} (${fv(best[1])})${sorted.length > 1 ? `; ${bc.type === 'date' ? fmt.date(worst[0], t.grain) : worst[0]} has the lowest (${fv(worst[1])})` : ''}.${agg === 'sum' || !m ? ` The top group accounts for ${fmt.pct(best[1] / tot)} of the total across ${t.rows.length} groups.` : ''}` : 'No groups found.',
      chart: { type: bc.type === 'date' ? 'line' : t.rows.length > 6 ? 'hbar' : 'bar', x: by, y: measure || null, agg, title: `${cap(label)} by ${sh(by)}` },
      table: { columns: m ? [by, cap(label), 'Rows', agg === 'sum' ? 'Share' : ''].filter(Boolean) : [by, 'Rows', 'Share'], rows: m && agg !== 'sum' ? rows.map((r) => r.slice(0, 3)) : rows, pctCols: m ? [3] : [2] },
      code: E.aggCode({ by: [by], metrics: m ? [{ col: measure, agg }] : [], sort: { by: m ? agg + '_' + measure : 'count', dir: 'desc' } }),
      plan: [`Group rows by ${by}`, m ? `Compute ${agg} of ${measure}` : 'Count rows', 'Rank groups'], followups: m ? [`Is the difference in ${measure} across ${by} significant?`, `Show ${measure} over time by ${by}`] : [],
    };
  };

  A.crosstab = function (ds, a, b) {
    const A1 = E.col(ds, a), B1 = E.col(ds, b);
    const top = (c) => { const cnt = new Map(); c.values.forEach((v) => v != null && cnt.set(v, (cnt.get(v) || 0) + 1)); let k = [...cnt.keys()].sort((x, y) => cnt.get(y) - cnt.get(x)).slice(0, 12); if (c.order) k = c.order.filter((o) => k.includes(o)); return k; };
    const la = top(A1), lb = top(B1);
    const tbl = la.map(() => lb.map(() => 0)); for (let i = 0; i < ds.n; i++) { const x = la.indexOf(A1.values[i]), y = lb.indexOf(B1.values[i]); if (x >= 0 && y >= 0) tbl[x][y]++; }
    const cs = S.chiSquare(tbl);
    let maxRes = { v: 0 }; cs.residuals.forEach((r, i) => r.forEach((v, j) => { if (Math.abs(v) > Math.abs(maxRes.v)) maxRes = { v, a: la[i], b: lb[j] }; }));
    return {
      kind: 'crosstab', title: `${sh(a)} × ${sh(b)}`,
      summary: `${cs.p < 0.05 ? 'The two are associated' : 'No evidence of an association'}: χ²(${cs.df}) = ${cs.chi2.toFixed(2)}, ${fmt.p(cs.p)}, Cramér's V = ${cs.cramersV.toFixed(2)} (${S.effectLabel('v', cs.cramersV)}). ${cs.p < 0.05 ? `The biggest departure from independence: ${maxRes.a} has ${maxRes.v > 0 ? 'more' : 'fewer'} "${maxRes.b}" than expected (standardised residual ${maxRes.v.toFixed(1)}).` : ''} ${cs.lowExpected > 0.2 ? 'More than 20% of cells have expected counts below 5, so treat the p-value with caution.' : ''}`,
      stats: [{ label: 'χ²', value: cs.chi2.toFixed(2) }, { label: 'df', value: String(cs.df) }, { label: 'p', value: fmt.p(cs.p).replace('p = ', '').replace('p ', '') }, { label: "Cramér's V", value: cs.cramersV.toFixed(2) }],
      chart: { type: 'stacked100', x: a, color: b, title: `${sh(b)} mix by ${sh(a)}` },
      table: { columns: [a].concat(lb.map(String)).concat(['Total']), rows: la.map((l, i) => [l].concat(tbl[i]).concat([S.sum(tbl[i])])) },
      code: { py: `from scipy import stats\nct = pd.crosstab(df[${q(a)}], df[${q(b)}])\nchi2, p, dof, expected = stats.chi2_contingency(ct)`, r: `ct <- table(df$${rn(a)}, df$${rn(b)})\nchisq.test(ct)` },
      plan: ['Cross-tabulate counts', 'Chi-square test of independence', "Effect size (Cramér's V)", 'Standardised residuals'], followups: [`Show ${b} by ${a} as a chart`],
    };
  };

  A.compareGroups = function (ds, measure, group) {
    const gs = groupsOf(ds, group, measure).filter((g) => S.nums(g.values).length >= 2);
    const m = E.col(ds, measure); const fv = (v) => fmt.compact(v, m.unit);
    if (gs.length < 2) return { kind: 'compare', title: 'Compare groups', summary: `${group} needs at least two groups with data.`, error: true };
    if (gs.length === 2) {
      const t = S.welch(gs[0].values, gs[1].values), mw = S.mannWhitney(gs[0].values, gs[1].values);
      return {
        kind: 'compare', title: `${sh(measure)}: ${gs[0].name} vs ${gs[1].name}`,
        summary: `${gs[0].name} averages ${fv(t.meanA)} and ${gs[1].name} ${fv(t.meanB)}, a difference of ${fv(t.diff)} (95% CI ${fv(t.ci[0])} to ${fv(t.ci[1])}). ${t.p < 0.05 ? 'The difference is statistically significant' : 'The difference is not statistically significant'} (Welch t(${t.df.toFixed(1)}) = ${t.t.toFixed(2)}, ${fmt.p(t.p)}; Cohen's d = ${t.d.toFixed(2)}, ${S.effectLabel('d', t.d)}). The rank-based Mann–Whitney test ${mw.p < 0.05 === t.p < 0.05 ? 'agrees' : 'disagrees'} (${fmt.p(mw.p)}).`,
        stats: [{ label: 't', value: t.t.toFixed(2) }, { label: 'p', value: fmt.p(t.p).replace(/^p [=<] ?/, (x) => (x.includes('<') ? '<' : '')) }, { label: "Cohen's d", value: t.d.toFixed(2) }, { label: 'Mann–Whitney p', value: fmt.p(mw.p).replace(/^p [=<] ?/, (x) => (x.includes('<') ? '<' : '')) }],
        chart: { type: 'box', x: group, y: measure, title: `${sh(measure)} by ${sh(group)}` },
        table: { columns: [group, 'n', 'Mean', 'Median', 'Std dev'], rows: gs.map((g) => { const v = S.nums(g.values); return [g.name, v.length, S.mean(v), S.median(v), S.std(v)]; }) },
        code: { py: `from scipy import stats\na = df.loc[df[${q(group)}] == ${q(gs[0].name)}, ${q(measure)}].dropna()\nb = df.loc[df[${q(group)}] == ${q(gs[1].name)}, ${q(measure)}].dropna()\nstats.ttest_ind(a, b, equal_var=False), stats.mannwhitneyu(a, b)`, r: `t.test(${rn(measure)} ~ ${rn(group)}, data = df)\nwilcox.test(${rn(measure)} ~ ${rn(group)}, data = df)` },
        plan: ['Split by group', "Welch's t-test (unequal variances)", 'Mann–Whitney U as a robustness check', "Effect size (Cohen's d)"], followups: [`Show the distribution of ${measure}`],
      };
    }
    const an = S.anova(gs), kw = S.kruskal(gs);
    const sorted = an.groups.slice().sort((a, b) => b.mean - a.mean);
    return {
      kind: 'compare', title: `${sh(measure)} across ${sh(group)}`,
      summary: `Average ${sh(measure)} ranges from ${fv(sorted[sorted.length - 1].mean)} (${sorted[sorted.length - 1].name}) to ${fv(sorted[0].mean)} (${sorted[0].name}). ${an.p < 0.05 ? 'At least one group differs significantly' : 'The groups do not differ significantly'}: one-way ANOVA F(${an.df1}, ${an.df2}) = ${an.F.toFixed(2)}, ${fmt.p(an.p)}, η² = ${an.eta2.toFixed(3)} (${S.effectLabel('eta2', an.eta2)} effect; ${sh(group)} explains ${fmt.pct(an.eta2)} of the variation). Kruskal–Wallis ${kw.p < 0.05 === an.p < 0.05 ? 'agrees' : 'disagrees'} (H = ${kw.H.toFixed(2)}, ${fmt.p(kw.p)}).`,
      stats: [{ label: 'F', value: an.F.toFixed(2) }, { label: 'p', value: an.p < 0.001 ? '< 0.001' : an.p.toFixed(3) }, { label: 'η²', value: an.eta2.toFixed(3) }, { label: 'Kruskal–Wallis p', value: kw.p < 0.001 ? '< 0.001' : kw.p.toFixed(3) }],
      chart: { type: 'box', x: group, y: measure, title: `${sh(measure)} by ${sh(group)}` },
      table: { columns: [group, 'n', 'Mean', 'Median', 'Std dev'], rows: an.groups.map((g) => [g.name, g.n, g.mean, g.median, g.sd]) },
      code: { py: `from scipy import stats\ngroups = [g[${q(measure)}].dropna() for _, g in df.groupby(${q(group)})]\nstats.f_oneway(*groups), stats.kruskal(*groups)`, r: `summary(aov(${rn(measure)} ~ ${rn(group)}, data = df))\nkruskal.test(${rn(measure)} ~ ${rn(group)}, data = df)\nTukeyHSD(aov(${rn(measure)} ~ ${rn(group)}, data = df))` },
      plan: ['Split by group', 'One-way ANOVA', 'Kruskal–Wallis as a robustness check', 'Effect size (η²)'], followups: [`Which ${group} pairs differ? (post-hoc)`, `Show ${measure} over time by ${group}`],
    };
  };

  A.pairedT = function (ds, a, b) {
    const t = S.pairedT(E.col(ds, a).values, E.col(ds, b).values);
    if (!t) return { kind: 'paired', title: 'Paired t-test', summary: 'Not enough complete pairs.', error: true };
    return { kind: 'paired', title: `${sh(a)} vs ${sh(b)} (paired)`, summary: `On average ${sh(a)} is ${fmt.num(t.meanDiff)} ${t.meanDiff >= 0 ? 'higher' : 'lower'} than ${sh(b)} across ${t.n} rows. ${t.p < 0.05 ? 'This is statistically significant' : 'This is not statistically significant'} (t(${t.df}) = ${t.t.toFixed(2)}, ${fmt.p(t.p)}, d = ${t.d.toFixed(2)}).`, stats: [{ label: 't', value: t.t.toFixed(2) }, { label: 'df', value: String(t.df) }, { label: 'p', value: t.p < 0.001 ? '< 0.001' : t.p.toFixed(3) }], chart: { type: 'scatter', x: a, y: b, title: `${sh(b)} vs ${sh(a)}` }, code: { py: `from scipy import stats\nd = df[[${q(a)}, ${q(b)}]].dropna()\nstats.ttest_rel(d[${q(a)}], d[${q(b)}])`, r: `t.test(df$${rn(a)}, df$${rn(b)}, paired = TRUE)` }, plan: ['Keep rows with both values', 'Test the mean of differences'], followups: [] };
  };

  A.regression = function (ds, target, predictors) {
    const res = S.regression(ds, target, predictors);
    if (!res) return { kind: 'regression', title: 'Regression', summary: 'Not enough complete rows for these predictors.', error: true };
    if (res.error) return { kind: 'regression', title: 'Regression', summary: res.error, error: true };
    const T = E.theme(); const tc = E.col(ds, target);
    const sig = res.coefs.slice(1).filter((c) => c.p < 0.05).sort((a, b) => Math.abs(b.stdCoef || 0) - Math.abs(a.stdCoef || 0));
    const pts = res.actual.map((y, i) => [res.fitted[i], y]).filter((_, i) => i % Math.max(1, Math.ceil(res.n / 3000)) === 0);
    const lo = Math.min(...res.actual), hi = Math.max(...res.actual);
    const words = sig.slice(0, 3).map((c) => `${c.name} (${c.coef >= 0 ? '+' : ''}${fmt.num(c.coef)} per unit, ${fmt.p(c.p)})`);
    return {
      kind: 'regression', title: `What drives ${sh(target)}`,
      summary: `A linear model with ${predictors.length} predictor${predictors.length > 1 ? 's' : ''} explains ${fmt.pct(res.r2)} of the variation in ${sh(target)} (adjusted R² = ${res.adjR2.toFixed(3)}, F = ${res.F.toFixed(1)}, ${fmt.p(res.pF)}, n = ${res.n.toLocaleString()}). ${sig.length ? `Significant predictors, strongest first: ${words.join('; ')}.` : 'No predictor is significant at 5%.'} Coefficients hold the other predictors constant; they describe association, not proof of cause.`,
      stats: [{ label: 'R²', value: res.r2.toFixed(3) }, { label: 'Adj. R²', value: res.adjR2.toFixed(3) }, { label: 'RMSE', value: fmt.compact(res.rmse, tc.unit) }, { label: 'n', value: res.n.toLocaleString() }],
      chart: { type: 'custom', title: `Predicted vs actual ${sh(target)}`, custom: { traces: [{ type: 'scatter', mode: 'markers', x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), marker: { color: T.series[0], size: 6, opacity: 0.55 }, name: 'Rows', hovertemplate: 'Predicted %{x:,.4~r}<br>Actual %{y:,.4~r}<extra></extra>' }, { type: 'scatter', mode: 'lines', x: [lo, hi], y: [lo, hi], line: { color: T.muted, dash: 'dash', width: 1.5 }, name: 'Perfect fit', hoverinfo: 'skip' }], layout: { xaxis: { title: 'Predicted ' + target }, yaxis: { title: 'Actual ' + target } } } },
      table: { columns: ['Term', 'Coefficient', 'Std error', 't', 'p-value', 'Std. effect'], rows: res.coefs.map((c) => [c.name, c.coef, c.se, c.t, c.p, c.stdCoef ?? null]) },
      code: { py: `import statsmodels.formula.api as smf\nmodel = smf.ols(${q(`Q("${target}") ~ ` + predictors.map((p) => (E.col(ds, p).type === 'number' ? `Q("${p}")` : `C(Q("${p}"))`)).join(' + '))}, data=df).fit()\nprint(model.summary())`, r: `model <- lm(${rn(target)} ~ ${predictors.map(rn).join(' + ')}, data = df)\nsummary(model)` },
      plan: ['Drop rows with missing values in the model', 'One-hot encode categorical predictors (first level is the baseline)', 'Fit ordinary least squares', 'Report coefficients, standard errors and p-values'],
      followups: sig[0] ? [`What if ${sig[0].name.split(' = ')[0]} increases 10%?`, `Show ${target} vs ${sig[0].name.split(' = ')[0]}`] : [], model: res,
    };
  };

  A.timeSeries = function (ds, dateCol, measure, grain, agg) {
    const dc = E.col(ds, dateCol); grain = grain || E.autoGrain(dc);
    const m = measure && E.col(ds, measure); agg = m ? agg || E.defaultAgg(m) : 'count';
    const t = E.aggregate(ds, { by: [dateCol], metrics: m ? [{ col: measure, agg }] : [], timeGrain: grain });
    const rows = t.rows; const vals = rows.map((r) => r[1]);
    const per = { day: 365, week: 52, month: 12, quarter: 4, year: 1 }[grain];
    const tab = rows.map((r, i) => [fmt.date(r[0], grain), r[1], i > 0 && vals[i - 1] ? r[1] / vals[i - 1] - 1 : null, i >= per && vals[i - per] ? r[1] / vals[i - per] - 1 : null]);
    const peak = rows.reduce((a, r) => (r[1] > a[1] ? r : a), rows[0] || [0, 0]);
    const cor = S.correlation(vals.map((_, i) => i), vals);
    const fv = (v) => (m ? fmt.compact(v, m.unit) : fmt.num(v, 0));
    const lastYoY = tab.length ? tab[tab.length - 1][3] : null;
    return {
      kind: 'timeseries', title: `${m ? E.AGG_LABEL[agg] + ' ' + sh(measure) : 'Rows'} by ${grain}`,
      summary: rows.length < 3 ? 'Too few periods for a trend.' : `Across ${rows.length} ${grain}s, ${m ? sh(measure) : 'volume'} peaked in ${fmt.date(peak[0], grain)} at ${fv(peak[1])}. The overall trend is ${cor.r > 0 ? 'upward' : 'downward'} and ${S.effectLabel('r', cor.r)} (r = ${cor.r.toFixed(2)} against time, ${fmt.p(cor.p)}). ${isNum(lastYoY) ? `The latest ${grain} is ${fmt.signedPct(lastYoY)} on the same ${grain} a year earlier.` : ''} The dashed line is a 3-period moving average.`,
      chart: { type: 'line', x: dateCol, y: measure || null, agg, grain, rolling: 3, title: `${m ? E.AGG_LABEL[agg] + ' ' + sh(measure) : 'Rows'} by ${grain}` },
      table: { columns: [cap(grain), m ? E.AGG_LABEL[agg] + ' ' + measure : 'Rows', 'Change vs previous', 'Change vs last year'], rows: tab, pctCols: [2, 3] },
      code: { py: `s = df.set_index(${q(dateCol)}).resample("${{ day: 'D', week: 'W', month: 'MS', quarter: 'QS', year: 'YS' }[grain]}")[${q(measure || dateCol)}].${m ? agg : 'count'}()\ngrowth = s.pct_change()\nyoy = s.pct_change(${per})\nrolling = s.rolling(3).mean()`, r: `df %>%\n  mutate(period = floor_date(${rn(dateCol)}, "${grain}")) %>%\n  group_by(period) %>%\n  summarise(value = ${m ? { sum: 'sum', mean: 'mean', median: 'median' }[agg] + '(' + rn(measure) + ', na.rm = TRUE)' : 'n()'}) %>%\n  mutate(growth = value / lag(value) - 1, yoy = value / lag(value, ${per}) - 1)` },
      plan: [`Bucket ${dateCol} by ${grain}`, `${m ? E.AGG_LABEL[agg] : 'Count'} per period`, 'Period-over-period and year-over-year change', '3-period rolling mean'], followups: [`Forecast ${measure || 'rows'} for the next 6 ${grain}s`, `Why did ${measure || 'volume'} change in ${fmt.date(peak[0], grain)}?`],
    };
  };

  A.forecast = function (ds, dateCol, measure, horizon = 6, grain) {
    const dc = E.col(ds, dateCol); grain = grain || E.autoGrain(dc); const m = measure && E.col(ds, measure); const agg = m ? E.defaultAgg(m) : 'count';
    const t = E.aggregate(ds, { by: [dateCol], metrics: m ? [{ col: measure, agg }] : [], timeGrain: grain });
    let rows = t.rows.filter((r) => isNum(r[1]));
    // drop partial last period (much smaller than recent average) for additive series
    if (agg !== 'mean' && rows.length > 6) { const last = rows[rows.length - 1][1], prev = S.mean(rows.slice(-4, -1).map((r) => r[1])); if (last < prev * 0.5) rows = rows.slice(0, -1); }
    if (rows.length < 6) return { kind: 'forecast', title: 'Forecast', summary: `Only ${rows.length} ${grain}s of history. Forecasting needs at least 6.`, error: true };
    const y = rows.map((r) => r[1]); const season = { month: 12, quarter: 4, week: 52, day: 7 }[grain];
    const fc = S.forecast(y, horizon, season);
    const step = (ts, k) => { const d = new Date(ts); if (grain === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1); if (grain === 'quarter') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3 * k, 1); if (grain === 'year') return Date.UTC(d.getUTCFullYear() + k, 0, 1); if (grain === 'week') return ts + k * 7 * 864e5; return ts + k * 864e5; };
    const lastTs = rows[rows.length - 1][0]; const fts = fc.forecast.map((_, k) => step(lastTs, k + 1));
    const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
    const T = E.theme(); const fv = (v) => (m ? fmt.compact(v, m.unit) : fmt.num(v, 0));
    const hx = rows.map((r) => iso(r[0])); const fx = fts.map(iso);
    const total = S.sum(fc.forecast.map((f) => f.yhat));
    return {
      kind: 'forecast', title: `${sh(measure || 'Rows')} forecast, next ${horizon} ${grain}s`,
      summary: `Best model on a ${fc.holdout}-${grain} holdout: ${fc.method}. The central estimate for ${fmt.date(fts[0], grain)} is ${fv(fc.forecast[0].yhat)} (80% interval ${fv(fc.forecast[0].lo80)}–${fv(fc.forecast[0].hi80)}), and for ${fmt.date(fts[fts.length - 1], grain)} ${fv(fc.forecast[horizon - 1].yhat)} (${fv(fc.forecast[horizon - 1].lo80)}–${fv(fc.forecast[horizon - 1].hi80)}). ${agg === 'sum' ? `That adds up to about ${fv(total)} over the ${horizon} ${grain}s. ` : ''}Uncertainty widens with each step; treat these as ranges, not promises.`,
      stats: [{ label: 'Model', value: fc.method.replace(/ \(.*\)/, '') }, { label: 'Holdout RMSE', value: fv(fc.comparison[0].rmse) }, { label: 'Holdout MAPE', value: isNum(fc.comparison[0].mape) ? fmt.pct(fc.comparison[0].mape) : '—' }],
      chart: { type: 'custom', title: `${sh(measure || 'Rows')}: history and forecast`, custom: { traces: [
        { type: 'scatter', mode: 'lines', x: fx.concat(fx.slice().reverse()), y: fc.forecast.map((f) => f.hi80).concat(fc.forecast.map((f) => f.lo80).reverse()), fill: 'toself', fillcolor: E.hexA(T.series[0], 0.16), line: { width: 0 }, name: '80% interval', hoverinfo: 'skip' },
        { type: 'scatter', mode: 'lines+markers', x: hx, y: y, line: { color: T.series[0], width: 2 }, marker: { size: 6, color: T.series[0] }, name: 'Actual', hovertemplate: '%{x|%b %Y}: %{y:,.4~r}<extra></extra>' },
        { type: 'scatter', mode: 'lines+markers', x: [hx[hx.length - 1]].concat(fx), y: [y[y.length - 1]].concat(fc.forecast.map((f) => f.yhat)), line: { color: T.series[0], width: 2, dash: 'dash' }, marker: { size: 6, color: T.surface, line: { color: T.series[0], width: 2 } }, name: 'Forecast', hovertemplate: '%{x|%b %Y}: %{y:,.4~r}<extra></extra>' },
      ], layout: { xaxis: { title: '' }, yaxis: { title: m ? E.AGG_LABEL[agg] + ' ' + measure : 'Rows' } } } },
      table: { columns: [cap(grain), 'Forecast', '80% low', '80% high', '95% low', '95% high'], rows: fc.forecast.map((f, k) => [fmt.date(fts[k], grain), f.yhat, f.lo80, f.hi80, f.lo95, f.hi95]) },
      table2: { columns: ['Model', 'Holdout RMSE', 'Holdout MAPE'], rows: fc.comparison.map((c) => [c.name, c.rmse, c.mape]), pctCols: [2] },
      code: { py: `from statsmodels.tsa.holtwinters import ExponentialSmoothing\ns = df.set_index(${q(dateCol)}).resample("${{ day: 'D', week: 'W', month: 'MS', quarter: 'QS', year: 'YS' }[grain]}")[${q(measure || dateCol)}].${m ? agg : 'count'}()\nmodel = ExponentialSmoothing(s, trend="add"${season && y.length >= 2 * season ? `, seasonal="add", seasonal_periods=${season}` : ''}).fit()\nmodel.forecast(${horizon})`, r: `library(forecast)\nts_data <- ts(series, frequency = ${season || 1})\nfit <- ets(ts_data)\nforecast(fit, h = ${horizon}, level = c(80, 95))` },
      plan: [`Aggregate ${measure || 'rows'} by ${grain}`, 'Hold out the most recent periods', 'Compare naive, moving average, linear trend, Holt' + (season && y.length >= 2 * season + 3 ? ' and Holt-Winters' : ''), 'Refit the best model on all data', 'Build 80% and 95% prediction intervals'], followups: [`Show ${measure || 'rows'} by ${grain} with growth rates`],
    };
  };

  A.clusters = function (ds, cols, k) {
    cols = cols.filter((n) => E.col(ds, n) && E.col(ds, n).type === 'number');
    if (cols.length < 2) return { kind: 'clusters', title: 'Segmentation', summary: 'Choose at least two numeric columns.', error: true };
    const wz = cols.map((n) => { const v = S.sorted(S.nums(E.col(ds, n).values)); const lo = v[Math.floor(0.01 * (v.length - 1))], hi = v[Math.ceil(0.99 * (v.length - 1))]; return { values: E.col(ds, n).values.map((x) => (isNum(x) ? Math.min(hi, Math.max(lo, x)) : x)) }; }); // winsorise at 1%/99% so one extreme row cannot form its own segment
    const Z = S.standardize(wz, ds.n);
    if (Z.rows.length < 20) return { kind: 'clusters', title: 'Segmentation', summary: 'Too few complete rows.', error: true };
    let chosen = k, sil = null; const tried = [];
    const sample = Z.rows.length > 5000 ? Z.rows.filter((_, i) => i % Math.ceil(Z.rows.length / 5000) === 0) : Z.rows;
    if (!k) {
      const minSize = Math.max(5, Math.round(0.03 * sample.length));
      for (let kk = 2; kk <= 6; kk++) { const km = S.kmeans(sample, kk); const cnt = new Array(kk).fill(0); km.labels.forEach((l) => cnt[l]++); if (Math.min(...cnt) < minSize) { tried.push([kk, null]); continue; } const s = S.silhouette(sample, km.labels, kk); tried.push([kk, s]); if (sil == null || s > sil) { sil = s; chosen = kk; } }
      if (sil == null) return { kind: 'clusters', title: 'Segmentation', summary: `No clear segments: every split into 2–6 groups leaves a group with fewer than ${minSize} rows, which usually means a few unusual rows rather than real customer types. Try different columns or clean outliers first.`, error: true };
    }
    const km = S.kmeans(Z.rows, chosen); if (sil == null) sil = S.silhouette(Z.rows, km.labels, chosen);
    const pca = S.pca2(Z.rows); const T = E.theme();
    const prof = [...Array(chosen).keys()].map((c) => { const idx = Z.idx.filter((_, i) => km.labels[i] === c); return ['Segment ' + (c + 1), idx.length].concat(cols.map((n) => S.mean(idx.map((i) => E.col(ds, n).values[i])))); });
    const overall = cols.map((n) => S.mean(S.nums(E.col(ds, n).values)));
    const describeSeg = (row) => { const diffs = cols.map((n, j) => [n, overall[j] ? row[2 + j] / overall[j] - 1 : 0]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])); return diffs.slice(0, 2).map(([n, d]) => `${d > 0 ? 'high' : 'low'} ${sh(n)} (${fmt.signedPct(d, 0)})`).join(', '); };
    const step = Math.max(1, Math.ceil(Z.rows.length / 3000));
    return {
      kind: 'clusters', title: `${chosen} segments from ${cols.length} measures`,
      summary: `k-means on standardised ${cols.map(sh).join(', ')} found ${chosen} segments${k ? '' : ' (chosen by the best silhouette score among 2–6)'}; silhouette = ${sil.toFixed(2)} (${sil > 0.5 ? 'well separated' : sil > 0.25 ? 'reasonably separated' : 'overlapping'}). ${prof.map((r) => `${r[0]} (${r[1].toLocaleString()} rows): ${describeSeg(r)}`).join('. ')}.`,
      stats: [{ label: 'Segments', value: String(chosen) }, { label: 'Silhouette', value: sil.toFixed(2) }, { label: 'PC1+PC2 variance', value: fmt.pct(pca.explained[0] + (pca.explained[1] || 0), 0) }],
      chart: { type: 'custom', title: 'Segments on the first two principal components', custom: { traces: [...Array(chosen).keys()].map((c) => { const pts = pca.scores.map((s, i) => [s, i]).filter(([, i]) => km.labels[i] === c && i % step === 0); return { type: 'scatter', mode: 'markers', name: 'Segment ' + (c + 1), x: pts.map(([s]) => s[0]), y: pts.map(([s]) => s[1]), marker: { color: T.series[c], size: 7, opacity: 0.7, line: { color: T.surface, width: 1 } } }; }), layout: { xaxis: { title: `PC1 (${fmt.pct(pca.explained[0], 0)})` }, yaxis: { title: `PC2 (${fmt.pct(pca.explained[1] || 0, 0)})` } } } },
      table: { columns: ['Segment', 'Rows'].concat(cols.map((n) => 'Avg ' + n)), rows: prof },
      table2: tried.length ? { columns: ['k', 'Silhouette'], rows: tried } : null,
      code: { py: `from sklearn.preprocessing import StandardScaler\nfrom sklearn.cluster import KMeans\nX = StandardScaler().fit_transform(df[[${cols.map(q).join(', ')}]].dropna())\nkm = KMeans(n_clusters=${chosen}, n_init=10, random_state=7).fit(X)`, r: `X <- scale(na.omit(df %>% select(${cols.map(rn).join(', ')})))\nkm <- kmeans(X, centers = ${chosen}, nstart = 10)\nfactoextra::fviz_cluster(km, data = X)` },
      plan: ['Standardise each measure (z-scores)', k ? `k-means with k = ${k}` : 'Try k = 2…6, pick best silhouette', 'Profile each segment against the average', 'Project onto 2 principal components for the chart'], followups: ['Add the segment column to my data'], clusterParams: { cols, k: chosen },
    };
  };

  A.survey = function (ds, cols) {
    const p = E.profile(ds); cols = (cols && cols.length ? cols : (ds.cols.some((c) => c.likert) ? ds.cols.filter((c) => c.likert) : ds.cols.filter((c) => c.order && c.type === 'category')).map((c) => c.name)).filter((n) => E.col(ds, n) && E.col(ds, n).order);
    if (!cols.length) return { kind: 'survey', title: 'Survey summary', summary: 'No Likert or ordered-scale columns were detected.', error: true };
    const rows = cols.map((n) => { const c = E.col(ds, n); const v = c.values.filter((x) => x != null); const L = c.order.length; const score = v.map((x) => c.order.indexOf(x) + 1); const top2 = v.filter((x) => c.order.indexOf(x) >= L - 2).length / (v.length || 1); const bot2 = v.filter((x) => c.order.indexOf(x) <= 1).length / (v.length || 1); return [n, v.length, S.mean(score), top2, 1 - top2 - bot2, bot2]; });
    const likertCols = cols.filter((n) => E.col(ds, n).likert);
    const alpha = likertCols.length >= 2 ? S.cronbach(likertCols.map((n) => { const c = E.col(ds, n); return c.values.map((v) => (v == null ? null : c.order.indexOf(v) + 1)); })) : null;
    const best = rows.slice().sort((a, b) => b[3] - a[3])[0], worst = rows.slice().sort((a, b) => b[5] - a[5])[0];
    return {
      kind: 'survey', title: 'Survey scale summary',
      summary: `${rows.length} scale question${rows.length > 1 ? 's' : ''}, ${p.n} responses. Highest agreement: "${sh(best[0])}" (${fmt.pct(best[3], 0)} top-two). Most disagreement: "${sh(worst[0])}" (${fmt.pct(worst[5], 0)} bottom-two). ${alpha ? `Internal consistency across the ${alpha.k} agreement items is ${alpha.label.toLowerCase()} (Cronbach's α = ${alpha.alpha.toFixed(2)}).` : ''}`,
      stats: alpha ? [{ label: "Cronbach's α", value: alpha.alpha.toFixed(2) }, { label: 'Items', value: String(alpha.k) }, { label: 'Complete responses', value: String(alpha.n) }] : null,
      chart: { type: 'likert', cols: likertCols.length ? likertCols : cols, title: 'Response distribution' },
      table: { columns: ['Question', 'n', 'Mean score', 'Top-two', 'Middle', 'Bottom-two'], rows, pctCols: [3, 4, 5] },
      code: { py: `scale = {${(E.col(ds, cols[0]).order || []).map((o, i) => q(o) + ': ' + (i + 1)).join(', ')}}\nitems = [${cols.map(q).join(', ')}]\nscores = df[items].apply(lambda s: s.map(scale))\nscores.mean(), (scores >= ${(E.col(ds, cols[0]).order || []).length - 1}).mean()\nimport pingouin as pg; pg.cronbach_alpha(scores)`, r: `library(likert)\nitems <- df %>% select(${cols.map(rn).join(', ')}) %>% mutate(across(everything(), ~ factor(.x, levels = c(${(E.col(ds, cols[0]).order || []).map((o) => JSON.stringify(o)).join(', ')}))))\nplot(likert(as.data.frame(items)))\npsych::alpha(items %>% mutate(across(everything(), as.integer)))` },
      plan: ['Detect ordered response scales', 'Map answers to 1…k scores', 'Top-two / bottom-two box shares', "Cronbach's alpha for the agreement items"], followups: p.dims[0] ? [`Compare "${sh(worst[0])}" across ${p.dims[0]}`] : [],
    };
  };

  A.outliers = function (ds, col) {
    const c = E.col(ds, col); const d = S.describe(c.values);
    const lo = d.q1 - 1.5 * d.iqr, hi = d.q3 + 1.5 * d.iqr; const z = (v) => (v - d.mean) / d.sd;
    const idx = []; c.values.forEach((v, i) => { if (isNum(v) && (v < lo || v > hi)) idx.push(i); });
    const zc = c.values.filter((v) => isNum(v) && Math.abs(z(v)) > 3).length;
    idx.sort((a, b) => Math.abs(z(c.values[b])) - Math.abs(z(c.values[a])));
    const show = ds.cols.filter((x) => x.type !== 'text').slice(0, 7).map((x) => x.name);
    if (!show.includes(col)) show.push(col);
    return {
      kind: 'outliers', title: `Outliers in ${sh(col)}`,
      summary: `${idx.length} value${idx.length === 1 ? '' : 's'} (${fmt.pct(idx.length / d.n)}) fall outside the IQR fences [${fmt.compact(lo, c.unit)}, ${fmt.compact(hi, c.unit)}]; ${zc} ${zc === 1 ? 'is' : 'are'} more than 3 standard deviations from the mean. ${idx.length ? `The most extreme is ${fmt.compact(c.values[idx[0]], c.unit)} (z = ${z(c.values[idx[0]]).toFixed(1)}).` : ''} Outliers are not automatically errors; check them before removing.`,
      stats: [{ label: 'IQR outliers', value: String(idx.length) }, { label: '|z| > 3', value: String(zc) }, { label: 'Lower fence', value: fmt.compact(lo, c.unit) }, { label: 'Upper fence', value: fmt.compact(hi, c.unit) }],
      chart: { type: 'box', y: col, title: `${sh(col)} with outliers` },
      table: { columns: ['Row'].concat(show).concat(['z-score']), rows: idx.slice(0, 25).map((i) => [i + 1].concat(show.map((n) => E.fmtVal(E.col(ds, n), E.col(ds, n).values[i]))).concat([z(c.values[i])])) },
      code: { py: `q1, q3 = df[${q(col)}].quantile([.25, .75]); iqr = q3 - q1\nout = df[(df[${q(col)}] < q1 - 1.5*iqr) | (df[${q(col)}] > q3 + 1.5*iqr)]`, r: `out <- df %>% filter(${rn(col)} < quantile(${rn(col)}, .25, na.rm=TRUE) - 1.5*IQR(${rn(col)}, na.rm=TRUE) | ${rn(col)} > quantile(${rn(col)}, .75, na.rm=TRUE) + 1.5*IQR(${rn(col)}, na.rm=TRUE))` },
      plan: ['Compute quartiles and IQR fences', 'Flag values beyond the fences', 'Rank by z-score'], followups: [`Cap outliers in ${col}`], fix: idx.length ? { op: 'outliers', params: { col, method: 'iqr', action: 'cap' }, label: 'Cap these outliers' } : null,
    };
  };

  A.quality = function (ds) {
    const p = E.profile(ds);
    return {
      kind: 'quality', title: 'Data quality audit',
      summary: `Health ${p.health.score}/100. ${p.issues.length ? `${p.issues.length} issue${p.issues.length > 1 ? 's' : ''} found: ${p.issues.slice(0, 4).map((i) => i.title).join('; ')}.` : 'No issues found.'}`,
      stats: [{ label: 'Completeness', value: Math.round(p.health.completeness) + '' }, { label: 'Uniqueness', value: Math.round(p.health.uniqueness) + '' }, { label: 'Validity', value: Math.round(p.health.validity) + '' }, { label: 'Consistency', value: Math.round(p.health.consistency) + '' }],
      table: { columns: ['Severity', 'Issue', 'Suggested fix'], rows: p.issues.map((i) => [i.severity, i.title, i.fix ? i.fix.label : 'Review manually']) },
      chart: null, code: { py: 'df.isna().sum()\ndf.duplicated().sum()\ndf.dtypes', r: 'colSums(is.na(df))\nsum(duplicated(df))\nstr(df)' },
      plan: ['Count missing, invalid and duplicate values', 'Check label consistency', 'Check outliers and constant columns'], followups: ['Fix the recommended issues'], action: 'clean',
    };
  };

  /* why did a measure change between two periods? contribution by segment */
  A.periods = function (ds, dateCol, grain) { const dc = E.col(ds, dateCol || E.profile(ds).dateCol); if (!dc) return []; grain = grain || E.autoGrain(dc); const set = new Set(); dc.values.forEach((v) => isNum(v) && set.add(E.bucket(v, grain))); return [...set].sort((a, b) => a - b).map((t) => ({ ts: t, label: fmt.date(t, grain) })); };
  A.explainChange = function (ds, dateCol, measure, period, grain) {
    const p = E.profile(ds); dateCol = dateCol || p.dateCol; const dc = E.col(ds, dateCol); if (!dc) return { kind: 'change', title: 'Explain a change', summary: 'This dataset has no date column.', error: true };
    grain = grain || E.autoGrain(dc); const m = measure && E.col(ds, measure); const agg = m && E.isNonAdditive(m) ? 'mean' : 'sum';
    const t = E.aggregate(ds, { by: [dateCol], metrics: m ? [{ col: measure, agg }] : [], timeGrain: grain }); const rows = t.rows.filter((r) => isNum(r[1]));
    if (rows.length < 2) return { kind: 'change', title: 'Explain a change', summary: 'Need at least two periods.', error: true };
    let i;
    if (period != null && period !== '') { const pt = isNum(+period) ? +period : null; i = rows.findIndex((r) => r[0] === pt || fmt.date(r[0], grain) === period); }
    if (i == null || i < 1) { let best = 1, bc = 0; for (let k = 1; k < rows.length; k++) { const c = Math.abs(rows[k][1] - rows[k - 1][1]); if (c > bc) { bc = c; best = k; } } i = best; }
    const cur = rows[i], prev = rows[i - 1]; const total = cur[1] - prev[1];
    const fv = (v) => (m ? fmt.compact(v, m.unit) : fmt.num(v, 0)); const sv = (v) => (v >= 0 ? '+' : '−') + fv(Math.abs(v));
    const inPeriod = (ts, bucket) => isNum(ts) && E.bucket(ts, grain) === bucket;
    const multi = p.dims.filter((d) => new Set(E.col(ds, d).values.filter((v) => v != null)).size > 2); const dims = (multi.length ? multi : p.dims).slice(0, 5); const out = [];
    for (const d of dims) {
      const dcol = E.col(ds, d); const a = new Map(), b = new Map(), na = new Map(), nb = new Map();
      for (let r = 0; r < ds.n; r++) { const key = dcol.values[r]; if (key == null) continue; const ts = dc.values[r]; const v = m ? m.values[r] : 1; if (!isNum(v)) continue; if (inPeriod(ts, cur[0])) { a.set(key, (a.get(key) || 0) + v); na.set(key, (na.get(key) || 0) + 1); } else if (inPeriod(ts, prev[0])) { b.set(key, (b.get(key) || 0) + v); nb.set(key, (nb.get(key) || 0) + 1); } }
      const keys = new Set([...a.keys(), ...b.keys()]);
      const contrib = [...keys].map((k) => { const cv = agg === 'mean' ? (a.get(k) || 0) / (na.get(k) || 1) : a.get(k) || 0; const pv = agg === 'mean' ? (b.get(k) || 0) / (nb.get(k) || 1) : b.get(k) || 0; return { dim: d, key: k, prev: pv, cur: cv, delta: cv - pv }; }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
      const conc = agg === 'sum' && total ? Math.abs(contrib[0] ? contrib[0].delta : 0) / (S.sum(contrib.map((c) => Math.abs(c.delta))) || 1) - 1 / Math.max(1, contrib.length) : 0;
      out.push({ d, contrib, conc });
    }
    out.sort((x, y) => y.conc - x.conc);
    const lead = out[0]; const T = E.theme();
    const pl = fmt.date(prev[0], grain), cl = fmt.date(cur[0], grain);
    const pct = prev[1] ? total / prev[1] : null;
    let summary = `${m ? cap(sh(measure)) : 'Row count'} ${total >= 0 ? 'rose' : 'fell'} ${fv(Math.abs(total))}${isNum(pct) ? ` (${fmt.signedPct(pct)})` : ''} from ${pl} (${fv(prev[1])}) to ${cl} (${fv(cur[1])}).`;
    if (lead && agg === 'sum') { const top = lead.contrib.slice(0, 3); summary += ` By ${sh(lead.d)}, the change came mostly from ${top.map((c) => `${c.key} (${sv(c.delta)}${total ? ', ' + fmt.pct(Math.abs(c.delta / total), 0) + ' of the change' : ''})`).join(', ')}.`; const second = out[1]; if (second && second.contrib[0]) summary += ` By ${sh(second.d)}, the largest mover was ${second.contrib[0].key} (${sv(second.contrib[0].delta)}).`; }
    else if (lead) summary += ` The biggest shift by ${sh(lead.d)}: ${lead.contrib[0].key} (${fv(lead.contrib[0].prev)} → ${fv(lead.contrib[0].cur)}).`;
    summary += ' This decomposes the change; it shows where it happened, not why.';
    const wf = lead ? lead.contrib.slice(0, 6) : []; const rest = lead ? total - S.sum(wf.map((c) => c.delta)) : 0;
    return {
      kind: 'change', title: `What changed from ${pl} to ${cl}`, summary,
      stats: [{ label: pl, value: fv(prev[1]) }, { label: cl, value: fv(cur[1]) }, { label: 'Change', value: sv(total) }].concat(isNum(pct) ? [{ label: '% change', value: fmt.signedPct(pct) }] : []),
      chart: lead && agg === 'sum' ? { type: 'custom', title: `Change in ${sh(measure || 'rows')} by ${sh(lead.d)}`, custom: { traces: [{ type: 'waterfall', orientation: 'v', x: [pl].concat(wf.map((c) => String(c.key))).concat(Math.abs(rest) > 1e-9 ? ['Other'] : []).concat([cl]), measure: ['absolute'].concat(wf.map(() => 'relative')).concat(Math.abs(rest) > 1e-9 ? ['relative'] : []).concat(['total']), y: [prev[1]].concat(wf.map((c) => c.delta)).concat(Math.abs(rest) > 1e-9 ? [rest] : []).concat([cur[1]]), connector: { line: { color: T.axis, width: 1 } }, increasing: { marker: { color: T.series[2] } }, decreasing: { marker: { color: T.series[7] } }, totals: { marker: { color: T.series[0] } }, hovertemplate: '%{x}: %{y:,.4~r}<extra></extra>' }], layout: { showlegend: false, yaxis: { title: m ? measure : 'Rows' } } } } : { type: 'line', x: dateCol, y: measure, grain, highlight: cur[0], title: `${sh(measure || 'Rows')} by ${grain}` },
      table: { columns: ['Dimension', 'Value', pl, cl, 'Change'], rows: out.flatMap((o) => o.contrib.slice(0, 4).map((c) => [o.d, c.key, c.prev, c.cur, c.delta])) },
      code: { py: `d = df.assign(period=df[${q(dateCol)}].dt.to_period("${{ day: 'D', week: 'W', month: 'M', quarter: 'Q', year: 'Y' }[grain]}"))\nd = d[d.period.isin(["${new Date(prev[0]).toISOString().slice(0, 7)}", "${new Date(cur[0]).toISOString().slice(0, 7)}"])]\nd.pivot_table(index=${q(lead ? lead.d : dateCol)}, columns="period", values=${q(measure || dateCol)}, aggfunc="${m ? agg : 'count'}").assign(change=lambda x: x.iloc[:, 1] - x.iloc[:, 0]).sort_values("change")`, r: `df %>%\n  mutate(period = floor_date(${rn(dateCol)}, "${grain}")) %>%\n  filter(period %in% as.Date(c("${new Date(prev[0]).toISOString().slice(0, 10)}", "${new Date(cur[0]).toISOString().slice(0, 10)}"))) %>%\n  group_by(${rn(lead ? lead.d : dateCol)}, period) %>%\n  summarise(value = ${m ? agg + '(' + rn(measure) + ')' : 'n()'}) %>%\n  pivot_wider(names_from = period, values_from = value)` },
      plan: [`Aggregate ${measure || 'rows'} by ${grain}`, `Compare ${cl} with ${pl}`, `Split the change by ${dims.join(', ') || 'segment'}`, 'Rank segments by contribution'],
      followups: lead ? [`Show ${measure || 'rows'} over time by ${lead.d}`] : [],
    };
  };

  /* run by name — used by the Analyze panel, the Ask engine and Claude tools */
  A.run = function (ds, name, params = {}) {
    const p = E.profile(ds);
    switch (name) {
      case 'describe': return A.describe(ds, params.cols);
      case 'distribution': return A.distribution(ds, params.col || p.measure);
      case 'correlation': return A.correlation(ds, params.method, params.cols);
      case 'group': return A.groupSummary(ds, params.by || p.dims[0], params.measure === undefined ? p.measure : params.measure, params.agg);
      case 'crosstab': return A.crosstab(ds, params.a || p.dims[0], params.b || p.dims[1]);
      case 'compare': return A.compareGroups(ds, params.measure || p.measure, params.group || p.dims[0]);
      case 'paired': return A.pairedT(ds, params.a, params.b);
      case 'regression': return A.regression(ds, params.target || p.measure, params.predictors && params.predictors.length ? params.predictors : p.numeric.filter((n) => n !== (params.target || p.measure)).slice(0, 5));
      case 'timeseries': return A.timeSeries(ds, params.date || p.dateCol, params.measure === undefined ? p.measure : params.measure, params.grain, params.agg);
      case 'forecast': return A.forecast(ds, params.date || p.dateCol, params.measure === undefined ? p.measure : params.measure, +params.horizon || 6, params.grain);
      case 'clusters': return A.clusters(ds, params.cols && params.cols.length ? params.cols : p.numeric.slice(0, 4), params.k ? +params.k : null);
      case 'survey': return A.survey(ds, params.cols);
      case 'outliers': return A.outliers(ds, params.col || p.measure);
      case 'quality': return A.quality(ds);
      case 'change': return A.explainChange(ds, params.date || p.dateCol, params.measure === undefined ? p.measure : params.measure, params.period, params.grain);
      default: throw new Error('Unknown analysis: ' + name);
    }
  };

  /* segment column as a replayable step */
  E.OPS.add_clusters = function (ds, p) {
    const Z = S.standardize(p.cols.map((n) => E.col(ds, n)), ds.n); const km = S.kmeans(Z.rows, p.k);
    const vals = new Array(ds.n).fill(null); Z.idx.forEach((i, j) => (vals[i] = 'Segment ' + (km.labels[j] + 1)));
    const name = p.name || 'segment'; const col = { name, type: 'category', values: vals, invalid: 0, invalidExamples: [] };
    const idx = ds.cols.findIndex((c) => c.name === name); if (idx >= 0) ds.cols[idx] = col; else ds.cols.push(col);
    return { label: `Added ${name} (${p.k} k-means segments on ${p.cols.join(', ')})`, py: `from sklearn.cluster import KMeans\nfrom sklearn.preprocessing import StandardScaler\nX = df[[${p.cols.map(q).join(', ')}]].dropna()\ndf.loc[X.index, ${q(name)}] = KMeans(${p.k}, n_init=10, random_state=7).fit_predict(StandardScaler().fit_transform(X))`, r: `X <- df %>% select(${p.cols.map(rn).join(', ')}) %>% na.omit() %>% scale()\ndf$${rn(name)}[complete.cases(df %>% select(${p.cols.map(rn).join(', ')}))] <- kmeans(X, ${p.k}, nstart = 10)$cluster` };
  };

  A.CATALOG = [
    { id: 'describe', group: 'Describe', label: 'Descriptive statistics', desc: 'Mean, median, spread, skewness for every column', params: [] },
    { id: 'distribution', group: 'Describe', label: 'Distribution & normality', desc: 'Histogram, quantiles, Jarque–Bera test', params: [{ key: 'col', type: 'num', label: 'Column' }] },
    { id: 'outliers', group: 'Describe', label: 'Outlier detection', desc: 'IQR fences and z-scores, with the extreme rows', params: [{ key: 'col', type: 'num', label: 'Column' }] },
    { id: 'group', group: 'Compare', label: 'Group summary / pivot', desc: 'Totals or averages per category', params: [{ key: 'by', type: 'cat', label: 'Group by' }, { key: 'measure', type: 'num?', label: 'Measure' }, { key: 'agg', type: 'agg', label: 'Aggregation' }] },
    { id: 'compare', group: 'Compare', label: 'Compare groups (t-test / ANOVA)', desc: 'Is the difference between groups real?', params: [{ key: 'measure', type: 'num', label: 'Measure' }, { key: 'group', type: 'cat', label: 'Groups' }] },
    { id: 'crosstab', group: 'Compare', label: 'Cross-tab & chi-square', desc: 'Are two categories associated?', params: [{ key: 'a', type: 'cat', label: 'Rows' }, { key: 'b', type: 'cat', label: 'Columns' }] },
    { id: 'paired', group: 'Compare', label: 'Paired t-test', desc: 'Before/after on the same rows', params: [{ key: 'a', type: 'num', label: 'First measure' }, { key: 'b', type: 'num', label: 'Second measure' }] },
    { id: 'correlation', group: 'Relationships', label: 'Correlation matrix', desc: 'Pearson or Spearman, with p-values', params: [{ key: 'method', type: 'choice', label: 'Method', options: ['pearson', 'spearman'] }] },
    { id: 'regression', group: 'Relationships', label: 'Regression (drivers)', desc: 'What predicts a measure, holding others constant', params: [{ key: 'target', type: 'num', label: 'Target' }, { key: 'predictors', type: 'multi', label: 'Predictors' }] },
    { id: 'timeseries', group: 'Time', label: 'Trend & growth', desc: 'Per-period values, MoM and YoY change', params: [{ key: 'date', type: 'date', label: 'Date' }, { key: 'measure', type: 'num?', label: 'Measure' }, { key: 'grain', type: 'grain', label: 'Period' }] },
    { id: 'forecast', group: 'Time', label: 'Forecast', desc: 'Auto-selected model with prediction intervals', params: [{ key: 'date', type: 'date', label: 'Date' }, { key: 'measure', type: 'num?', label: 'Measure' }, { key: 'horizon', type: 'int', label: 'Periods ahead', def: 6 }, { key: 'grain', type: 'grain', label: 'Period' }] },
    { id: 'change', group: 'Time', label: 'Explain a change', desc: 'Which segments drove a rise or fall between periods', params: [{ key: 'date', type: 'date', label: 'Date' }, { key: 'measure', type: 'num?', label: 'Measure' }, { key: 'period', type: 'period', label: 'Period (blank = biggest change)' }] },
    { id: 'clusters', group: 'Machine learning', label: 'Segmentation (k-means)', desc: 'Find natural groups of rows', params: [{ key: 'cols', type: 'multi', label: 'Measures' }, { key: 'k', type: 'int', label: 'Segments (blank = auto)' }] },
    { id: 'survey', group: 'Survey', label: 'Likert / scale summary', desc: "Agreement shares and Cronbach's alpha", params: [] },
    { id: 'quality', group: 'Describe', label: 'Data quality audit', desc: 'Missing, invalid, duplicate and inconsistent values', params: [] },
  ];
})();
