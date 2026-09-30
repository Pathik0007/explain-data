/* Explain Your Data — profiling, dataset health, discovery, suggested questions */
(function () {
  const E = window.EYD, S = E.S, isNum = E.isNum, fmt = E.fmt;

  const NONNEG = /(price|cost|revenue|sales|amount|quantity|qty|count|days|age|hours|duration|weight|height|units|distance|salary|income|spend|total)/i;
  const NOT_NONNEG = /(change|diff|delta|growth|balance|profit|net|margin|temp|refund|return)/i;
  const MEASURE_HINT = /(revenue|sales|amount|profit|total|price|cost|spend|income|salary|score|yield|value|satisfaction|rating|units|quantity|qty|hours|duration|weight|height|age|count)/i;
  const STRONG_MEASURE = /(revenue|sales|amount|profit|total|spend|income|salary|yield|satisf|score)/i;
  const NONADDITIVE = /(delivery|duration|latency|wait|lead.?time|speed|response|rating|score|age|price|rate|pct|percent|ph|temperature|temp|satisfaction|avg|mean|hours|sleep|latitude|longitude|year|protein)/i;
  E.short = (s, n = 34) => { s = String(s).replace(/_/g, ' ').replace(/\?$/, ''); if (s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 8)).trim() + '…'; };
  E.isNonAdditive = (c) => {
    if (!c) return false;
    if (c.unit === '%' || NONADDITIVE.test(c.name) || c.likert || /satisf|\(1\s*-\s*\d+\)|scale|index/i.test(c.name)) return true;
    if (c._nonAdd === undefined) { const v = c.values.filter(E.isNum); let mn = Infinity, mx = -Infinity, ints = true; for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; if (!Number.isInteger(x)) ints = false; } c._nonAdd = v.length > 0 && ints && mn >= 0 && mx <= 10 && !/units|qty|quantity|count|number|items/i.test(c.name); }
    return c._nonAdd;
  };
  E.defaultAgg = (c) => (!c ? 'count' : E.isNonAdditive(c) ? 'mean' : 'sum');

  E.profile = function (ds) {
    if (ds._profile && ds._profile.rev === ds.rev) return ds._profile;
    const n = ds.n, cols = ds.cols;
    let missingCells = 0, invalidCells = 0;
    const colProfiles = cols.map((c) => {
      const missing = c.values.reduce((s, v) => s + (v == null ? 1 : 0), 0);
      missingCells += missing; invalidCells += c.invalid || 0;
      const p = { name: c.name, type: c.type, unit: c.unit, missing, missingPct: n ? missing / n : 0, invalid: c.invalid || 0, invalidExamples: c.invalidExamples || [], ordinal: !!c.order, likert: !!c.likert };
      const nonNull = c.values.filter((v) => v != null);
      const uniqSet = new Set(nonNull);
      p.unique = uniqSet.size;
      p.constant = p.unique === 1 && n > 1;
      if (c.type === 'number') {
        p.desc = S.describe(c.values); p.hist = S.histogram(c.values, 24);
        p.negatives = c.values.reduce((s, v) => s + (isNum(v) && v < 0 ? 1 : 0), 0);
        p.nonneg = p.negatives > 0 && NONNEG.test(c.name) && !NOT_NONNEG.test(c.name) && p.negatives / Math.max(1, n) <= 0.05;
        if (p.nonneg) invalidCells += p.negatives;
      }
      if (c.type === 'date') { let mn = Infinity, mx = -Infinity; for (const v of nonNull) { if (v < mn) mn = v; if (v > mx) mx = v; } p.min = mn; p.max = mx; p.grain = E.autoGrain(c); p.future = nonNull.filter((v) => v > Date.now() + 864e5 * 2).length; }
      if (c.type === 'category' || c.type === 'text' || c.type === 'id') {
        const counts = new Map(); let ws = 0;
        for (const v of nonNull) { counts.set(v, (counts.get(v) || 0) + 1); if (typeof v === 'string' && v !== v.trim()) ws++; }
        let top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        if (c.order) top = c.order.map((o) => [o, counts.get(o) || 0]).concat(top.filter(([k]) => !c.order.includes(k)));
        p.top = top.slice(0, 12); p.whitespace = ws;
        if (c.type === 'category') {
          const groups = new Map();
          for (const [v, cnt] of counts) { const k = String(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push([v, cnt]); }
          p.inconsistent = [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => b[1] - a[1]));
        }
        if (c.type === 'text') { const lens = nonNull.map((v) => String(v).length); p.avgLen = S.mean(lens); }
      }
      return p;
    });
    // duplicates
    const seen = new Set(); let dup = 0;
    for (let i = 0; i < n; i++) { const k = cols.map((c) => c.values[i]).join('\u0001'); if (seen.has(k)) dup++; else seen.add(k); }
    const cells = n * cols.length || 1;
    const nonMissing = cells - missingCells || 1;
    const inconsistentCols = colProfiles.filter((p) => (p.inconsistent && p.inconsistent.length) || p.whitespace).length;
    const catCols = colProfiles.filter((p) => p.type === 'category').length || 1;
    const badStruct = colProfiles.filter((p) => p.constant || p.missingPct > 0.95).length + (ds.unnamedHeaders || 0);
    const health = {
      completeness: 100 * (1 - missingCells / cells),
      uniqueness: 100 * (1 - Math.min(1, (dup / Math.max(1, n)) * 8)),
      validity: 100 * (1 - invalidCells / nonMissing),
      consistency: Math.max(0, 100 - inconsistentCols * 25),
      structure: 100 * (1 - Math.min(1, badStruct / Math.max(1, cols.length)) * 0.8),
    };
    health.score = Math.round(health.completeness * 0.3 + health.uniqueness * 0.2 + health.validity * 0.2 + health.consistency * 0.15 + health.structure * 0.15);

    // issues + recommended fixes
    const issues = [];
    if (dup) issues.push({ id: 'dup', severity: dup / n > 0.01 ? 'warning' : 'info', title: `${dup.toLocaleString()} duplicate rows`, detail: 'Rows that repeat every value exactly. They inflate totals and counts.', fix: { op: 'drop_duplicates', params: {}, label: 'Remove duplicates' } });
    for (const p of colProfiles) {
      const c = E.col(ds, p.name);
      if (p.missing && p.missingPct < 0.95) {
        const method = p.type === 'number' ? (Math.abs(p.desc.skew) > 1 || c.values.every((v) => v == null || Number.isInteger(v)) ? 'median' : 'mean') : p.type === 'date' ? 'ffill' : 'mode';
        const rec = p.type === 'text' || p.type === 'id' ? null : { op: 'fill_missing', params: { col: p.name, method }, label: `Fill with ${method === 'ffill' ? 'previous value' : method}` };
        issues.push({ id: 'miss_' + p.name, col: p.name, severity: p.missingPct > 0.2 ? 'critical' : p.missingPct > 0.05 ? 'warning' : 'info', title: `${p.missing.toLocaleString()} missing in ${p.name}`, detail: `${fmt.pct(p.missingPct)} of rows are blank.${rec ? ` Recommended: ${rec.label.toLowerCase()}${method === 'median' ? ' (the column is skewed, so the median is more robust)' : ''}.` : ''}`, fix: rec, alt: { op: 'drop_missing', params: { cols: [p.name] }, label: 'Remove those rows' } });
      }
      if (p.missingPct >= 0.95) issues.push({ id: 'empty_' + p.name, col: p.name, severity: 'warning', title: `${p.name} is almost empty`, detail: `${fmt.pct(p.missingPct)} missing. It adds little to any analysis.`, fix: { op: 'drop_column', params: { col: p.name }, label: 'Remove column' } });
      if (p.invalid) issues.push({ id: 'inv_' + p.name, col: p.name, severity: p.invalid / n > 0.02 ? 'warning' : 'info', title: `${p.invalid} invalid ${p.type === 'date' ? 'dates' : 'values'} in ${p.name}`, detail: `Could not read: ${p.invalidExamples.slice(0, 3).map((x) => '"' + x + '"').join(', ')}. They are treated as missing.`, fix: null });
      if (p.inconsistent && p.inconsistent.length) { const ex = p.inconsistent[0]; issues.push({ id: 'inc_' + p.name, col: p.name, severity: 'warning', title: `Inconsistent labels in ${p.name}`, detail: `${p.inconsistent.length} value${p.inconsistent.length > 1 ? 's are' : ' is'} spelled more than one way, e.g. ${ex.map(([v]) => '"' + v + '"').join(' / ')}.`, fix: { op: 'text_clean', params: { col: p.name, fn: 'standardize' }, label: 'Standardise labels' } }); }
      else if (p.whitespace) issues.push({ id: 'ws_' + p.name, col: p.name, severity: 'info', title: `Extra spaces in ${p.name}`, detail: `${p.whitespace} values have leading or trailing spaces.`, fix: { op: 'text_clean', params: { col: p.name, fn: 'trim' }, label: 'Trim spaces' } });
      if (p.type === 'number' && p.desc && p.desc.n > 20) {
        const s = S.sorted(S.nums(c.values)); const q1 = p.desc.q1, q3 = p.desc.q3, iqr = q3 - q1;
        let extreme = iqr > 0 ? s.filter((v) => v < q1 - 3 * iqr || v > q3 + 3 * iqr).length : 0, method = 'iqr';
        if (!(extreme && extreme / n < 0.01) && p.desc.skew > 1 && s[0] > 0) { // skewed positive data: the plain IQR fence flags too many values, so also try the log scale
          const lg = s.map(Math.log); const ql = (pp) => { const pos = (lg.length - 1) * pp, b = Math.floor(pos); return lg[b] + (lg[Math.min(b + 1, lg.length - 1)] - lg[b]) * (pos - b); };
          const a = ql(0.25), z = ql(0.75), lo = Math.exp(a - 3 * (z - a)), hi = Math.exp(z + 3 * (z - a));
          const le = z > a ? s.filter((v) => v < lo || v > hi).length : 0;
          if (le) { extreme = le; method = 'logiqr'; }
        }
        if (extreme && extreme / n < 0.01) {
          const huge = p.desc.median > 0 && p.desc.max / p.desc.median > 20;
          issues.push({ id: 'out_' + p.name, col: p.name, severity: huge ? 'warning' : 'info', title: `${extreme} extreme outlier${extreme > 1 ? 's' : ''} in ${p.name}`, detail: `${method === 'logiqr' ? 'Values far outside the typical range even on a log scale' : 'Values beyond 3×IQR from the quartiles'} (max ${fmt.num(p.desc.max)} vs median ${fmt.num(p.desc.median)}). Check whether they are real before removing.`, fix: { op: 'outliers', params: { col: p.name, method, action: 'cap', k: 3 }, label: 'Cap extreme values' } });
        }
      }
      if (p.nonneg) issues.push({ id: 'neg_' + p.name, col: p.name, severity: 'warning', title: `${p.negatives} impossible negative value${p.negatives > 1 ? 's' : ''} in ${p.name}`, detail: `${p.name} looks like something that cannot be below zero (lowest ${fmt.num(p.desc.min)}). This is usually a data-entry or system error. They are blanked, not deleted.`, fix: { op: 'negative_to_missing', params: { col: p.name }, label: 'Blank out negatives' } });
      if (p.constant) issues.push({ id: 'const_' + p.name, col: p.name, severity: 'info', title: `${p.name} has one value only`, detail: `Every row is "${p.top ? p.top[0][0] : fmt.num(p.desc && p.desc.min)}".`, fix: { op: 'drop_column', params: { col: p.name }, label: 'Remove column' } });
      if (p.type === 'date' && p.future) issues.push({ id: 'fut_' + p.name, col: p.name, severity: 'info', title: `${p.future} future dates in ${p.name}`, detail: 'Dates after today. Check for typos in the year.', fix: null });
    }
    const sevRank = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

    // roles
    const numeric = cols.filter((c) => c.type === 'number' && !/(^|_)(id|year|zip|postcode|lat|lon|latitude|longitude)$/i.test(c.name));
    const pickMeasure = () => {
      const strong = numeric.filter((c) => STRONG_MEASURE.test(c.name)); if (strong.length) return strong[0];
      const hinted = numeric.filter((c) => MEASURE_HINT.test(c.name) && !/age/i.test(c.name)); if (hinted.length) return hinted[0];
      return numeric.sort((a, b) => (colProfiles.find((p) => p.name === b.name).desc.cv || 0) - (colProfiles.find((p) => p.name === a.name).desc.cv || 0))[0];
    };
    const measure = pickMeasure();
    const dateCol = cols.find((c) => c.type === 'date' && colProfiles.find((p) => p.name === c.name).unique > 3);
    const dims = cols.filter((c) => c.type === 'category').map((c) => ({ c, p: colProfiles.find((p) => p.name === c.name) })).filter(({ c, p }) => p.unique >= 2 && p.unique <= 30 && p.missingPct < 0.3 && !c.likert).map(({ c }) => c.name);
    const likert = cols.filter((c) => c.likert).map((c) => c.name);
    const isSurvey = likert.length >= 2 || (cols.some((c) => /timestamp/i.test(c.name)) && cols.filter((c) => c.name.length > 30).length >= 2);

    const prof = { rev: ds.rev, n, ncols: cols.length, cells, missingCells, missingPct: missingCells / cells, dup, invalidCells, cols: colProfiles, health, issues, measure: measure && measure.name, dateCol: dateCol && dateCol.name, dims, numeric: numeric.map((c) => c.name), likert, isSurvey, typeCounts: cols.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {}) };
    ds._profile = prof;
    return prof;
  };

  /* ---------- KPIs ---------- */
  E.kpis = function (ds) {
    const p = E.profile(ds); const out = [];
    const m = p.measure && E.col(ds, p.measure);
    if (m) {
      const agg = E.defaultAgg(m); const v = S.nums(m.values); const val = agg === 'sum' ? S.sum(v) : S.mean(v);
      const k = { label: (agg === 'sum' ? 'Total ' : 'Average ') + m.name.replace(/_/g, ' '), value: fmt.compact(val, m.unit), raw: val };
      if (p.dateCol) {
        const t = E.aggregate(ds, { by: [p.dateCol], metrics: [{ col: m.name, agg }], timeGrain: E.autoGrain(E.col(ds, p.dateCol)) });
        const rows = t.rows.filter((r) => isNum(r[1]));
        if (rows.length >= 4) {
          const half = Math.floor(rows.length / 2); const a = rows.slice(0, half).map((r) => r[1]), b = rows.slice(rows.length - half).map((r) => r[1]);
          const sa = agg === 'sum' ? S.sum(a) : S.mean(a), sb = agg === 'sum' ? S.sum(b) : S.mean(b);
          if (sa) { k.delta = sb / sa - 1; k.deltaLabel = 'second half vs first half'; }
          k.spark = rows.map((r) => r[1]);
        }
      }
      out.push(k);
    }
    out.push({ label: 'Rows', value: fmt.num(p.n, 0) });
    out.push({ label: 'Columns', value: String(p.ncols) });
    out.push({ label: 'Dataset health', value: p.health.score + '/100', health: p.health.score });
    return out;
  };

  /* ---------- discovery ---------- */
  function conf(p, n) { if (!isNum(p)) return 'Medium'; if (p < 0.001 && n >= 30) return 'High'; if (p < 0.05) return 'Medium'; return 'Low'; }
  const nice = (s) => E.short(s);

  E.discover = function (ds) {
    if (ds._insights && ds._insights.rev === ds.rev) return ds._insights.list;
    const p = E.profile(ds); const out = [];
    const m = p.measure ? E.col(ds, p.measure) : null; const agg = E.defaultAgg(m);
    const mName = m ? nice(m.name) : 'rows';
    const fm = (v) => (m ? fmt.compact(v, m.unit) : fmt.num(v, 0));
    let dom = null;
    if (m && agg === 'sum' && p.n >= 30) { let tot = 0, mx = -Infinity; for (const v of m.values) if (isNum(v) && v > 0) { tot += v; if (v > mx) mx = v; } if (tot > 0 && mx / tot > 0.2) dom = { share: mx / tot, value: mx, tot }; }
    const domNote = dom ? ` Caution: a single row (${fm(dom.value)}) is ${fmt.pct(dom.share, 0)} of all ${mName}, so this mostly reflects that one value.` : '';

    // 1. Time trend
    if (p.dateCol) {
      const dc = E.col(ds, p.dateCol); const grain = E.autoGrain(dc);
      const t = E.aggregate(ds, { by: [p.dateCol], metrics: m ? [{ col: m.name, agg }] : [], timeGrain: grain });
      let rows = t.rows.filter((r) => isNum(r[1]));
      // drop a trailing partial period if it's much smaller
      if (rows.length > 4 && grain !== 'year') { const last = rows[rows.length - 1][1], prev = S.mean(rows.slice(-4, -1).map((r) => r[1])); if (agg === 'sum' || !m) if (last < prev * 0.5) rows = rows.slice(0, -1); }
      if (rows.length >= 4) {
        const vals = rows.map((r) => r[1]); const x = vals.map((_, i) => i);
        const cor = S.correlation(x, vals);
        const first = vals[0], last = vals[vals.length - 1];
        const half = Math.floor(vals.length / 2); const h1 = S.mean(vals.slice(0, half)), h2 = S.mean(vals.slice(-half));
        const change = h1 ? h2 / h1 - 1 : NaN;
        const dir = change >= 0 ? 'grew' : 'fell';
        const label = (i) => fmt.date(rows[i][0], grain);
        if (!(cor.p > 0.05 && Math.abs(change) < 0.05)) out.push({ id: 'trend', kind: 'Trend', title: cor.p > 0.05 ? `${m ? mName[0].toUpperCase() + mName.slice(1) : 'Volume'} is ${change >= 0 ? 'higher' : 'lower'} in the second half (${fmt.pct(Math.abs(change))}), but no clear trend` : `${m ? mName[0].toUpperCase() + mName.slice(1) : 'Volume'} ${dir} ${fmt.pct(Math.abs(change))}`, body: `Comparing the average ${grain} in the second half of the period with the first half. It moved from ${fm(first)} in ${label(0)} to ${fm(last)} in ${label(vals.length - 1)}. The linear trend is ${S.effectLabel('r', cor.r)} (r = ${cor.r.toFixed(2)}, ${fmt.p(cor.p)}).`, confidence: conf(cor.p, vals.length), score: (cor.p > 0.05 ? 55 : 90) + Math.min(10, Math.abs(change) * 20), chart: { type: 'line', x: p.dateCol, y: m && m.name, agg, grain, trendline: true, title: `${m ? E.AGG_LABEL[agg] + ' ' + mName : 'Rows'} by ${grain}` }, code: E.aggCode({ by: [p.dateCol], metrics: m ? [{ col: m.name, agg }] : [], timeGrain: grain }), evidence: [`Grouped ${p.n.toLocaleString()} rows by ${grain} of ${p.dateCol}`, `${E.AGG_LABEL[agg] || 'Count'} of ${mName} per ${grain}`, `Mean of last ${half} ${grain}s ÷ mean of first ${half} − 1 = ${fmt.signedPct(change)}`] });
        // biggest period jump
        let best = { i: -1, ch: 0 };
        for (let i = 1; i < vals.length; i++) { if (!vals[i - 1]) continue; const ch = vals[i] / vals[i - 1] - 1; if (Math.abs(ch) > Math.abs(best.ch)) best = { i, ch }; }
        const pctChanges = vals.slice(1).map((v, i) => (vals[i] ? v / vals[i] - 1 : 0)); const sdCh = S.std(pctChanges);
        if ((agg === 'sum' || !m) && best.i > 0 && Math.abs(best.ch) > 0.15 && Math.abs(best.ch) > 1.8 * sdCh) out.push({ id: 'spike', kind: 'Anomaly', title: `${label(best.i)} ${best.ch > 0 ? 'jumped' : 'dropped'} ${fmt.pct(Math.abs(best.ch))}`, body: `${mName[0].toUpperCase() + mName.slice(1)} went from ${fm(vals[best.i - 1])} in ${label(best.i - 1)} to ${fm(vals[best.i])}. That is the largest ${grain}-on-${grain} change, about ${(Math.abs(best.ch) / (sdCh || 1)).toFixed(1)}× the typical swing.`, confidence: 'Medium', score: 80 + Math.min(10, Math.abs(best.ch) * 10), chart: { type: 'bar', x: p.dateCol, y: m && m.name, agg, grain, highlight: rows[best.i][0], title: `${E.AGG_LABEL[agg] || 'Count'} ${mName} by ${grain}` }, code: E.aggCode({ by: [p.dateCol], metrics: m ? [{ col: m.name, agg }] : [], timeGrain: grain }), evidence: [`Period-over-period change for each ${grain}`, `Largest change: ${fmt.signedPct(best.ch)} at ${label(best.i)}`, `Typical change (std dev): ${fmt.pct(sdCh)}`] });
        // streak
        let streak = 0; for (let i = vals.length - 1; i > 0 && vals[i] > vals[i - 1]; i--) streak++;
        if (streak >= 3) out.push({ id: 'streak', kind: 'Trend', title: `${streak} consecutive ${grain}s of growth`, body: `${mName[0].toUpperCase() + mName.slice(1)} has risen every ${grain} since ${label(vals.length - 1 - streak)}, reaching ${fm(vals[vals.length - 1])}.`, confidence: 'Medium', score: 70 + streak, chart: { type: 'area', x: p.dateCol, y: m && m.name, agg, grain, title: `${mName} momentum` }, code: E.aggCode({ by: [p.dateCol], metrics: m ? [{ col: m.name, agg }] : [], timeGrain: grain }), evidence: [`Counted consecutive increases from the latest ${grain} backwards`] });
      }
    }

    // 2. Concentration & best/worst segment
    for (const d of p.dims.slice(0, 4)) {
      const t = E.aggregate(ds, { by: [d], metrics: m ? [{ col: m.name, agg: agg === 'sum' ? 'sum' : 'mean' }] : [] });
      const rows = t.rows.filter((r) => isNum(r[1]));
      if (rows.length < 2) continue;
      if (agg === 'sum' || !m) {
        const tot = S.sum(rows.map((r) => r[1])); const sorted = rows.slice().sort((a, b) => b[1] - a[1]); const top = sorted[0]; const share = top[1] / tot; const fair = 1 / rows.length;
        if (share > fair * 1.3 && rows.length <= 30) out.push({ id: 'share_' + d, kind: 'Segment', title: `${top[0]} drives ${fmt.pct(share, 0)} of ${m ? mName : 'rows'}`, body: `${top[0]} is the largest ${nice(d)} with ${fm(top[1])}${sorted[1] ? `, ahead of ${sorted[1][0]} (${fm(sorted[1][1])})` : ''}. An even split across ${rows.length} groups would be ${fmt.pct(fair, 0)} each.`, confidence: 'High', score: 60 + (share / fair) * 5, chart: { type: 'hbar', x: d, y: m && m.name, agg: 'sum', title: `${m ? 'Total ' + mName : 'Rows'} by ${nice(d)}` }, code: E.aggCode({ by: [d], metrics: m ? [{ col: m.name, agg: 'sum' }] : [], sort: { by: m ? 'sum_' + m.name : 'count', dir: 'desc' } }), evidence: [`Summed ${mName} for each ${nice(d)}`, `${top[0]}: ${fm(top[1])} of ${fm(tot)} total = ${fmt.pct(share)}`] });
      }
      if (m) {
        const groups = [...new Set(E.col(ds, d).values.filter((v) => v != null))].map((g) => ({ name: g, values: m.values.filter((_, i) => E.col(ds, d).values[i] === g) }));
        const an = S.anova(groups);
        if (an && an.p < 0.05 && an.eta2 >= 0.01 && out.filter((o) => o.id.startsWith('anova_')).length < 2) {
          const gs = an.groups.slice().sort((a, b) => b.mean - a.mean); const hi = gs[0], lo = gs[gs.length - 1];
          out.push({ id: 'anova_' + d, kind: 'Segment', title: `${nice(d)[0].toUpperCase() + nice(d).slice(1)} matters for ${mName}`, body: `Average ${mName} is highest for ${hi.name} (${fm(hi.mean)}) and lowest for ${lo.name} (${fm(lo.mean)}), a gap of ${fmt.pct(lo.mean ? hi.mean / lo.mean - 1 : 0, 0)}. ANOVA: F(${an.df1}, ${an.df2}) = ${an.F.toFixed(2)}, ${fmt.p(an.p)}; ${nice(d)} explains ${fmt.pct(an.eta2)} of the variation (${S.effectLabel('eta2', an.eta2)} effect).`, confidence: conf(an.p, an.df2), score: 55 + an.eta2 * 150 + (an.p < 0.001 ? 10 : 0), chart: { type: 'box', x: d, y: m.name, title: `${mName} by ${nice(d)}` }, code: { py: `from scipy import stats\ngroups = [g[${E.pyStr(m.name)}].dropna() for _, g in df.groupby(${E.pyStr(d)})]\nstats.f_oneway(*groups)`, r: `summary(aov(${E.rName(m.name)} ~ ${E.rName(d)}, data = df))` }, evidence: [`One-way ANOVA of ${mName} across ${an.groups.length} ${nice(d)} groups`, `F = ${an.F.toFixed(2)}, ${fmt.p(an.p)}, η² = ${an.eta2.toFixed(3)}`] });
        }
      }
    }

    // 3. Unusual combination (two dims) — standardized residual of a rate/mean
    if (p.dims.length >= 2) {
      const binary = ds.cols.find((c) => c.type === 'category' && E.profile(ds).cols.find((x) => x.name === c.name).unique === 2 && /return|churn|cancel|refund|default|fraud|complain|defect|fail/i.test(c.name));
      if (binary) {
        const pos = [...new Set(binary.values.filter((v) => v != null))].find((v) => /^(yes|y|true|1)$/i.test(String(v))) || binary.values.find((v) => v != null);
        const overall = binary.values.filter((v) => v === pos).length / binary.values.filter((v) => v != null).length;
        let best = null;
        for (let a = 0; a < Math.min(4, p.dims.length); a++) for (let b = a + 1; b < Math.min(4, p.dims.length); b++) {
          const A = E.col(ds, p.dims[a]), B = E.col(ds, p.dims[b]); if (A === binary || B === binary) continue;
          const cell = new Map();
          for (let i = 0; i < ds.n; i++) { const va = A.values[i], vb = B.values[i], y = binary.values[i]; if (va == null || vb == null || y == null) continue; const k = va + '\u0001' + vb; const c = cell.get(k) || { a: va, b: vb, n: 0, k: 0 }; c.n++; if (y === pos) c.k++; cell.set(k, c); }
          for (const c of cell.values()) { if (c.n < 20) continue; const rate = c.k / c.n; const z = (rate - overall) / Math.sqrt((overall * (1 - overall)) / c.n); if (!best || z > best.z) best = { ...c, rate, z, A: A.name, B: B.name }; }
        }
        if (best && best.z > 3) out.push({ id: 'combo', kind: 'Anomaly', title: `${best.a} in ${best.b}: ${nice(binary.name)} rate ${fmt.pct(best.rate, 0)}`, body: `${nice(binary.name)[0].toUpperCase() + nice(binary.name).slice(1)} = ${pos} happens ${(best.rate / overall).toFixed(1)}× more often for ${best.a} in ${best.b} (${best.k} of ${best.n}) than overall (${fmt.pct(overall)}). z = ${best.z.toFixed(1)}.`, confidence: best.z > 4 ? 'High' : 'Medium', score: 88 + Math.min(8, best.z), chart: { type: 'heatmap', x: best.B, y: best.A, rate: { col: binary.name, pos }, title: `${nice(binary.name)} rate by ${nice(best.A)} and ${nice(best.B)}` }, code: { py: `rate = df.assign(flag=df[${E.pyStr(binary.name)}].eq(${E.pyStr(pos)})).pivot_table(index=${E.pyStr(best.A)}, columns=${E.pyStr(best.B)}, values="flag", aggfunc="mean")`, r: `df %>% group_by(${E.rName(best.A)}, ${E.rName(best.B)}) %>% summarise(rate = mean(${E.rName(binary.name)} == ${JSON.stringify(pos)}), n = n())` }, evidence: [`Rate of ${binary.name} = ${pos} for every ${best.A} × ${best.B} cell with ≥ 20 rows`, `Compared each cell to the overall rate with a z-score`, `Top cell: ${fmt.pct(best.rate)} vs ${fmt.pct(overall)} overall`] });
      }
    }

    // 4. Correlations
    const nums = p.numeric.map((n) => E.col(ds, n)).filter((c) => { const pc = p.cols.find((x) => x.name === c.name); return pc.unique > 5; });
    const pairs = [];
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) { const r = S.correlation(nums[i].values, nums[j].values); if (isNum(r.r) && r.n >= 10) pairs.push({ a: nums[i].name, b: nums[j].name, ...r }); }
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    // skip trivially derived pairs (|r| > .98) but mention next
    const meaningful = pairs.filter((q) => Math.abs(q.r) < 0.985 && Math.abs(q.r) >= 0.2 && q.p < 0.01);
    meaningful.slice(0, 2).forEach((q, k) => out.push({ id: 'corr_' + k, kind: 'Relationship', title: `${nice(q.a)} and ${nice(q.b)} move ${q.r > 0 ? 'together' : 'in opposite directions'}`, body: `Pearson r = ${q.r.toFixed(2)} (${S.effectLabel('r', q.r)}, ${fmt.p(q.p)}, n = ${q.n.toLocaleString()}). ${q.r > 0 ? 'Higher' : 'Lower'} ${nice(q.b)} tends to come with higher ${nice(q.a)}. Correlation alone does not show which causes which.`, confidence: conf(q.p, q.n), score: 50 + Math.abs(q.r) * 40, chart: { type: 'scatter', x: q.a, y: q.b, trendline: true, title: `${nice(q.b)} vs ${nice(q.a)}` }, code: { py: `from scipy import stats\nd = df[[${E.pyStr(q.a)}, ${E.pyStr(q.b)}]].dropna()\nstats.pearsonr(d[${E.pyStr(q.a)}], d[${E.pyStr(q.b)}])`, r: `cor.test(df$${E.rName(q.a)}, df$${E.rName(q.b)})` }, evidence: [`Pearson correlation on ${q.n.toLocaleString()} complete pairs`, `95% CI for r: [${q.ci[0].toFixed(2)}, ${q.ci[1].toFixed(2)}]`] }));

    // 5. Categorical association
    if (p.dims.length >= 2) {
      let best = null;
      for (let a = 0; a < Math.min(5, p.dims.length); a++) for (let b = a + 1; b < Math.min(5, p.dims.length); b++) {
        const A = E.col(ds, p.dims[a]), B = E.col(ds, p.dims[b]);
        const la = [...new Set(A.values.filter((v) => v != null))], lb = [...new Set(B.values.filter((v) => v != null))];
        if (la.length > 12 || lb.length > 12) continue;
        const tbl = la.map(() => lb.map(() => 0)); for (let i = 0; i < ds.n; i++) { const x = la.indexOf(A.values[i]), y = lb.indexOf(B.values[i]); if (x >= 0 && y >= 0) tbl[x][y]++; }
        const cs = S.chiSquare(tbl); if (cs.p < 0.01 && cs.cramersV > 0.15 && cs.cramersV < 0.95 && (!best || cs.cramersV > best.cs.cramersV)) best = { A: A.name, B: B.name, cs };
      }
      if (best) out.push({ id: 'assoc', kind: 'Relationship', title: `${nice(best.A)} and ${nice(best.B)} are linked`, body: `A chi-square test shows the mix of ${nice(best.B)} differs by ${nice(best.A)}: χ²(${best.cs.df}) = ${best.cs.chi2.toFixed(1)}, ${fmt.p(best.cs.p)}, Cramér's V = ${best.cs.cramersV.toFixed(2)} (${S.effectLabel('v', best.cs.cramersV)}).`, confidence: conf(best.cs.p, best.cs.N), score: 45 + best.cs.cramersV * 60, chart: { type: 'stacked100', x: best.A, color: best.B, title: `${nice(best.B)} mix by ${nice(best.A)}` }, code: { py: `from scipy import stats\nstats.chi2_contingency(pd.crosstab(df[${E.pyStr(best.A)}], df[${E.pyStr(best.B)}]))`, r: `chisq.test(table(df$${E.rName(best.A)}, df$${E.rName(best.B)}))` }, evidence: [`Cross-tabulated ${nice(best.A)} × ${nice(best.B)}`, `Chi-square test of independence`] });
    }

    // 6. Distribution shape / outliers
    for (const c of nums.slice(0, 6)) {
      const pc = p.cols.find((x) => x.name === c.name); const d = pc.desc; if (!d || d.n < 30) continue;
      if (Math.abs(d.skew) > 1.5) out.push({ id: 'skew_' + c.name, kind: 'Distribution', title: `${nice(c.name)[0].toUpperCase() + nice(c.name).slice(1)} is ${d.skew > 0 ? 'right' : 'left'}-skewed`, body: `The mean (${fmt.compact(d.mean, c.unit)}) sits ${d.skew > 0 ? 'above' : 'below'} the median (${fmt.compact(d.median, c.unit)}) because of a long ${d.skew > 0 ? 'upper' : 'lower'} tail (skewness ${d.skew.toFixed(2)}). Report the median as the typical value.`, confidence: 'High', score: 35 + Math.min(15, Math.abs(d.skew) * 4), chart: { type: 'histogram', x: c.name, title: `Distribution of ${nice(c.name)}` }, code: { py: `df[${E.pyStr(c.name)}].describe()\ndf[${E.pyStr(c.name)}].skew()`, r: `summary(df$${E.rName(c.name)})\ne1071::skewness(df$${E.rName(c.name)}, na.rm = TRUE)` }, evidence: [`Skewness = ${d.skew.toFixed(2)} (|skew| > 1 is strongly skewed)`, `Mean ${fmt.num(d.mean)} vs median ${fmt.num(d.median)}`] });
    }

    // 7. Survey
    if (p.likert.length) {
      const items = p.likert.map((n) => { const c = E.col(ds, n); const v = c.values.filter((x) => x != null); const agree = v.filter((x) => c.order.indexOf(x) >= c.order.length - 2).length / (v.length || 1); const disagree = v.filter((x) => c.order.indexOf(x) <= 1).length / (v.length || 1); return { name: n, agree, disagree, n: v.length }; });
      const top = items.slice().sort((a, b) => b.agree - a.agree)[0], bottom = items.slice().sort((a, b) => b.disagree - a.disagree)[0];
      out.push({ id: 'likert', kind: 'Survey', title: `Strongest agreement: "${top.name.length > 60 ? top.name.slice(0, 57) + '…' : top.name}"`, body: `${fmt.pct(top.agree, 0)} of ${top.n} respondents chose one of the top two options. The item with the most disagreement is "${bottom.name}" (${fmt.pct(bottom.disagree, 0)} in the bottom two).`, confidence: 'High', score: 85, chart: { type: 'likert', cols: p.likert, title: 'Agreement across survey items' }, code: { py: `likert = [${p.likert.map(E.pyStr).join(', ')}]\ndf[likert].apply(lambda s: s.value_counts(normalize=True)).T`, r: `df %>% select(${p.likert.map(E.rName).join(', ')}) %>% pivot_longer(everything()) %>% count(name, value) %>% group_by(name) %>% mutate(share = n / sum(n))` }, evidence: [`Top-two-box share per item`, `Bottom-two-box share per item`] });
      if (p.likert.length >= 3) {
        const alpha = S.cronbach(p.likert.map((n) => { const c = E.col(ds, n); return c.values.map((v) => (v == null ? null : c.order.indexOf(v) + 1)); }));
        if (alpha) out.push({ id: 'alpha', kind: 'Survey', title: `Scale reliability is ${alpha.label.toLowerCase()} (α = ${alpha.alpha.toFixed(2)})`, body: `Cronbach's alpha across ${alpha.k} Likert items, ${alpha.n} complete responses. ${alpha.alpha >= 0.7 ? 'The items can reasonably be combined into one score.' : 'The items may measure different things; check them before combining.'}`, confidence: 'High', score: 60, chart: null, code: { py: `import pingouin as pg\npg.cronbach_alpha(data=df[likert].apply(lambda s: s.map(scale_map)))`, r: `psych::alpha(df %>% select(${p.likert.map(E.rName).join(', ')}) %>% mutate(across(everything(), ~ as.integer(factor(.x, levels = scale_levels)))))` }, evidence: [`Mapped each answer to 1–${E.col(ds, p.likert[0]).order.length}`, `α = k/(k−1) × (1 − Σ item variances / total variance)`] });
      }
    }

    // 8. Quality
    if (p.health.score < 90 || p.issues.some((i) => i.severity !== 'info')) {
      const top = p.issues.slice(0, 3).map((i) => i.title.toLowerCase());
      out.push({ id: 'quality', kind: 'Quality', title: `${p.issues.length} data quality issue${p.issues.length === 1 ? '' : 's'} to review`, body: `Health score ${p.health.score}/100. Most important: ${top.join('; ')}. Fixing these first makes every other result more reliable.`, confidence: 'High', score: p.health.score < 85 ? 75 : 40, chart: null, action: 'clean', code: { py: 'df.isna().sum()\ndf.duplicated().sum()', r: 'colSums(is.na(df))\nsum(duplicated(df))' }, evidence: p.issues.slice(0, 5).map((i) => i.title) });
    }

    if (dom) {
      out.forEach((i) => { if (['trend', 'spike', 'streak'].includes(i.id) || /^(share_|anova_)/.test(i.id)) { i.body += domNote; i.confidence = 'Low'; i.score -= 30; } });
      out.push({ id: 'dominant', kind: 'Anomaly', title: `One row makes up ${fmt.pct(dom.share, 0)} of all ${mName}`, body: `The largest single value (${fm(dom.value)}) is ${fmt.pct(dom.share, 0)} of the ${fm(dom.tot)} total. Totals, trends and segment shares are dominated by it. Check whether it is real or a data-entry error before trusting them.`, confidence: 'High', score: 96, chart: { type: 'histogram', x: m.name, title: `Distribution of ${mName}` }, action: 'clean', code: { py: `df.nlargest(5, ${E.pyStr(m.name)})`, r: `df %>% arrange(desc(${E.rName(m.name)})) %>% head(5)` }, evidence: [`Largest value ${fm(dom.value)} ÷ total ${fm(dom.tot)} = ${fmt.pct(dom.share)}`] });
    }
    out.sort((a, b) => b.score - a.score);
    out.forEach((o, i) => (o.rank = i + 1));
    ds._insights = { rev: ds.rev, list: out };
    return out;
  };

  /* ---------- suggested questions ---------- */
  E.suggestQuestions = function (ds) {
    const p = E.profile(ds); const q = [];
    const m = p.measure && nice(p.measure); const d0 = p.dims[0] && nice(p.dims[0]); const d1 = p.dims[1] && nice(p.dims[1]);
    if (m && p.dateCol) q.push(`What is the ${m} trend over time?`);
    if (m && d0) q.push(`Which ${d0} has the highest ${m}?`);
    if (m && d1) q.push(`Compare ${m} across ${d1}`);
    if (p.numeric.length >= 2) q.push('Show me the strongest correlations');
    if (m && p.dateCol) q.push(`Forecast ${m} for the next 6 periods`);
    if (m && p.numeric.length >= 3) q.push(`What drives ${m}?`);
    if (p.likert.length) q.push('Summarise the survey responses');
    q.push('Find unusual values');
    q.push('Find problems in this dataset');
    q.push("Tell me what's going on");
    return q.slice(0, 8);
  };

  /* ---------- text document analysis ---------- */
  const STOP = new Set('a an the and or but if then else of to in on at for from by with without about as is are was were be been being it its this that these those there here we you they he she i me my our your their his her them us not no yes do does did done have has had can could will would should may might must shall into over under than so such very more most less least also just only own same other any each few all both some many much what which who whom whose when where why how up down out off again further once s t don now per via vs etc e.g i.e'.split(' '));
  E.analyzeText = function (text) {
    const clean = text.replace(/\r/g, '');
    const words = (clean.toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]*/gu) || []);
    const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((s) => s.trim()).filter((s) => s.length > 2);
    const paragraphs = clean.split(/\n\s*\n/).filter((s) => s.trim());
    const freq = new Map(); for (const w of words) { if (w.length < 3 || STOP.has(w)) continue; freq.set(w, (freq.get(w) || 0) + 1); }
    const big = new Map(); for (let i = 0; i < words.length - 1; i++) { const a = words[i], b = words[i + 1]; if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 3) continue; const k = a + ' ' + b; big.set(k, (big.get(k) || 0) + 1); }
    const numbers = []; const re = /([$€£]?\s?-?\d[\d,]*\.?\d*(?:\s?%|\s?(?:percent|million|billion|bn|k|m)\b)?)/gi; let mm;
    const lines = clean.split(/\n/);
    for (const line of lines) { re.lastIndex = 0; while ((mm = re.exec(line)) && numbers.length < 200) { const raw = mm[1].trim(); if (/^\d{1,2}$/.test(raw)) continue; const ctx = line.slice(Math.max(0, mm.index - 50), mm.index + raw.length + 50).trim(); numbers.push({ value: raw, context: ctx }); } }
    const dates = (clean.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:\d{1,2}\s)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{4})\b/g) || []).slice(0, 50);
    const emails = (clean.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).length;
    const sLen = sentences.map((s) => (s.match(/\S+/g) || []).length);
    const syll = (w) => Math.max(1, (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || []).length);
    const totalSyl = words.reduce((s, w) => s + syll(w), 0);
    const flesch = words.length && sentences.length ? 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (totalSyl / words.length) : NaN;
    const headings = lines.filter((l) => /^#{1,4}\s/.test(l) || (l.trim().length > 3 && l.trim().length < 70 && /^[A-Z0-9][^.!?]*$/.test(l.trim()) && l.trim() === l.trim().replace(/[a-z]/g, (c) => c) )).slice(0, 20);
    // delimited-table detection
    let delim = null; const sampleLines = lines.filter((l) => l.trim()).slice(0, 30);
    for (const d of [',', '\t', ';', '|']) { const counts = sampleLines.map((l) => l.split(d).length - 1); if (counts.length >= 3 && counts.every((c) => c > 0 && c === counts[0])) { delim = d; break; } }
    return {
      chars: clean.length, words: words.length, unique: new Set(words).size, sentences: sentences.length, paragraphs: paragraphs.length, readingMin: words.length / 230,
      lexical: words.length ? new Set(words).size / words.length : 0, avgSentence: S.mean(sLen), flesch,
      keywords: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25), bigrams: [...big.entries()].filter((e) => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 15),
      numbers, dates, emails, sentenceLengths: sLen, headings, delim, topSentences: rankSentences(sentences, freq).slice(0, 5),
    };
  };
  function rankSentences(sentences, freq) {
    const max = Math.max(1, ...freq.values());
    return sentences.map((s, i) => { const ws = s.toLowerCase().match(/[\p{L}]+/gu) || []; const sc = ws.reduce((t, w) => t + (freq.get(w) || 0) / max, 0) / Math.sqrt(ws.length || 1); return { s, i, sc }; }).filter((x) => x.s.length < 400).sort((a, b) => b.sc - a.sc);
  }
})();
