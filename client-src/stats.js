/* Explain Your Data — statistics: descriptive, tests, regression, clustering, forecasting */
(function () {
  const E = window.EYD;
  const S = (E.S = {});
  const isNum = E.isNum;

  /* ---------- special functions ---------- */
  function gammaln(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015; for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  function gammp(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 3e-14) break; } return sum * Math.exp(-x + a * Math.log(x) - gammaln(a)); }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }
  S.normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
  S.tCdf = (t, df) => { const x = df / (df + t * t); const p = 0.5 * ibeta(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
  S.tTwoSided = (t, df) => 2 * (1 - S.tCdf(Math.abs(t), df));
  S.fSurv = (f, d1, d2) => (f <= 0 ? 1 : 1 - ibeta((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2));
  S.chi2Surv = (x, k) => (x <= 0 ? 1 : 1 - gammp(k / 2, x / 2));
  S.tInv = (p, df) => { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (S.tCdf(mid, df) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; };

  /* ---------- descriptive ---------- */
  S.nums = (a) => a.filter(isNum);
  S.sum = (a) => { let s = 0; for (const v of a) s += v; return s; };
  S.mean = (a) => (a.length ? S.sum(a) / a.length : NaN);
  S.variance = (a) => { if (a.length < 2) return NaN; const m = S.mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return s / (a.length - 1); };
  S.std = (a) => Math.sqrt(S.variance(a));
  S.sorted = (a) => a.slice().sort((x, y) => x - y);
  S.quantileSorted = (s, p) => { if (!s.length) return NaN; const pos = (s.length - 1) * p, b = Math.floor(pos); return s[b] + (s[Math.min(b + 1, s.length - 1)] - s[b]) * (pos - b); };
  S.median = (a) => S.quantileSorted(S.sorted(a), 0.5);
  S.skew = (a) => { const n = a.length; if (n < 3) return NaN; const m = S.mean(a), sd = S.std(a); if (!sd) return 0; let s = 0; for (const v of a) s += ((v - m) / sd) ** 3; return (n / ((n - 1) * (n - 2))) * s; };
  S.kurt = (a) => { const n = a.length; if (n < 4) return NaN; const m = S.mean(a), sd = S.std(a); if (!sd) return 0; let s = 0; for (const v of a) s += ((v - m) / sd) ** 4; return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); };
  S.describe = function (a) {
    const v = S.nums(a); const s = S.sorted(v); const n = v.length;
    if (!n) return { n: 0 };
    const mean = S.mean(v), sd = S.std(v), q1 = S.quantileSorted(s, 0.25), q3 = S.quantileSorted(s, 0.75), iqr = q3 - q1;
    let out = 0; for (const x of v) if (x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr) out++;
    return { n, mean, sd, min: s[0], p5: S.quantileSorted(s, 0.05), q1, median: S.quantileSorted(s, 0.5), q3, p95: S.quantileSorted(s, 0.95), max: s[n - 1], iqr, skew: S.skew(v), kurt: S.kurt(v), cv: mean ? sd / Math.abs(mean) : NaN, sum: S.sum(v), outliers: out, zeros: v.filter((x) => x === 0).length, se: sd / Math.sqrt(n) };
  };
  S.histogram = function (a, bins = 20) {
    const v = S.nums(a); if (!v.length) return [];
    let mn = Infinity, mx = -Infinity; for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; }
    if (mn === mx) return [{ x0: mn, x1: mx, n: v.length }];
    const w = (mx - mn) / bins; const h = Array.from({ length: bins }, (_, i) => ({ x0: mn + i * w, x1: mn + (i + 1) * w, n: 0 }));
    for (const x of v) h[Math.min(bins - 1, Math.floor((x - mn) / w))].n++;
    return h;
  };
  S.rank = function (a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length);
    for (let i = 0; i < idx.length; ) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; }
    return r;
  };
  S.pairs = function (x, y) { const a = [], b = []; for (let i = 0; i < x.length; i++) if (isNum(x[i]) && isNum(y[i])) { a.push(x[i]); b.push(y[i]); } return [a, b]; };
  S.pearsonRaw = function (a, b) { const n = a.length; if (n < 3) return NaN; const ma = S.mean(a), mb = S.mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN; };
  S.correlation = function (x, y, method = 'pearson') {
    let [a, b] = S.pairs(x, y); const n = a.length;
    if (method === 'spearman') { a = S.rank(a); b = S.rank(b); }
    const r = S.pearsonRaw(a, b);
    if (!isNum(r)) return { r: NaN, n, p: NaN };
    const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
    const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))), se = 1 / Math.sqrt(Math.max(1, n - 3));
    return { r, n, p: S.tTwoSided(t, n - 2), t, ci: [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)] };
  };

  /* ---------- tests ---------- */
  S.welch = function (a, b) {
    a = S.nums(a); b = S.nums(b); const na = a.length, nb = b.length; if (na < 2 || nb < 2) return null;
    const ma = S.mean(a), mb = S.mean(b), va = S.variance(a), vb = S.variance(b);
    const se = Math.sqrt(va / na + vb / nb); const t = (ma - mb) / se;
    const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    const sp = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2)); const d = sp ? (ma - mb) / sp : 0;
    const tc = S.tInv(0.975, df);
    return { test: "Welch's t-test", t, df, p: S.tTwoSided(t, df), meanA: ma, meanB: mb, diff: ma - mb, ci: [ma - mb - tc * se, ma - mb + tc * se], d, na, nb };
  };
  S.pairedT = function (a, b) {
    const [x, y] = S.pairs(a, b); const d = x.map((v, i) => v - y[i]); const n = d.length; if (n < 2) return null;
    const md = S.mean(d), sd = S.std(d); const t = md / (sd / Math.sqrt(n));
    return { test: 'Paired t-test', t, df: n - 1, p: S.tTwoSided(t, n - 1), meanDiff: md, n, d: sd ? md / sd : 0 };
  };
  S.anova = function (groups) {
    const gs = groups.map((g) => ({ name: g.name, v: S.nums(g.values) })).filter((g) => g.v.length >= 2);
    if (gs.length < 2) return null;
    const all = gs.flatMap((g) => g.v); const gm = S.mean(all); let ssb = 0, ssw = 0;
    for (const g of gs) { const m = S.mean(g.v); ssb += g.v.length * (m - gm) ** 2; for (const x of g.v) ssw += (x - m) ** 2; }
    const df1 = gs.length - 1, df2 = all.length - gs.length; const F = ssb / df1 / (ssw / df2);
    return { test: 'One-way ANOVA', F, df1, df2, p: S.fSurv(F, df1, df2), eta2: ssb / (ssb + ssw), groups: gs.map((g) => ({ name: g.name, n: g.v.length, mean: S.mean(g.v), sd: S.std(g.v), median: S.median(g.v) })) };
  };
  S.chiSquare = function (table) {
    // table: rows x cols counts
    const R = table.length, C = table[0].length; const rs = table.map((r) => S.sum(r)); const cs = table[0].map((_, j) => S.sum(table.map((r) => r[j]))); const N = S.sum(rs);
    let chi2 = 0; const exp = table.map((r, i) => r.map((_, j) => (rs[i] * cs[j]) / N)); let lowExp = 0;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const e = exp[i][j]; if (e < 5) lowExp++; if (e > 0) chi2 += (table[i][j] - e) ** 2 / e; }
    const df = (R - 1) * (C - 1);
    const resid = table.map((r, i) => r.map((o, j) => (exp[i][j] ? (o - exp[i][j]) / Math.sqrt(exp[i][j]) : 0)));
    return { test: 'Chi-square test of independence', chi2, df, p: S.chi2Surv(chi2, df), cramersV: Math.sqrt(chi2 / (N * Math.max(1, Math.min(R - 1, C - 1)))), N, expected: exp, residuals: resid, lowExpected: lowExp / (R * C) };
  };
  S.mannWhitney = function (a, b) {
    a = S.nums(a); b = S.nums(b); const n1 = a.length, n2 = b.length; if (n1 < 2 || n2 < 2) return null;
    const r = S.rank(a.concat(b)); const R1 = S.sum(r.slice(0, n1)); const U1 = R1 - (n1 * (n1 + 1)) / 2; const U = Math.min(U1, n1 * n2 - U1);
    const mu = (n1 * n2) / 2, sd = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12); const z = (U - mu) / sd;
    return { test: 'Mann–Whitney U', U, z, p: 2 * S.normCdf(-Math.abs(z)), medianA: S.median(a), medianB: S.median(b), rEffect: Math.abs(z) / Math.sqrt(n1 + n2) };
  };
  S.kruskal = function (groups) {
    const gs = groups.map((g) => ({ name: g.name, v: S.nums(g.values) })).filter((g) => g.v.length >= 2); if (gs.length < 2) return null;
    const all = gs.flatMap((g) => g.v); const r = S.rank(all); const N = all.length; let off = 0, H = 0;
    for (const g of gs) { const rs = S.sum(r.slice(off, off + g.v.length)); H += (rs * rs) / g.v.length; off += g.v.length; }
    H = (12 / (N * (N + 1))) * H - 3 * (N + 1); const df = gs.length - 1;
    return { test: 'Kruskal–Wallis', H, df, p: S.chi2Surv(H, df), groups: gs.map((g) => ({ name: g.name, n: g.v.length, median: S.median(g.v) })) };
  };
  S.jarqueBera = function (a) { const v = S.nums(a); const n = v.length; if (n < 8) return null; const s = S.skew(v), k = S.kurt(v); const JB = (n / 6) * (s * s + (k * k) / 4); return { test: 'Jarque–Bera normality', JB, p: S.chi2Surv(JB, 2), skew: s, kurt: k, n }; };

  /* ---------- linear algebra ---------- */
  function solve(A, b) {
    const n = A.length; const M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
    return M.map((r, i) => r[n] / r[i]);
  }
  function inverse(A) { const n = A.length; const cols = []; for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = 1; const x = solve(A, e); if (!x) return null; cols.push(x); } return A.map((_, i) => cols.map((c) => c[i])); }

  /* OLS with one-hot categorical predictors */
  S.regression = function (ds, target, predictors) {
    const yc = E.col(ds, target); const pcs = predictors.map((p) => E.col(ds, p)).filter(Boolean);
    const design = []; const names = ['(Intercept)'];
    const levelsOf = {};
    for (const c of pcs) {
      if (c.type === 'number') names.push(c.name);
      else { const counts = new Map(); c.values.forEach((v) => v != null && counts.set(v, (counts.get(v) || 0) + 1)); let lv = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 12); if (c.order) lv = c.order.filter((o) => lv.includes(o)); levelsOf[c.name] = lv; lv.slice(1).forEach((l) => names.push(c.name + ' = ' + l)); }
    }
    const y = [];
    for (let i = 0; i < ds.n; i++) {
      const yv = yc.values[i]; if (!isNum(yv)) continue; const row = [1]; let ok = true;
      for (const c of pcs) { const v = c.values[i]; if (c.type === 'number') { if (!isNum(v)) { ok = false; break; } row.push(v); } else { const lv = levelsOf[c.name]; if (v == null || !lv.includes(v)) { ok = false; break; } lv.slice(1).forEach((l) => row.push(v === l ? 1 : 0)); } }
      if (ok) { design.push(row); y.push(yv); }
    }
    const n = y.length, k = names.length; if (n <= k + 1) return null;
    const XtX = names.map((_, a) => names.map((_, b) => { let s = 0; for (const r of design) s += r[a] * r[b]; return s; }));
    const Xty = names.map((_, a) => { let s = 0; design.forEach((r, i) => (s += r[a] * y[i])); return s; });
    const beta = solve(XtX, Xty); if (!beta) return { error: 'Predictors are perfectly collinear. Remove one and try again.' };
    const yhat = design.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0)); const resid = y.map((v, i) => v - yhat[i]);
    const sse = S.sum(resid.map((e) => e * e)); const my = S.mean(y); const sst = S.sum(y.map((v) => (v - my) ** 2));
    const r2 = 1 - sse / sst, df = n - k, s2 = sse / df; const inv = inverse(XtX);
    const coefs = names.map((nm, j) => { const se = inv ? Math.sqrt(Math.max(0, inv[j][j] * s2)) : NaN; const t = beta[j] / se; return { name: nm, coef: beta[j], se, t, p: S.tTwoSided(t, df) }; });
    // standardized importance for numeric predictors
    const sdY = S.std(y);
    coefs.forEach((c, j) => { if (j === 0) return; const col = design.map((r) => r[j]); c.stdCoef = (c.coef * S.std(col)) / sdY; });
    const F = (sst - sse) / (k - 1) / s2;
    return { target, predictors, n, k, r2, adjR2: 1 - ((1 - r2) * (n - 1)) / df, rmse: Math.sqrt(sse / n), F, pF: S.fSurv(F, k - 1, df), coefs, fitted: yhat, actual: y, resid };
  };

  /* ---------- k-means + PCA ---------- */
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  S.rng = rng;
  S.standardize = function (cols, n) {
    const rows = []; const idx = [];
    const stats = cols.map((c) => { const v = S.nums(c.values); return { m: S.mean(v), s: S.std(v) || 1 }; });
    for (let i = 0; i < n; i++) { const r = []; let ok = true; for (let j = 0; j < cols.length; j++) { const v = cols[j].values[i]; if (!isNum(v)) { ok = false; break; } r.push((v - stats[j].m) / stats[j].s); } if (ok) { rows.push(r); idx.push(i); } }
    return { rows, idx, stats };
  };
  S.kmeans = function (X, k, seed = 7) {
    const r = rng(seed); const n = X.length, d = X[0].length; const C = [X[Math.floor(r() * n)].slice()];
    while (C.length < k) { const dist = X.map((x) => Math.min(...C.map((c) => c.reduce((s, v, j) => s + (v - x[j]) ** 2, 0)))); const tot = S.sum(dist); let t = r() * tot, i = 0; for (; i < n - 1; i++) { t -= dist[i]; if (t <= 0) break; } C.push(X[i].slice()); }
    let lab = new Array(n).fill(0);
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) { let best = 0, bd = Infinity; for (let c = 0; c < k; c++) { let s = 0; for (let j = 0; j < d; j++) s += (X[i][j] - C[c][j]) ** 2; if (s < bd) { bd = s; best = c; } } if (lab[i] !== best) { lab[i] = best; moved = true; } }
      for (let c = 0; c < k; c++) { const m = new Array(d).fill(0); let cnt = 0; for (let i = 0; i < n; i++) if (lab[i] === c) { cnt++; for (let j = 0; j < d; j++) m[j] += X[i][j]; } if (cnt) C[c] = m.map((v) => v / cnt); }
      if (!moved && it > 0) break;
    }
    let inertia = 0; for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) inertia += (X[i][j] - C[lab[i]][j]) ** 2;
    return { labels: lab, centroids: C, inertia };
  };
  S.silhouette = function (X, lab, k, max = 600) {
    const step = Math.max(1, Math.floor(X.length / max)); const sample = []; for (let i = 0; i < X.length; i += step) sample.push(i);
    const dist = (a, b) => Math.sqrt(a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0)); let tot = 0;
    for (const i of sample) { const sums = new Array(k).fill(0), cnt = new Array(k).fill(0); for (const j of sample) { if (i === j) continue; sums[lab[j]] += dist(X[i], X[j]); cnt[lab[j]]++; } const a = cnt[lab[i]] ? sums[lab[i]] / cnt[lab[i]] : 0; let b = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && cnt[c]) b = Math.min(b, sums[c] / cnt[c]); tot += b === Infinity ? 0 : (b - a) / Math.max(a, b); }
    return tot / sample.length;
  };
  S.pca2 = function (X) {
    const d = X[0].length; const cov = Array.from({ length: d }, () => new Array(d).fill(0)); for (const x of X) for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) cov[a][b] += x[a] * x[b];
    cov.forEach((r) => r.forEach((_, j) => (r[j] /= X.length - 1)));
    const comps = []; const vals = []; let M = cov.map((r) => r.slice()); const r = rng(3);
    for (let c = 0; c < Math.min(2, d); c++) { let v = Array.from({ length: d }, () => r() - 0.5); for (let it = 0; it < 200; it++) { const w = M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0)); const nrm = Math.sqrt(S.sum(w.map((x) => x * x))) || 1; v = w.map((x) => x / nrm); } const lam = v.reduce((s, x, i) => s + x * M[i].reduce((t, y, j) => t + y * v[j], 0), 0); comps.push(v); vals.push(lam); M = M.map((row, i) => row.map((x, j) => x - lam * v[i] * v[j])); }
    const total = cov.reduce((s, r, i) => s + r[i], 0);
    return { scores: X.map((x) => comps.map((v) => x.reduce((s, y, j) => s + y * v[j], 0))), explained: vals.map((l) => l / total), loadings: comps };
  };

  /* ---------- forecasting ---------- */
  function holt(y, a, b, h) { let l = y[0], t = y.length > 1 ? y[1] - y[0] : 0; const fit = [y[0]]; for (let i = 1; i < y.length; i++) { const prev = l + t; fit.push(prev); const nl = a * y[i] + (1 - a) * (l + t); t = b * (nl - l) + (1 - b) * t; l = nl; } return { fit, fc: Array.from({ length: h }, (_, k) => l + (k + 1) * t) }; }
  function holtWinters(y, a, b, g, m, h) {
    const n = y.length; if (n < 2 * m) return null;
    let l = S.mean(y.slice(0, m)); let t = (S.mean(y.slice(m, 2 * m)) - l) / m; const s = y.slice(0, m).map((v) => v - l); const fit = [];
    for (let i = 0; i < n; i++) { const si = s[i % m]; const pred = l + t + si; fit.push(i < m ? y[i] : pred); if (i < m) continue; const nl = a * (y[i] - si) + (1 - a) * (l + t); t = b * (nl - l) + (1 - b) * t; s[i % m] = g * (y[i] - nl) + (1 - g) * si; l = nl; }
    return { fit, fc: Array.from({ length: h }, (_, k) => l + (k + 1) * t + s[(n + k) % m]) };
  }
  function fitBest(y, h, season) {
    const cands = [];
    cands.push({ name: 'Naive (last value)', run: (yy, hh) => ({ fit: [yy[0]].concat(yy.slice(0, -1)), fc: new Array(hh).fill(yy[yy.length - 1]) }) });
    cands.push({ name: 'Moving average (3)', run: (yy, hh) => { const m = S.mean(yy.slice(-3)); return { fit: yy.map((_, i) => (i < 3 ? yy[i] : S.mean(yy.slice(i - 3, i)))), fc: new Array(hh).fill(m) }; } });
    cands.push({ name: 'Linear trend', run: (yy, hh) => { const x = yy.map((_, i) => i); const mx = S.mean(x), my = S.mean(yy); let sxy = 0, sxx = 0; x.forEach((xi, i) => { sxy += (xi - mx) * (yy[i] - my); sxx += (xi - mx) ** 2; }); const b = sxx ? sxy / sxx : 0, a = my - b * mx; return { fit: x.map((xi) => a + b * xi), fc: Array.from({ length: hh }, (_, k) => a + b * (yy.length + k)) }; } });
    const grid = [0.1, 0.3, 0.5, 0.7, 0.9];
    cands.push({ name: "Holt's exponential smoothing", run: (yy, hh) => { let best = null; for (const a of grid) for (const b of [0.05, 0.1, 0.2, 0.3]) { const r = holt(yy, a, b, hh); const sse = S.sum(r.fit.map((f, i) => (yy[i] - f) ** 2)); if (!best || sse < best.sse) best = { ...r, sse, params: { alpha: a, beta: b } }; } return best; } });
    if (season && y.length >= 2 * season + Math.max(3, h)) cands.push({ name: 'Holt-Winters (seasonal)', run: (yy, hh) => { let best = null; for (const a of [0.2, 0.4, 0.6]) for (const b of [0.05, 0.15]) for (const g of [0.1, 0.3, 0.5]) { const r = holtWinters(yy, a, b, g, season, hh); if (!r) continue; const sse = S.sum(r.fit.map((f, i) => (i < season ? 0 : (yy[i] - f) ** 2))); if (!best || sse < best.sse) best = { ...r, sse, params: { alpha: a, beta: b, gamma: g } }; } return best; } });
    const hold = Math.max(1, Math.min(h, Math.floor(y.length / 4)));
    const train = y.slice(0, -hold), test = y.slice(-hold);
    const scored = cands.map((c) => { if (train.length < 3) return { ...c, rmse: Infinity }; const r = c.run(train, hold); if (!r) return { ...c, rmse: Infinity }; const err = r.fc.map((f, i) => test[i] - f); const rmse = Math.sqrt(S.mean(err.map((e) => e * e))); const mape = S.mean(err.map((e, i) => (test[i] ? Math.abs(e / test[i]) : 0))); return { ...c, rmse, mape }; });
    scored.sort((a, b) => a.rmse - b.rmse);
    return { scored, hold };
  }
  S.forecast = function (y, h, season) {
    const { scored, hold } = fitBest(y, h, season);
    const best = scored[0]; const r = best.run(y, h);
    const burn = best.name.startsWith('Holt-Winters') ? Math.min(season || 1, y.length - 3) : 1; // seasonal fit copies the first season, others need one step to start
    const res = r.fit.map((f, i) => y[i] - f).slice(burn);
    const rms = res.length ? Math.sqrt(S.mean(res.map((e) => e * e))) : 0;
    const sigma = Math.max(rms, isFinite(best.rmse) ? best.rmse : 0) || S.std(y) * 0.1; // never narrower than the out-of-sample error
    const z80 = 1.2816, z95 = 1.96;
    return { method: best.name, params: r.params, holdout: hold, comparison: scored.map((c) => ({ name: c.name, rmse: c.rmse, mape: c.mape })), fitted: r.fit, forecast: r.fc.map((v, k) => { const fl = y.every((q) => q >= 0) ? (x) => Math.max(0, x) : (x) => x; return { yhat: v, lo80: fl(v - z80 * sigma * Math.sqrt(k + 1)), hi80: v + z80 * sigma * Math.sqrt(k + 1), lo95: fl(v - z95 * sigma * Math.sqrt(k + 1)), hi95: v + z95 * sigma * Math.sqrt(k + 1) }; }), sigma };
  };

  /* ---------- survey reliability ---------- */
  S.cronbach = function (items) {
    // items: array of arrays (k items x n respondents); listwise deletion
    const n = items[0].length; const rows = []; for (let i = 0; i < n; i++) { const r = items.map((it) => it[i]); if (r.every(isNum)) rows.push(r); }
    const k = items.length; if (rows.length < 3 || k < 2) return null;
    const itemVar = items.map((_, j) => S.variance(rows.map((r) => r[j]))); const totVar = S.variance(rows.map((r) => S.sum(r)));
    const alpha = (k / (k - 1)) * (1 - S.sum(itemVar) / totVar);
    return { alpha, k, n: rows.length, label: alpha >= 0.9 ? 'Excellent' : alpha >= 0.8 ? 'Good' : alpha >= 0.7 ? 'Acceptable' : alpha >= 0.6 ? 'Questionable' : 'Poor' };
  };

  S.effectLabel = function (kind, v) {
    const a = Math.abs(v);
    if (kind === 'r') return a >= 0.7 ? 'very strong' : a >= 0.5 ? 'strong' : a >= 0.3 ? 'moderate' : a >= 0.1 ? 'weak' : 'negligible';
    if (kind === 'd') return a >= 0.8 ? 'large' : a >= 0.5 ? 'medium' : a >= 0.2 ? 'small' : 'negligible';
    if (kind === 'eta2') return a >= 0.14 ? 'large' : a >= 0.06 ? 'medium' : a >= 0.01 ? 'small' : 'negligible';
    if (kind === 'v') return a >= 0.5 ? 'strong' : a >= 0.3 ? 'moderate' : a >= 0.1 ? 'weak' : 'negligible';
    return '';
  };
})();
