/* Explain Your Data — chart engine (spec → validated, aggregated Plotly figure) */
(function () {
  const E = window.EYD, S = E.S, isNum = E.isNum, fmt = E.fmt;

  E.CHART_TYPES = [
    { id: 'bar', label: 'Bar', group: 'Comparison' }, { id: 'hbar', label: 'Horizontal bar', group: 'Comparison' }, { id: 'grouped', label: 'Grouped bar', group: 'Comparison' }, { id: 'stacked', label: 'Stacked bar', group: 'Composition' }, { id: 'stacked100', label: '100% stacked', group: 'Composition' },
    { id: 'line', label: 'Line', group: 'Trend' }, { id: 'area', label: 'Area', group: 'Trend' },
    { id: 'scatter', label: 'Scatter', group: 'Relationship' }, { id: 'bubble', label: 'Bubble', group: 'Relationship' }, { id: 'heatmap', label: 'Heatmap', group: 'Relationship' }, { id: 'corr', label: 'Correlation matrix', group: 'Relationship' },
    { id: 'histogram', label: 'Histogram', group: 'Distribution' }, { id: 'box', label: 'Box plot', group: 'Distribution' }, { id: 'violin', label: 'Violin', group: 'Distribution' },
    { id: 'pie', label: 'Pie', group: 'Composition' }, { id: 'donut', label: 'Donut', group: 'Composition' }, { id: 'treemap', label: 'Treemap', group: 'Composition' },
    { id: 'likert', label: 'Likert (diverging)', group: 'Survey' },
  ];
  const NEEDS = {
    bar: { x: 'any', y: 'num?' }, hbar: { x: 'any', y: 'num?' }, grouped: { x: 'any', y: 'num?', color: 'cat' }, stacked: { x: 'any', y: 'num?', color: 'cat' }, stacked100: { x: 'any', color: 'cat' },
    line: { x: 'any', y: 'num?' }, area: { x: 'any', y: 'num?' }, scatter: { x: 'num', y: 'num' }, bubble: { x: 'num', y: 'num', size: 'num' }, heatmap: { x: 'cat', y: 'cat' },
    histogram: { x: 'num' }, box: { y: 'num' }, violin: { y: 'num' }, pie: { x: 'cat' }, donut: { x: 'cat' }, treemap: { x: 'cat' }, corr: {}, likert: {},
  };
  E.CHART_NEEDS = NEEDS;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  E.theme = function () {
    return { series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css('--s' + i)), ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), grid: css('--grid'), axis: css('--axis'), surface: css('--surface'), other: css('--s-other'), div: [css('--div-neg2'), css('--div-neg1'), css('--div-mid'), css('--div-pos1'), css('--div-pos2')], accent: css('--accent'), seq: [css('--seq-1'), css('--seq-2'), css('--seq-3'), css('--seq-4'), css('--seq-5')] };
  };

  const labelOf = (c, v, grain) => (v === '__other__' ? 'Other' : c && c.type === 'date' ? fmt.date(v, grain) : String(v));
  const xVal = (c, v) => (c && c.type === 'date' ? new Date(v).toISOString().slice(0, 10) : v === '__other__' ? 'Other' : v);

  function foldTop(rows, keyIdx, valIdx, n, additive) {
    if (rows.length <= n) return rows;
    const sorted = rows.slice().sort((a, b) => (b[valIdx] || 0) - (a[valIdx] || 0));
    const keep = sorted.slice(0, n - 1);
    if (!additive) return keep;
    const other = keep[0].slice(); other[keyIdx] = '__other__'; other[valIdx] = S.sum(sorted.slice(n - 1).map((r) => r[valIdx] || 0));
    return keep.concat([other]);
  }

  /* ---------- validation ---------- */
  E.validateChart = function (ds, spec) {
    const w = []; const need = NEEDS[spec.type] || {};
    const x = spec.x && E.col(ds, spec.x), y = spec.y && E.col(ds, spec.y), color = spec.color && E.col(ds, spec.color);
    const isCat = (c) => c && (c.type === 'category' || c.type === 'id' || c.type === 'text' || c.type === 'date' || (c.type === 'number' && new Set(c.values).size <= 20));
    if (spec.type === 'likert') { const lik = ds.cols.filter((c) => c.order); if (!lik.length) w.push({ level: 'error', msg: 'This dataset has no Likert-scale columns (e.g. Strongly disagree … Strongly agree).' }); return w; }
    if (spec.type === 'corr') { if (E.profile(ds).numeric.length < 2) w.push({ level: 'error', msg: 'A correlation matrix needs at least two numeric columns.' }); return w; }
    if (need.x && !x && !(spec.type === 'box' || spec.type === 'violin')) w.push({ level: 'error', msg: 'Choose a column for the X axis.' });
    if (need.x === 'num' && x && x.type !== 'number') w.push({ level: 'error', msg: `${spec.x} is ${x.type}, but a ${spec.type} needs a numeric X.`, fix: { type: 'bar' }, fixLabel: 'Use a bar chart instead' });
    if (need.y === 'num' && (!y || y.type !== 'number')) w.push({ level: 'error', msg: `A ${spec.type} needs a numeric Y column.` });
    if ((need.y === 'num?' || need.y === 'num') && y && y.type !== 'number') w.push({ level: 'error', msg: `${spec.y} is not numeric, so it can't be ${spec.agg || 'summed'}. Leave Y empty to count rows.`, fix: { y: null, agg: 'count' }, fixLabel: 'Count rows instead' });
    if (need.color === 'cat' && !color) w.push({ level: 'warn', msg: `Add a "Split by" column for a ${spec.type} chart.` });
    if (need.size && !(spec.size && E.col(ds, spec.size))) w.push({ level: 'warn', msg: 'Pick a numeric column for bubble size.' });
    if (spec.type === 'heatmap' && (!isCat(x) || !isCat(y))) w.push({ level: 'error', msg: 'A heatmap needs two categorical columns.' });
    if ((spec.type === 'box' || spec.type === 'violin') && (!y || y.type !== 'number')) w.push({ level: 'error', msg: `Choose a numeric column for ${spec.type} values.` });
    if (x && ['bar', 'hbar', 'pie', 'donut', 'treemap', 'grouped', 'stacked'].includes(spec.type) && x.type === 'number' && new Set(x.values).size > 25) w.push({ level: 'warn', msg: `${spec.x} is numeric with many values. A histogram shows its distribution better.`, fix: { type: 'histogram', y: null }, fixLabel: 'Switch to histogram' });
    const uniq = x && x.type !== 'date' ? new Set(x.values.filter((v) => v != null)).size : 0;
    if (['pie', 'donut', 'treemap'].includes(spec.type) && x && x.type === 'date') w.push({ level: 'warn', msg: 'Pies split a whole into parts; time periods read better as a line.', fix: { type: 'line' }, fixLabel: 'Use a line chart' });
    if ((spec.type === 'pie' || spec.type === 'donut') && uniq > 7 && !spec.topN) w.push({ level: 'warn', msg: `${spec.x} has ${uniq} categories. Pies stop being readable beyond about 6 slices.`, fix: { type: 'hbar' }, fixLabel: 'Use a bar chart', fix2: { topN: 6 }, fix2Label: 'Top 5 + Other' });
    if ((spec.type === 'pie' || spec.type === 'donut') && y && E.isNonAdditive(y)) w.push({ level: 'warn', msg: `Pie slices must add up to a whole, but ${spec.y} is an average-type measure.`, fix: { type: 'bar' }, fixLabel: 'Use a bar chart' });
    if (y && y.type === 'number' && spec.agg === 'sum' && E.isNonAdditive(y) && spec.type !== 'scatter') w.push({ level: 'warn', msg: `Adding up ${spec.y} gives a misleading total. An average is usually meant.`, fix: { agg: 'mean' }, fixLabel: 'Use average' });
    if ((spec.type === 'line' || spec.type === 'area') && x && x.type !== 'date' && x.type !== 'number' && !x.order) w.push({ level: 'warn', msg: `Lines imply order, but ${spec.x} has no natural order.`, fix: { type: 'bar' }, fixLabel: 'Use a bar chart' });
    if (uniq > 60 && ['bar', 'hbar', 'grouped', 'stacked', 'stacked100'].includes(spec.type) && !spec.topN) w.push({ level: 'info', msg: `Showing the top 15 of ${uniq} ${spec.x} values; the rest are grouped as Other.` });
    if (color) { const cu = new Set(color.values.filter((v) => v != null)).size; if (cu > 8) w.push({ level: 'info', msg: `${spec.color} has ${cu} values; the top 7 are shown and the rest grouped as Other.` }); }
    return w;
  };

  /* ---------- build ---------- */
  E.buildFigure = function (ds, spec) {
    const T = E.theme();
    if (spec.custom) return decorate(spec.custom.traces.map((t) => ({ ...t })), Object.assign({}, spec.custom.layout || {}), spec, T, spec.custom.table);
    const x = spec.x && E.col(ds, spec.x), y = spec.y && E.col(ds, spec.y), color = spec.color && E.col(ds, spec.color);
    const agg = y ? spec.agg || E.defaultAgg(y) : 'count';
    const additive = agg === 'sum' || agg === 'count';
    const grain = x && x.type === 'date' ? spec.grain || E.autoGrain(x) : null;
    const traces = []; let layout = {}; let table = null;
    const yLabel = y ? (agg === 'count' ? 'Count' : E.AGG_LABEL[agg] + ' ' + E.short(y.name, 28)) : 'Count of rows';
    const fil = spec.filters || [];
    const metric = y ? [{ col: y.name, agg }] : [];

    let kind = spec.type;
    if (color && ['line', 'area', 'bar', 'hbar'].includes(kind)) kind = kind === 'line' || kind === 'area' ? 'multiline' : 'grouped';
    switch (kind) {
      case 'bar': case 'hbar': case 'line': case 'area': case 'pie': case 'donut': case 'treemap': {
        const t = E.aggregate(ds, { by: [x.name], metrics: metric, timeGrain: grain, filters: fil });
        let rows = t.rows;
        const orderedX = x.type === 'date' || x.type === 'number' || x.order;
        const cap = spec.topN || (spec.type === 'pie' || spec.type === 'donut' ? 7 : spec.type === 'treemap' ? 30 : 15);
        if (!orderedX || spec.type === 'pie' || spec.type === 'donut' || spec.type === 'treemap') rows = foldTop(rows, 0, 1, cap, additive);
        else if (x.order) rows.sort((a, b) => x.order.indexOf(a[0]) - x.order.indexOf(b[0]));
        if (!orderedX && spec.type !== 'pie' && spec.type !== 'donut') rows.sort((a, b) => (a[0] === '__other__' ? 1 : b[0] === '__other__' ? -1 : (b[1] || 0) - (a[1] || 0)));
        const xs = rows.map((r) => xVal(x, r[0])), ys = rows.map((r) => r[1]), labels = rows.map((r) => labelOf(x, r[0], grain));
        table = { columns: [x.name, yLabel], rows: rows.map((r) => [labelOf(x, r[0], grain), r[1]]) };
        const hl = spec.highlight != null ? rows.map((r) => (r[0] === spec.highlight ? T.series[1] : T.series[0])) : rows.map((r) => (r[0] === '__other__' ? T.other : T.series[0]));
        if (spec.type === 'bar') traces.push({ type: 'bar', x: x.type === 'date' ? xs : labels, y: ys, marker: { color: hl }, hovertemplate: '%{x}<br>' + yLabel + ': %{y:,.4~r}<extra></extra>', text: spec.showValues ? ys.map((v) => fmt.compact(v, y && y.unit)) : undefined, textposition: 'outside', cliponaxis: false });
        if (spec.type === 'hbar') { traces.push({ type: 'bar', orientation: 'h', y: labels.slice().reverse(), x: ys.slice().reverse(), marker: { color: hl.slice().reverse() }, hovertemplate: '%{y}<br>' + yLabel + ': %{x:,.4~r}<extra></extra>', text: spec.showValues !== false ? ys.slice().reverse().map((v) => fmt.compact(v, y && y.unit)) : undefined, textposition: 'outside', cliponaxis: false }); layout.margin = { l: Math.min(200, 12 + 7 * Math.max(...labels.map((l) => String(l).length))) }; }
        if (spec.type === 'line' || spec.type === 'area') {
          traces.push({ type: 'scatter', mode: rows.length > 40 ? 'lines' : 'lines+markers', x: x.type === 'date' ? xs : labels, y: ys, line: { color: T.series[0], width: 2 }, marker: { size: 7, color: T.series[0], line: { color: T.surface, width: 2 } }, fill: spec.type === 'area' ? 'tozeroy' : undefined, fillcolor: spec.type === 'area' ? hexA(T.series[0], 0.14) : undefined, name: yLabel, hovertemplate: '%{x}<br>' + yLabel + ': %{y:,.4~r}<extra></extra>' });
          if (spec.trendline && ys.filter(isNum).length > 2) { const idx = ys.map((_, i) => i); const [a, b] = linfit(idx, ys); traces.push({ type: 'scatter', mode: 'lines', x: x.type === 'date' ? xs : labels, y: idx.map((i) => a + b * i), line: { color: T.muted, width: 1.5, dash: 'dash' }, name: 'Linear trend', hoverinfo: 'skip' }); }
          if (spec.rolling) { const k = spec.rolling; traces.push({ type: 'scatter', mode: 'lines', x: x.type === 'date' ? xs : labels, y: ys.map((_, i) => (i + 1 >= k ? S.mean(ys.slice(i + 1 - k, i + 1)) : null)), line: { color: T.series[1], width: 2 }, name: k + '-period average' }); }
        }
        if (spec.type === 'pie' || spec.type === 'donut') traces.push({ type: 'pie', labels, values: ys, hole: spec.type === 'donut' ? 0.58 : 0, sort: false, direction: 'clockwise', marker: { colors: rows.map((r, i) => (r[0] === '__other__' ? T.other : T.series[i % 8])), line: { color: T.surface, width: 2 } }, textinfo: 'percent', textfont: { color: '#fff' }, hovertemplate: '%{label}<br>%{value:,.4~r} (%{percent})<extra></extra>' });
        if (spec.type === 'treemap') traces.push({ type: 'treemap', labels, parents: labels.map(() => ''), values: ys, marker: { colors: rows.map((r, i) => (r[0] === '__other__' ? T.other : T.series[i % 8])), line: { color: T.surface, width: 2 } }, textinfo: 'label+value+percent root', hovertemplate: '%{label}<br>%{value:,.4~r}<extra></extra>' });
        layout.xaxis = { title: spec.type === 'hbar' ? yLabel : x.name }; layout.yaxis = { title: spec.type === 'hbar' ? '' : yLabel };
        if (spec.type === 'pie' || spec.type === 'donut' || spec.type === 'treemap') { layout.showlegend = spec.type !== 'treemap'; layout.legend = { orientation: 'v', x: 1.02, y: 0.5, yanchor: 'middle' }; }
        break;
      }
      case 'grouped': case 'stacked': case 'stacked100': case 'multiline': {
        const t = E.aggregate(ds, { by: [x.name, color ? color.name : x.name], metrics: metric, timeGrain: grain, filters: fil });
        const rows = t.rows;
        const xTot = new Map(); rows.forEach((r) => xTot.set(r[0], (xTot.get(r[0]) || 0) + (r[2] || 0)));
        let xKeys = [...xTot.keys()];
        if (x.type === 'date' || x.type === 'number') xKeys.sort((a, b) => a - b); else if (x.order) xKeys.sort((a, b) => x.order.indexOf(a) - x.order.indexOf(b)); else xKeys = xKeys.sort((a, b) => xTot.get(b) - xTot.get(a)).slice(0, spec.topN || 15);
        const cTot = new Map(); rows.forEach((r) => cTot.set(r[1], (cTot.get(r[1]) || 0) + (r[2] || 0)));
        let cKeys = [...cTot.keys()]; if (color && color.order) cKeys.sort((a, b) => color.order.indexOf(a) - color.order.indexOf(b)); else cKeys.sort((a, b) => cTot.get(b) - cTot.get(a));
        const main = cKeys.slice(0, cKeys.length > 8 ? 7 : 8); const rest = cKeys.length > 8 ? cKeys.slice(7) : [];
        const val = (xk, ck) => { const r = rows.find((q) => q[0] === xk && q[1] === ck); return r ? r[2] : 0; };
        const series = main.map((ck) => ({ ck, vals: xKeys.map((xk) => val(xk, ck)) }));
        if (rest.length && additive) series.push({ ck: '__other__', vals: xKeys.map((xk) => S.sum(rest.map((ck) => val(xk, ck)))) });
        if (spec.type === 'stacked100') { const tot = xKeys.map((_, i) => S.sum(series.map((s) => s.vals[i])) || 1); series.forEach((s) => (s.vals = s.vals.map((v, i) => v / tot[i]))); }
        if (kind === 'multiline') series.forEach((s, i) => { const c = s.ck === '__other__' ? T.other : T.series[i % 8]; traces.push({ type: 'scatter', mode: xKeys.length > 40 ? 'lines' : 'lines+markers', name: s.ck === '__other__' ? 'Other' : labelOf(color, s.ck), x: xKeys.map((k) => (x.type === 'date' ? xVal(x, k) : labelOf(x, k, grain))), y: s.vals, line: { color: c, width: 2 }, marker: { size: 6, color: c }, stackgroup: spec.type === 'area' ? 'one' : undefined, hovertemplate: '%{fullData.name}<br>%{x}: %{y:,.4~r}<extra></extra>' }); });
        else series.forEach((s, i) => traces.push({ type: 'bar', name: s.ck === '__other__' ? 'Other' : labelOf(color, s.ck), x: xKeys.map((k) => (x.type === 'date' ? xVal(x, k) : labelOf(x, k, grain))), y: s.vals, marker: { color: s.ck === '__other__' ? T.other : T.series[i % 8], line: spec.type !== 'grouped' ? { color: T.surface, width: 1 } : undefined }, hovertemplate: '%{fullData.name}<br>%{x}: %{y:' + (spec.type === 'stacked100' ? '.1%' : ',.4~r') + '}<extra></extra>' }));
        if (kind !== 'multiline') layout.barmode = spec.type === 'grouped' || spec.type === 'bar' || spec.type === 'hbar' ? 'group' : 'stack';
        layout.xaxis = { title: x.name }; layout.yaxis = { title: spec.type === 'stacked100' ? 'Share of ' + (y ? E.short(y.name) : 'rows') : yLabel, tickformat: spec.type === 'stacked100' ? '.0%' : undefined };
        table = { columns: [x.name].concat(series.map((s) => (s.ck === '__other__' ? 'Other' : String(s.ck)))), rows: xKeys.map((k, i) => [labelOf(x, k, grain)].concat(series.map((s) => s.vals[i]))) };
        break;
      }
      case 'scatter': case 'bubble': {
        const sz = spec.size && E.col(ds, spec.size);
        const idx = []; for (let i = 0; i < ds.n; i++) if (isNum(x.values[i]) && isNum(y.values[i]) && (!sz || isNum(sz.values[i]))) idx.push(i);
        const step = Math.max(1, Math.ceil(idx.length / 4000)); const pts = idx.filter((_, k) => k % step === 0);
        const groups = new Map();
        let cKeys = [];
        if (color) { const cnt = new Map(); pts.forEach((i) => cnt.set(color.values[i], (cnt.get(color.values[i]) || 0) + 1)); cKeys = [...cnt.keys()].filter((k) => k != null).sort((a, b) => cnt.get(b) - cnt.get(a)); }
        const main = cKeys.slice(0, cKeys.length > 4 ? 3 : 4);
        pts.forEach((i) => { const k = color ? (main.includes(color.values[i]) ? color.values[i] : '__other__') : 'all'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
        const smax = sz ? Math.max(...S.nums(sz.values)) : 1;
        [...groups.entries()].sort((a, b) => (a[0] === '__other__' ? -1 : b[0] === '__other__' ? 1 : main.indexOf(a[0]) - main.indexOf(b[0]))).forEach(([k, arr]) => {
          const ci = main.indexOf(k);
          traces.push({ type: 'scatter', mode: 'markers', name: k === 'all' ? 'Rows' : k === '__other__' ? 'Other' : String(k), x: arr.map((i) => x.values[i]), y: arr.map((i) => y.values[i]), marker: { color: k === '__other__' ? T.other : T.series[ci < 0 ? 0 : ci], size: sz ? arr.map((i) => 6 + 30 * Math.sqrt(Math.max(0, sz.values[i]) / smax)) : 8, opacity: pts.length > 800 ? 0.55 : 0.8, line: { color: T.surface, width: 1 } }, hovertemplate: `${x.name}: %{x:,.4~r}<br>${y.name}: %{y:,.4~r}<extra>%{fullData.name}</extra>` });
        });
        if (spec.trendline) { const [a, b] = linfit(pts.map((i) => x.values[i]), pts.map((i) => y.values[i])); const xs = S.nums(pts.map((i) => x.values[i])); const lo = Math.min(...xs), hi = Math.max(...xs); const r = S.correlation(x.values, y.values); traces.push({ type: 'scatter', mode: 'lines', x: [lo, hi], y: [a + b * lo, a + b * hi], line: { color: T.ink2, width: 2, dash: 'dash' }, name: `Fit (r = ${r.r.toFixed(2)})`, hoverinfo: 'skip' }); }
        layout.xaxis = { title: x.name }; layout.yaxis = { title: y.name };
        if (step > 1) layout.annotations = [{ text: `Showing ${pts.length.toLocaleString()} of ${idx.length.toLocaleString()} points`, xref: 'paper', yref: 'paper', x: 1, y: 1.08, showarrow: false, font: { size: 11, color: T.muted }, xanchor: 'right' }];
        break;
      }
      case 'histogram': {
        const groups = color ? topKeys(color, 3) : [null];
        groups.forEach((g, i) => traces.push({ type: 'histogram', name: g == null ? x.name : String(g), x: x.values.filter((v, k) => isNum(v) && (g == null || color.values[k] === g)), nbinsx: spec.bins || 30, marker: { color: T.series[i], line: { color: T.surface, width: 1 } }, opacity: groups.length > 1 ? 0.6 : 1, hovertemplate: '%{x}<br>%{y} rows<extra>%{fullData.name}</extra>' }));
        if (groups.length > 1) layout.barmode = 'overlay';
        const d = S.describe(x.values);
        layout.shapes = [{ type: 'line', x0: d.median, x1: d.median, yref: 'paper', y0: 0, y1: 1, line: { color: T.ink2, width: 1.5, dash: 'dot' } }];
        layout.annotations = [{ x: d.median, yref: 'paper', y: 1.04, text: 'median ' + fmt.compact(d.median, x.unit), showarrow: false, font: { size: 11, color: T.ink2 } }];
        layout.xaxis = { title: x.name }; layout.yaxis = { title: 'Rows' };
        table = { columns: ['Statistic', x.name], rows: [['Count', d.n], ['Mean', d.mean], ['Median', d.median], ['Std dev', d.sd], ['Min', d.min], ['Max', d.max], ['Skewness', d.skew]] };
        break;
      }
      case 'box': case 'violin': {
        const keys = x ? (x.order ? x.order.slice() : topKeys(x, 12)) : [null];
        keys.forEach((k, i) => { const vals = y.values.filter((v, j) => isNum(v) && (k == null || x.values[j] === k)); traces.push(spec.type === 'box' ? { type: 'box', name: k == null ? y.name : String(k), y: vals, marker: { color: T.series[0], size: 4, outliercolor: T.series[1] }, line: { color: T.series[0], width: 1.5 }, fillcolor: hexA(T.series[0], 0.18), boxpoints: vals.length > 2000 ? false : 'outliers', boxmean: true } : { type: 'violin', name: k == null ? y.name : String(k), y: vals, box: { visible: true }, meanline: { visible: true }, line: { color: T.series[0], width: 1.5 }, fillcolor: hexA(T.series[0], 0.18), points: false }); });
        const yv = S.nums(y.values); const med = S.median(yv); const useLog = yv.length && Math.min(...yv) > 0 && med > 0 && Math.max(...yv) / med > 25;
        layout.showlegend = false; layout.yaxis = { title: y.name + (useLog ? ' (log scale)' : ''), type: useLog ? 'log' : undefined }; layout.xaxis = { title: x ? x.name : '' };
        table = { columns: [x ? x.name : 'Group', 'n', 'Mean', 'Median', 'Std dev'], rows: keys.map((k) => { const v = S.nums(y.values.filter((_, j) => k == null || x.values[j] === k)); return [k == null ? 'All' : k, v.length, S.mean(v), S.median(v), S.std(v)]; }) };
        break;
      }
      case 'heatmap': {
        const xk = x.order ? x.order.slice() : topKeys(x, 15), yk = y.order ? y.order.slice() : topKeys(y, 15);
        let z, zl;
        if (spec.rate) { const rc = E.col(ds, spec.rate.col); z = yk.map((b) => xk.map((a) => { let n = 0, k = 0; for (let i = 0; i < ds.n; i++) if (x.values[i] === a && y.values[i] === b && rc.values[i] != null) { n++; if (rc.values[i] === spec.rate.pos) k++; } return n ? k / n : null; })); zl = `${spec.rate.col} = ${spec.rate.pos} rate`; }
        else { const m = spec.z && E.col(ds, spec.z); const a2 = m ? spec.agg || E.defaultAgg(m) : 'count'; const t = E.aggregate(ds, { by: [x.name, y.name], metrics: m ? [{ col: m.name, agg: a2 }] : [], filters: fil }); const map = new Map(t.rows.map((r) => [r[0] + '\u0001' + r[1], r[2]])); z = yk.map((b) => xk.map((a) => map.get(a + '\u0001' + b) ?? null)); zl = m ? E.AGG_LABEL[a2] + ' ' + m.name : 'Rows'; }
        traces.push({ type: 'heatmap', x: xk.map(String), y: yk.map(String), z, colorscale: T.seq.map((c, i) => [i / (T.seq.length - 1), c]), xgap: 2, ygap: 2, hovertemplate: `${x.name}: %{x}<br>${y.name}: %{y}<br>${zl}: %{z:${spec.rate ? '.1%' : ',.4~r'}}<extra></extra>`, colorbar: { thickness: 10, outlinewidth: 0, tickformat: spec.rate ? '.0%' : undefined, tickfont: { color: T.muted } }, texttemplate: xk.length * yk.length <= 64 ? (spec.rate ? '%{z:.0%}' : '%{z:.3~s}') : undefined });
        layout.xaxis = { title: x.name, type: 'category' }; layout.yaxis = { title: y.name, type: 'category', autorange: 'reversed' };
        table = { columns: [y.name].concat(xk.map(String)), rows: yk.map((b, i) => [b].concat(z[i])) };
        break;
      }
      case 'corr': {
        const cols = (spec.cols || E.profile(ds).numeric).map((n) => E.col(ds, n)).filter(Boolean).slice(0, 14);
        const z = cols.map((a) => cols.map((b) => (a === b ? 1 : S.correlation(a.values, b.values, spec.method || 'pearson').r)));
        const names = cols.map((c) => E.short(c.name, 22));
        traces.push({ type: 'heatmap', x: names, y: names, z, zmin: -1, zmax: 1, colorscale: T.div.map((c, i) => [i / 4, c]), xgap: 2, ygap: 2, texttemplate: cols.length <= 10 ? '%{z:.2f}' : undefined, hovertemplate: '%{y} × %{x}<br>r = %{z:.3f}<extra></extra>', colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: T.muted } } });
        layout.yaxis = { autorange: 'reversed' }; layout.margin = { l: 150, b: 110 };
        table = { columns: [''].concat(names), rows: names.map((n, i) => [n].concat(z[i])) };
        break;
      }
      case 'likert': {
        const cols = (spec.cols && spec.cols.length ? spec.cols.map((n) => E.col(ds, n)) : ds.cols.filter((c) => c.likert || c.order)).filter((c) => c && c.order);
        if (!cols.length) break;
        const levels = cols[0].order; const L = levels.length; const mid = (L - 1) / 2;
        const colorsFor = L === 5 ? [T.div[0], T.div[1], T.div[2], T.div[3], T.div[4]] : levels.map((_, i) => T.div[Math.round((i / (L - 1)) * 4)]);
        const shares = cols.map((c) => { const v = c.values.filter((x) => x != null); return levels.map((l, i) => v.filter((x) => c.order.indexOf(x) === i).length / (v.length || 1)); });
        const names = cols.map((c) => E.short(c.name, 46));
        levels.forEach((lv, i) => {
          const neg = i < mid, neutral = i === mid;
          traces.push({ type: 'bar', orientation: 'h', name: lv, y: names, x: shares.map((s) => (neutral ? s[i] / 2 : neg ? -s[i] : s[i])), base: neutral ? shares.map((s) => -s[i] / 2) : undefined, marker: { color: colorsFor[i], line: { color: T.surface, width: 1 } }, customdata: shares.map((s) => s[i]), hovertemplate: '%{y}<br>' + lv + ': %{customdata:.1%}<extra></extra>' });
          if (neutral) traces.push({ type: 'bar', orientation: 'h', y: names, x: shares.map((s) => s[i] / 2), base: 0, showlegend: false, marker: { color: colorsFor[i], line: { color: T.surface, width: 1 } }, customdata: shares.map((s) => s[i]), hovertemplate: '%{y}<br>' + lv + ': %{customdata:.1%}<extra></extra>' });
        });
        // order: negatives from inside out
        const negTr = traces.filter((t) => t.x.every((v) => v <= 0) && t.base === undefined).reverse(); const others = traces.filter((t) => !negTr.includes(t));
        traces.length = 0; traces.push(...others.filter((t) => t.base !== undefined), ...negTr, ...others.filter((t) => t.base === undefined));
        layout.barmode = 'relative'; layout.xaxis = { tickformat: '.0%', title: '← disagree · agree →', zeroline: true }; layout.yaxis = { autorange: 'reversed' }; layout.margin = { l: Math.min(320, 10 + 6.5 * Math.max(...names.map((n) => n.length))) };
        layout.legend = { traceorder: 'normal' };
        table = { columns: ['Item'].concat(levels), rows: cols.map((c, i) => [c.name].concat(shares[i])) };
        table.pct = true;
        break;
      }
    }
    return decorate(traces, layout, spec, T, table);
  };

  function topKeys(c, n) { const cnt = new Map(); for (const v of c.values) if (v != null) cnt.set(v, (cnt.get(v) || 0) + 1); return [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a)).slice(0, n); }
  function linfit(x, y) { const [a, b] = S.pairs(x, y); const mx = S.mean(a), my = S.mean(b); let sxy = 0, sxx = 0; for (let i = 0; i < a.length; i++) { sxy += (a[i] - mx) * (b[i] - my); sxx += (a[i] - mx) ** 2; } const slope = sxx ? sxy / sxx : 0; return [my - slope * mx, slope]; }
  function hexA(hex, a) { const h = hex.replace('#', ''); if (h.length !== 6) return hex; return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; }
  E.hexA = hexA;

  function decorate(traces, layout, spec, T, table) {
    const ax = (o = {}) => { const title = typeof o.title === 'string' ? o.title : (o.title && o.title.text) || ''; return Object.assign({ gridcolor: T.grid, linecolor: T.axis, zerolinecolor: T.axis, tickfont: { color: T.muted, size: 11 }, automargin: true, zeroline: false, showline: true, ticks: '' }, o, { title: { text: title, font: { color: T.ink2, size: 12 }, standoff: 10 } }); };
    const base = {
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: T.ink2, size: 12 },
      margin: Object.assign({ l: 56, r: 16, t: 28, b: 48 }, layout.margin || {}), hoverlabel: { bgcolor: T.surface, bordercolor: T.grid, font: { color: T.ink, family: 'IBM Plex Sans, system-ui, sans-serif', size: 12 } },
      legend: Object.assign({ orientation: 'h', y: 1.12, x: 0, font: { color: T.ink2, size: 11 }, bgcolor: 'rgba(0,0,0,0)' }, layout.legend || {}), bargap: 0.28, barcornerradius: 4, colorway: T.series, showlegend: layout.showlegend != null ? layout.showlegend : traces.filter((t) => t.showlegend !== false).length > 1,
    };
    const L = Object.assign({}, layout, base);
    L.xaxis = ax(layout.xaxis); L.yaxis = ax(layout.yaxis);
    if (layout.shapes) L.shapes = layout.shapes; if (layout.annotations) L.annotations = layout.annotations;
    if (layout.barmode) L.barmode = layout.barmode;
    return { traces, layout: L, table };
  }

  E.renderChart = async function (el, ds, spec) {
    await E.need('plotly');
    const fig = E.buildFigure(ds, spec);
    el.__spec = spec; el.__dsId = ds.id;
    await window.Plotly.react(el, fig.traces, fig.layout, { displayModeBar: false, responsive: true });
    return fig;
  };
  E.rethemeCharts = function (getDs) {
    if (!window.Plotly) return;
    document.querySelectorAll('.js-plot').forEach((el) => { if (el.__spec && el.__dsId) { const ds = getDs(el.__dsId); if (ds) E.renderChart(el, ds, el.__spec).catch(() => {}); } });
  };
  E.chartImage = async function (ds, spec, w = 900, h = 480, format = 'png') {
    await E.need('plotly');
    const div = document.createElement('div'); div.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px`; document.body.appendChild(div);
    try {
      const fig = E.buildFigure(ds, spec);
      const T = E.theme();
      fig.layout.paper_bgcolor = T.surface; fig.layout.plot_bgcolor = T.surface;
      if (spec.title) { fig.layout.title = { text: spec.title, x: 0, xanchor: 'left', font: { size: 15, color: T.ink, family: 'IBM Plex Sans, sans-serif' } }; fig.layout.margin.t = 64; fig.layout.legend.y = 1.08; }
      await window.Plotly.newPlot(div, fig.traces, fig.layout, { staticPlot: true });
      return await window.Plotly.toImage(div, { format, width: w, height: h, scale: format === 'png' ? 2 : 1 });
    } finally { window.Plotly.purge(div); div.remove(); }
  };

  /* ---------- code for a chart ---------- */
  E.chartCode = function (spec) {
    const q = E.pyStr, rn = E.rName;
    const agg = spec.agg || (spec.y ? 'sum' : 'count');
    const pxMap = { bar: 'bar', hbar: 'bar', grouped: 'bar', stacked: 'bar', stacked100: 'bar', line: 'line', area: 'area', scatter: 'scatter', bubble: 'scatter', histogram: 'histogram', box: 'box', violin: 'violin', pie: 'pie', donut: 'pie', treemap: 'treemap', heatmap: 'density_heatmap' };
    let py = 'import plotly.express as px\n';
    if (['bar', 'hbar', 'line', 'area', 'grouped', 'stacked', 'stacked100', 'pie', 'donut', 'treemap'].includes(spec.type) && spec.x) {
      const by = [spec.x].concat(spec.color ? [spec.color] : []).map(q).join(', ');
      py += spec.y ? `d = df.groupby([${by}], as_index=False)[${q(spec.y)}].${agg === 'mean' ? 'mean' : agg === 'median' ? 'median' : 'sum'}()\n` : `d = df.groupby([${by}], as_index=False).size()\n`;
      const yv = spec.y ? q(spec.y) : '"size"';
      if (spec.type === 'pie' || spec.type === 'donut') py += `fig = px.pie(d, names=${q(spec.x)}, values=${yv}${spec.type === 'donut' ? ', hole=0.58' : ''})`;
      else if (spec.type === 'treemap') py += `fig = px.treemap(d, path=[${q(spec.x)}], values=${yv})`;
      else py += `fig = px.${pxMap[spec.type]}(d, x=${spec.type === 'hbar' ? yv : q(spec.x)}, y=${spec.type === 'hbar' ? q(spec.x) : yv}${spec.color ? ', color=' + q(spec.color) : ''}${spec.type === 'hbar' ? ', orientation="h"' : ''}${spec.type === 'grouped' ? ', barmode="group"' : ''})`;
    } else if (spec.type === 'corr') py += `fig = px.imshow(df.select_dtypes("number").corr(), zmin=-1, zmax=1, color_continuous_scale="RdBu", text_auto=".2f")`;
    else py += `fig = px.${pxMap[spec.type] || 'scatter'}(df${spec.x ? ', x=' + q(spec.x) : ''}${spec.y ? ', y=' + q(spec.y) : ''}${spec.color ? ', color=' + q(spec.color) : ''}${spec.size ? ', size=' + q(spec.size) : ''}${spec.trendline && spec.type === 'scatter' ? ', trendline="ols"' : ''})`;
    py += '\nfig.show()';
    const geom = { bar: 'geom_col()', hbar: 'geom_col() + coord_flip()', grouped: 'geom_col(position = "dodge")', stacked: 'geom_col()', stacked100: 'geom_col(position = "fill")', line: 'geom_line()', area: 'geom_area()', scatter: 'geom_point(alpha = 0.6)', bubble: 'geom_point(alpha = 0.6)', histogram: 'geom_histogram(bins = 30)', box: 'geom_boxplot()', violin: 'geom_violin()', pie: 'geom_col(width = 1) + coord_polar("y")', donut: 'geom_col(width = 1) + coord_polar("y")', heatmap: 'geom_tile()', treemap: 'treemapify::geom_treemap()' }[spec.type] || 'geom_point()';
    let r = 'library(tidyverse)\n';
    if (['bar', 'hbar', 'line', 'area', 'grouped', 'stacked', 'stacked100', 'pie', 'donut', 'treemap'].includes(spec.type) && spec.x) {
      r += `df %>%\n  group_by(${[spec.x].concat(spec.color ? [spec.color] : []).map(rn).join(', ')}) %>%\n  summarise(value = ${spec.y ? (agg === 'mean' ? 'mean' : agg === 'median' ? 'median' : 'sum') + '(' + rn(spec.y) + ', na.rm = TRUE)' : 'n()'}, .groups = "drop") %>%\n  ggplot(aes(x = ${spec.type === 'pie' || spec.type === 'donut' ? '""' : rn(spec.x)}, y = value${spec.color ? ', fill = ' + rn(spec.color) : spec.type === 'pie' || spec.type === 'donut' ? ', fill = ' + rn(spec.x) : ''}${spec.type === 'treemap' ? ', area = value, label = ' + rn(spec.x) : ''})) +\n  ${geom}`;
    } else r += `ggplot(df, aes(${spec.x ? 'x = ' + rn(spec.x) : ''}${spec.y ? (spec.x ? ', ' : '') + 'y = ' + rn(spec.y) : ''}${spec.color ? ', colour = ' + rn(spec.color) : ''}${spec.size ? ', size = ' + rn(spec.size) : ''})) +\n  ${geom}${spec.trendline && spec.type === 'scatter' ? ' +\n  geom_smooth(method = "lm")' : ''}`;
    r += ' +\n  theme_minimal()';
    return { py, r };
  };

  /* ---------- natural language → chart spec (local) ---------- */
  E.matchColumns = function (ds, text) {
    const t = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ') + ' ';
    const SYN = { revenue: ['sales', 'income', 'turnover', 'money', 'earnings'], units: ['quantity', 'qty', 'volume'], customer_age: ['age'], order_date: ['date', 'time', 'month', 'year', 'when', 'over time'], rating: ['stars', 'review'], returned: ['returns', 'return'], yield_t_ha: ['yield'], rainfall_mm: ['rain', 'rainfall'] };
    const hits = [];
    for (const c of ds.cols) {
      const name = c.name.toLowerCase();
      const words = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter((w) => w.length > 2 && !['the', 'and', 'your', 'you', 'what', 'how', 'are', 'per'].includes(w));
      let score = 0, pos = Infinity;
      const full = ' ' + name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
      let p = t.indexOf(full); if (p >= 0) { score += 10; pos = p; }
      for (const w of words) { const stem = w.replace(/(ies|es|s)$/, ''); const re = new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es|ies)?\\b'); const m = t.match(re); if (m && stem.length > 2) { score += words.length === 1 ? 6 : 3; pos = Math.min(pos, m.index); } }
      if (!score) { const qt = t.split(/\s+/).filter((w) => w.length >= 5); for (const w of words) { if (w.length < 5) continue; const pre = w.slice(0, 6); const qi = qt.findIndex((x) => x.slice(0, 6) === pre); if (qi >= 0) { score += 2; pos = Math.min(pos, t.indexOf(qt[qi])); } } }
      for (const [k, syns] of Object.entries(SYN)) if (name === k || name.includes(k)) for (const s of syns) { const i = t.indexOf(' ' + s + ' '); if (i >= 0) { score += 4; pos = Math.min(pos, i); } }
      if (score) hits.push({ c, score, pos });
    }
    return hits.sort((a, b) => b.score - a.score || a.pos - b.pos);
  };

  E.chartFromText = function (ds, text) {
    const t = text.toLowerCase(); const p = E.profile(ds);
    const typeWords = [['donut', 'donut'], ['doughnut', 'donut'], ['pie', 'pie'], ['treemap', 'treemap'], ['scatter', 'scatter'], ['bubble', 'bubble'], ['histogram', 'histogram'], ['distribution', 'histogram'], ['box', 'box'], ['violin', 'violin'], ['heatmap', 'heatmap'], ['heat map', 'heatmap'], ['correlation', 'corr'], ['stacked', 'stacked'], ['grouped', 'grouped'], ['area', 'area'], ['line', 'line'], ['trend', 'line'], ['over time', 'line'], ['monthly', 'line'], ['horizontal', 'hbar'], ['ranking', 'hbar'], ['top', 'hbar'], ['bar', 'bar'], ['likert', 'likert'], ['survey', 'likert']];
    let type = null; for (const [w, ty] of typeWords) if (t.includes(w)) { type = ty; break; }
    const hits = E.matchColumns(ds, text);
    const nums = hits.filter((h) => h.c.type === 'number').map((h) => h.c.name);
    const cats = hits.filter((h) => h.c.type === 'category' || h.c.type === 'date').sort((a, b) => a.pos - b.pos).map((h) => h.c.name);
    const spec = { type: type || 'bar' };
    const agg = /average|mean|avg/.test(t) ? 'mean' : /median/.test(t) ? 'median' : /count|number of|how many/.test(t) ? 'count' : null;
    if (spec.type === 'scatter' || spec.type === 'bubble') { spec.x = nums[0] || p.numeric[0]; spec.y = nums[1] || p.numeric.find((n) => n !== spec.x); if (cats[0]) spec.color = cats[0]; if (spec.type === 'bubble') spec.size = nums[2] || p.numeric.find((n) => n !== spec.x && n !== spec.y); spec.trendline = /trend|fit|regression/.test(t); }
    else if (spec.type === 'histogram') { spec.x = nums[0] || p.measure; if (cats[0]) spec.color = cats[0]; }
    else if (spec.type === 'box' || spec.type === 'violin') { spec.y = nums[0] || p.measure; spec.x = cats[0] || p.dims[0]; }
    else if (spec.type === 'corr') {}
    else if (spec.type === 'likert') {}
    else if (spec.type === 'heatmap') { spec.x = cats[0] || p.dims[0]; spec.y = cats[1] || p.dims[1]; spec.z = nums[0] || p.measure; }
    else {
      const timeish = /over time|trend|monthly|per month|by month|weekly|daily|yearly|by year|timeline/.test(t);
      spec.x = timeish && p.dateCol ? p.dateCol : cats.find((c) => c !== p.dateCol) || cats[0] || (spec.type === 'line' || spec.type === 'area' ? p.dateCol : p.dims[0]);
      spec.y = agg === 'count' ? null : nums[0] || (hits.length ? null : p.measure);
      const splitM = t.match(/(split|colou?r(ed)?|broken down|segmented|for each|stack(ed)?)\s+by\s+([\p{L}\p{N}_ ]+)/u);
      if (timeish && p.dateCol && !splitM) { const c2 = cats.find((c) => c !== p.dateCol); if (c2) spec.color = c2; }
      if (splitM) { const h = E.matchColumns(ds, splitM[4]).filter((x) => x.c.type === 'category'); if (h[0] && h[0].c.name !== spec.x) spec.color = h[0].c.name; }
      else if (cats.length > 1 && ['stacked', 'grouped', 'stacked100'].includes(spec.type)) spec.color = cats.find((c) => c !== spec.x);
      if (spec.x === p.dateCol && (spec.type === 'bar' || spec.type === 'hbar') && timeish) spec.type = 'line';
      if (spec.color && (spec.type === 'bar' || spec.type === 'hbar')) spec.type = 'grouped';
    }
    if (spec.y) spec.agg = agg && agg !== 'count' ? agg : E.defaultAgg(E.col(ds, spec.y));
    const topM = t.match(/top\s+(\d+)/); if (topM) spec.topN = +topM[1] + 1;
    spec.trendline = spec.trendline || /trend ?line|with trend/.test(t);
    spec.showValues = /values|labels|numbers on/.test(t) || undefined;
    spec.title = E.autoTitle(ds, spec);
    return spec;
  };

  E.autoTitle = function (ds, s) {
    const sh = (n) => E.short(n, 30);
    const yl = s.y ? `${E.AGG_LABEL[s.agg || E.defaultAgg(E.col(ds, s.y))] || ''} ${sh(s.y)}`.trim() : 'Rows';
    switch (s.type) {
      case 'scatter': case 'bubble': return `${sh(s.y)} vs ${sh(s.x)}`;
      case 'histogram': return `Distribution of ${sh(s.x)}`;
      case 'box': case 'violin': return `${sh(s.y)}${s.x ? ' by ' + sh(s.x) : ''}`;
      case 'corr': return 'Correlation matrix';
      case 'likert': return 'Survey responses';
      case 'heatmap': return `${s.z ? sh(s.z) : 'Rows'} by ${sh(s.y)} and ${sh(s.x)}`;
      default: return `${yl} by ${sh(s.x || '')}${s.color ? ' and ' + sh(s.color) : ''}`;
    }
  };
})();
