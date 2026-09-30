/* Explain Your Data — core engine: parsing, typing, dataset model, transformations, aggregation, codegen */
(function () {
  const E = (window.EYD = window.EYD || {});

  /* ---------- utilities ---------- */
  E.uid = () => Math.random().toString(36).slice(2, 10);
  E.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  E.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  E.isNum = (v) => typeof v === 'number' && isFinite(v);
  E.pyStr = (s) => JSON.stringify(String(s));
  E.rName = (s) => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(s) ? s : '`' + String(s).replace(/`/g, '') + '`');

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  E.MONTHS = MONTHS;
  E.DAYS = DAYS;

  E.fmt = {
    num(v, dp) {
      if (!E.isNum(v)) return '—';
      if (dp == null) dp = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
      return v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: dp });
    },
    compact(v, unit) {
      if (!E.isNum(v)) return '—';
      const a = Math.abs(v);
      let s;
      if (a >= 1e9) s = (v / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
      else if (a >= 1e6) s = (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
      else if (a >= 1e4) s = (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
      else s = E.fmt.num(v);
      if (unit === '$') return (v < 0 ? '-$' : '$') + s.replace('-', '');
      if (unit === '%') return s + '%';
      return s;
    },
    pct(v, dp = 1) {
      if (!E.isNum(v)) return '—';
      return (v * 100).toFixed(dp) + '%';
    },
    signedPct(v, dp = 1) {
      if (!E.isNum(v)) return '—';
      return (v >= 0 ? '+' : '') + (v * 100).toFixed(dp) + '%';
    },
    p(p) {
      if (!E.isNum(p)) return '—';
      if (p < 0.001) return 'p < 0.001';
      return 'p = ' + p.toFixed(3);
    },
    date(ts, grain) {
      if (!E.isNum(ts)) return '—';
      const d = new Date(ts);
      const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
      if (grain === 'year') return String(y);
      if (grain === 'quarter') return y + ' Q' + (Math.floor(m / 3) + 1);
      if (grain === 'month') return MONTHS[m] + ' ' + y;
      if (grain === 'datetime') return day + ' ' + MONTHS[m] + ' ' + y + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
      return day + ' ' + MONTHS[m] + ' ' + y;
    },
    bytes(b) {
      if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
      if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
      return b + ' B';
    },
  };

  E.fmtVal = function (col, v) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '';
    if (col && col.type === 'date') return E.fmt.date(v, col.hasTime ? 'datetime' : 'day');
    if (col && col.type === 'number') return E.fmt.num(v, Number.isInteger(v) ? 0 : 2);
    return String(v);
  };

  /* ---------- value parsing ---------- */
  const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', '-', '—', '?', 'nan', '#n/a', 'nil', 'missing', 'undefined', '#value!', '#div/0!']);
  E.isMissingToken = (v) => v == null || (typeof v === 'string' && MISSING.has(v.trim().toLowerCase())) || (typeof v === 'number' && isNaN(v));

  E.parseNum = function (s) {
    if (typeof s === 'number') return isFinite(s) ? s : NaN;
    if (typeof s === 'boolean') return NaN;
    if (s == null) return null;
    let t = String(s).trim();
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/^(AUD|USD|EUR|GBP|BDT|INR|NZD|CAD)\s*/i, '').replace(/\s*(AUD|USD|EUR|GBP|BDT|INR|NZD|CAD)$/i, '');
    t = t.replace(/^[-+]?[$€£¥₹৳]/, (m) => (m[0] === '-' ? '-' : ''));
    t = t.replace(/[$€£¥₹৳]$/, '');
    if (/%$/.test(t)) t = t.slice(0, -1);
    t = t.replace(/[\s\u00a0]/g, '');
    if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    let v = parseFloat(t);
    return neg ? -v : v;
  };

  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  function monIdx(s) {
    const k = String(s).toLowerCase().slice(0, 4);
    if (k in MON) return MON[k];
    const k3 = k.slice(0, 3);
    return k3 in MON ? MON[k3] : -1;
  }
  function mk(y, mo, d, h, mi, s, ampm) {
    h = +h || 0; mi = +mi || 0; s = +s || 0;
    if (ampm) { const pm = /pm/i.test(ampm); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || y < 1000 || y > 2999) return NaN;
    const ts = Date.UTC(y, mo, d, h, mi, s);
    const dt = new Date(ts);
    if (dt.getUTCDate() !== d) return NaN;
    return ts;
  }
  E.parseDate = function (s, order) {
    if (s instanceof Date) return isNaN(s) ? NaN : Date.UTC(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
    if (s == null) return null;
    if (typeof s === 'number') return NaN;
    let t = String(s).trim();
    if (!t) return null;
    t = t.replace(/\s*(GMT|UTC)\s*[+-]?\d{0,2}(:?\d{2})?$/i, '').replace(/Z$/, '').replace(/([+-]\d{2}:?\d{2})$/, (m) => (/\dT\d/.test(t) ? '' : m));
    let m;
    const time = '(?:[ T,]+(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?\\s*(AM|PM|am|pm)?)?';
    if ((m = t.match(new RegExp('^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})' + time + '$')))) return mk(+m[1], +m[2] - 1, +m[3], m[4], m[5], m[6], m[7]);
    if ((m = t.match(new RegExp('^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2}|\\d{4})' + time + '$')))) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += y < 50 ? 2000 : 1900;
      let d, mo;
      if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; }
      return mk(y, mo - 1, d, m[4], m[5], m[6], m[7]);
    }
    if ((m = t.match(new RegExp('^(\\d{1,2})[\\s-]+([A-Za-z]{3,9})\\.?[\\s-,]+(\\d{4})' + time + '$')))) { const mo = monIdx(m[2]); if (mo < 0) return NaN; return mk(+m[3], mo, +m[1], m[4], m[5], m[6], m[7]); }
    if ((m = t.match(new RegExp('^(?:[A-Za-z]{3,9},?\\s+)?([A-Za-z]{3,9})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})' + time + '$')))) { const mo = monIdx(m[1]); if (mo < 0) return NaN; return mk(+m[3], mo, +m[2], m[4], m[5], m[6], m[7]); }
    if ((m = t.match(/^([A-Za-z]{3,9})\.?[\s-]+(\d{4})$/))) { const mo = monIdx(m[1]); if (mo < 0) return NaN; return mk(+m[2], mo, 1); }
    if ((m = t.match(/^(\d{4})-(\d{1,2})$/))) return mk(+m[1], +m[2] - 1, 1);
    if ((m = t.match(/^(\d{4})\s*-?\s*Q([1-4])$/i))) return mk(+m[1], (+m[2] - 1) * 3, 1);
    return NaN;
  };

  /* Likert & ordinal scales */
  const SCALES = [
    ['strongly disagree', 'disagree', 'neutral', 'agree', 'strongly agree'],
    ['strongly disagree', 'disagree', 'neither agree nor disagree', 'agree', 'strongly agree'],
    ['strongly disagree', 'somewhat disagree', 'neither agree nor disagree', 'somewhat agree', 'strongly agree'],
    ['very dissatisfied', 'dissatisfied', 'neutral', 'satisfied', 'very satisfied'],
    ['very unsatisfied', 'unsatisfied', 'neutral', 'satisfied', 'very satisfied'],
    ['never', 'rarely', 'sometimes', 'often', 'always'],
    ['very poor', 'poor', 'fair', 'good', 'excellent'],
    ['poor', 'fair', 'good', 'very good', 'excellent'],
    ['not at all likely', 'unlikely', 'neutral', 'likely', 'very likely'],
    ['very unlikely', 'unlikely', 'neutral', 'likely', 'very likely'],
    ['low', 'medium', 'high'],
    ['very low', 'low', 'medium', 'high', 'very high'],
    ['1st year', '2nd year', '3rd year', '4th year', 'postgraduate'],
  ];
  function detectScale(distinctLower) {
    for (const sc of SCALES) {
      if (distinctLower.length >= 2 && distinctLower.every((v) => sc.includes(v))) return sc;
    }
    return null;
  }

  /* ---------- column inference ---------- */
  const ID_NAME = /(^id$|_id$|^id_|\bid\b|uuid|guid|^code$|postcode|zip|phone|email|^key$|order.?(no|number|id)|invoice|record)/i;
  const DATE_NAME = /(date|time|timestamp|created|updated|month|day|period|week)/i;

  E.inferColumn = function (name, raw) {
    const n = raw.length;
    const vals = new Array(n);
    let ne = 0;
    const nonEmptyIdx = [];
    for (let i = 0; i < n; i++) {
      const v = raw[i];
      if (E.isMissingToken(v)) vals[i] = null;
      else { vals[i] = typeof v === 'string' ? v.trim() : v; ne++; nonEmptyIdx.push(i); }
    }
    const col = { name: String(name), type: 'category', values: vals, invalid: 0, invalidExamples: [] };
    if (ne === 0) { col.type = 'category'; col.empty = true; return col; }

    const sampleIdx = nonEmptyIdx.length > 3000 ? nonEmptyIdx.filter((_, k) => k % Math.ceil(nonEmptyIdx.length / 3000) === 0) : nonEmptyIdx;
    let numOk = 0, dateOk = 0, allJsNum = true, anyDateObj = false, dmyVotes = 0, mdyVotes = 0, hasTime = false, curr = 0, pct = 0;
    for (const i of sampleIdx) {
      const v = vals[i];
      if (typeof v !== 'number') allJsNum = false;
      if (v instanceof Date) anyDateObj = true;
      const pn = E.parseNum(v);
      if (E.isNum(pn)) numOk++;
      if (typeof v === 'string') {
        if (/^[-(]?[$€£¥₹৳]/.test(v)) curr++;
        if (/%$/.test(v)) pct++;
        const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
        if (m) { if (+m[1] > 12) dmyVotes++; if (+m[2] > 12) mdyVotes++; }
        if (/\d:\d{2}/.test(v)) hasTime = true;
      }
      if (v instanceof Date && (v.getHours() || v.getMinutes())) hasTime = true;
      if (typeof v !== 'number' && E.isNum(E.parseDate(v, 'dmy'))) dateOk++;
    }
    const sn = sampleIdx.length;
    const order = mdyVotes > dmyVotes ? 'mdy' : 'dmy';

    if ((numOk / sn >= 0.9 || allJsNum) && !(DATE_NAME.test(name) && dateOk / sn > 0.5)) {
      col.type = 'number';
      if (curr / sn > 0.3 || /(revenue|sales|price|cost|amount|profit|income|spend|salary|\$|aud|usd|fee|value_aud|budget)/i.test(name)) col.unit = '$';
      else if (pct / sn > 0.3 || /(percent|pct|rate_%|%)/i.test(name)) col.unit = '%';
      for (let i = 0; i < n; i++) {
        if (vals[i] == null) continue;
        const pn = E.parseNum(vals[i]);
        if (E.isNum(pn)) vals[i] = pn;
        else { col.invalid++; if (col.invalidExamples.length < 5) col.invalidExamples.push(String(vals[i])); vals[i] = null; }
      }
      // identifiers disguised as numbers
      if (ID_NAME.test(name)) {
        const uniq = new Set(vals.filter((v) => v != null)).size;
        if (uniq / ne > 0.9) col.type = 'id';
      }
      return col;
    }
    if (anyDateObj || dateOk / sn >= 0.85) {
      col.type = 'date';
      col.dateOrder = order;
      col.hasTime = hasTime;
      for (let i = 0; i < n; i++) {
        if (vals[i] == null) continue;
        const d = E.parseDate(vals[i], order);
        if (E.isNum(d)) vals[i] = d;
        else { col.invalid++; if (col.invalidExamples.length < 5) col.invalidExamples.push(String(vals[i])); vals[i] = null; }
      }
      return col;
    }
    // strings
    for (let i = 0; i < n; i++) if (vals[i] != null && typeof vals[i] !== 'string') vals[i] = String(vals[i]);
    const counts = new Map();
    let totalLen = 0, wordy = 0;
    for (const i of nonEmptyIdx) {
      const v = vals[i];
      counts.set(v, (counts.get(v) || 0) + 1);
      totalLen += v.length;
      if (v.split(/\s+/).length > 6) wordy++;
    }
    const uniq = counts.size, avgLen = totalLen / ne;
    const distinctLower = [...new Set([...counts.keys()].map((v) => v.toLowerCase().replace(/\s+/g, ' ').trim()))];
    const scale = uniq <= 12 ? detectScale(distinctLower) : null;
    if (scale) {
      col.type = 'category';
      col.ordinal = true;
      col.order = scale.map((s) => { const hit = [...counts.keys()].find((k) => k.toLowerCase().trim() === s); return hit || null; }).filter(Boolean);
      col.likert = scale.length === 5 && !/year|postgraduate/.test(scale.join(' '));
      return col;
    }
    if (ID_NAME.test(name) && uniq / ne > 0.9) { col.type = 'id'; return col; }
    if (uniq <= Math.max(25, ne * 0.02) || (uniq / ne < 0.5 && avgLen < 30)) { col.type = 'category'; return col; }
    if (avgLen > 35 || wordy / ne > 0.3) { col.type = 'text'; return col; }
    if (uniq / ne > 0.9) { col.type = 'id'; return col; }
    col.type = 'category';
    return col;
  };

  /* ---------- dataset model ---------- */
  function cloneCols(cols) {
    return cols.map((c) => Object.assign({}, c, { values: c.values.slice(), order: c.order ? c.order.slice() : undefined, invalidExamples: (c.invalidExamples || []).slice() }));
  }
  E.cloneCols = cloneCols;

  E.makeDataset = function ({ name, file, sheet, headers, rows, source }) {
    // rows: array of arrays aligned to headers
    const seen = {};
    const cleanHeaders = headers.map((h, i) => {
      let s = h == null || String(h).trim() === '' ? 'column_' + (i + 1) : String(h).trim();
      if (seen[s]) { seen[s]++; s = s + '_' + seen[s]; } else seen[s] = 1;
      return s;
    });
    const unnamed = headers.filter((h) => h == null || String(h).trim() === '').length;
    // drop fully empty trailing rows
    rows = rows.filter((r) => r && r.some((v) => !E.isMissingToken(v)));
    const cols = cleanHeaders.map((h, j) => E.inferColumn(h, rows.map((r) => r[j])));
    const ds = {
      id: E.uid(), kind: 'table', name: name || file || 'dataset', file, sheet, source: source || file,
      original: cloneCols(cols), cols, n: rows.length, steps: [], redo: [], rev: 0, unnamedHeaders: unnamed, createdAt: Date.now(),
    };
    return ds;
  };

  E.makeTextDoc = function ({ name, file, text, source, tables }) {
    return { id: E.uid(), kind: 'text', name: name || file, file, source: source || file, text: text || '', tables: tables || [], rev: 0, createdAt: Date.now() };
  };

  E.col = (ds, name) => ds.cols.find((c) => c.name === name);
  E.colsOf = (ds, types) => ds.cols.filter((c) => types.includes(c.type));

  E.rowObj = function (ds, i) {
    const o = {};
    for (const c of ds.cols) o[c.name] = c.values[i];
    return o;
  };

  E.keepRows = function (ds, mask) {
    for (const c of ds.cols) c.values = c.values.filter((_, i) => mask[i]);
    ds.n = ds.cols.length ? ds.cols[0].values.length : 0;
  };

  /* ---------- transformations (each returns {label, py, r}) ---------- */
  const numericVals = (c) => c.values.filter(E.isNum);
  function median(arr) { const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; }
  function modeOf(arr) { const m = new Map(); let best = null, bc = 0; for (const v of arr) { if (v == null) continue; const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } } return best; }
  function titleCase(s) { return s.toLowerCase().replace(/(^|[\s\-_/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }

  const OPS = {
    fill_missing(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found: ' + p.col);
      let fill, desc;
      const nums = numericVals(c);
      const n0 = c.values.filter((v) => v == null).length;
      if (p.method === 'mean') { fill = nums.reduce((a, b) => a + b, 0) / nums.length; desc = 'mean'; }
      else if (p.method === 'median') { fill = median(nums); desc = 'median'; }
      else if (p.method === 'mode') { fill = modeOf(c.values); desc = 'most common value'; }
      else if (p.method === 'value') { fill = c.type === 'number' ? E.parseNum(p.value) : c.type === 'date' ? E.parseDate(p.value, 'dmy') : String(p.value); desc = 'value "' + p.value + '"'; }
      if (p.method === 'ffill' || p.method === 'bfill') {
        const v = c.values; let last = null;
        if (p.method === 'ffill') for (let i = 0; i < v.length; i++) { if (v[i] == null) v[i] = last; else last = v[i]; }
        else for (let i = v.length - 1; i >= 0; i--) { if (v[i] == null) v[i] = last; else last = v[i]; }
        desc = p.method === 'ffill' ? 'previous value' : 'next value';
      } else if (p.method === 'interpolate') {
        const v = c.values; let i = 0;
        while (i < v.length) {
          if (v[i] == null) { let j = i; while (j < v.length && v[j] == null) j++; const a = i > 0 ? v[i - 1] : null, b = j < v.length ? v[j] : null; for (let k = i; k < j; k++) v[k] = a != null && b != null ? a + ((b - a) * (k - i + 1)) / (j - i + 1) : a != null ? a : b; i = j; } else i++;
        }
        desc = 'linear interpolation';
      } else {
        if (p.method !== 'value' && c.type === 'number' && E.isNum(fill)) fill = Math.round(fill * 100) / 100;
        c.values = c.values.map((v) => (v == null ? fill : v));
      }
      const col = E.pyStr(p.col), rc = E.rName(p.col);
      const py = {
        mean: `df[${col}] = df[${col}].fillna(df[${col}].mean())`,
        median: `df[${col}] = df[${col}].fillna(df[${col}].median())`,
        mode: `df[${col}] = df[${col}].fillna(df[${col}].mode()[0])`,
        ffill: `df[${col}] = df[${col}].ffill()`,
        bfill: `df[${col}] = df[${col}].bfill()`,
        interpolate: `df[${col}] = df[${col}].interpolate()`,
        value: `df[${col}] = df[${col}].fillna(${E.pyStr(p.value)})`,
      }[p.method];
      const r = {
        mean: `df <- df %>% mutate(${rc} = replace_na(${rc}, mean(${rc}, na.rm = TRUE)))`,
        median: `df <- df %>% mutate(${rc} = replace_na(${rc}, median(${rc}, na.rm = TRUE)))`,
        mode: `df <- df %>% mutate(${rc} = replace_na(${rc}, names(which.max(table(${rc})))))`,
        ffill: `df <- df %>% fill(${rc}, .direction = "down")`,
        bfill: `df <- df %>% fill(${rc}, .direction = "up")`,
        interpolate: `df <- df %>% mutate(${rc} = zoo::na.approx(${rc}, na.rm = FALSE))`,
        value: `df <- df %>% mutate(${rc} = replace_na(${rc}, ${JSON.stringify(String(p.value))}))`,
      }[p.method];
      return { label: `Filled ${n0.toLocaleString()} missing in ${p.col} with ${desc}`, py, r };
    },
    drop_missing(ds, p) {
      const cols = p.cols && p.cols.length ? p.cols.map((n) => E.col(ds, n)).filter(Boolean) : ds.cols;
      const mask = new Array(ds.n).fill(true);
      for (let i = 0; i < ds.n; i++) for (const c of cols) if (c.values[i] == null) { mask[i] = false; break; }
      const removed = mask.filter((m) => !m).length;
      E.keepRows(ds, mask);
      const sub = p.cols && p.cols.length ? `subset=[${p.cols.map(E.pyStr).join(', ')}]` : '';
      return { label: `Removed ${removed.toLocaleString()} rows with missing ${p.cols && p.cols.length ? p.cols.join(', ') : 'values'}`, py: `df = df.dropna(${sub})`, r: p.cols && p.cols.length ? `df <- df %>% drop_na(${p.cols.map(E.rName).join(', ')})` : `df <- df %>% drop_na()` };
    },
    drop_duplicates(ds, p) {
      const cols = p.cols && p.cols.length ? p.cols.map((n) => E.col(ds, n)).filter(Boolean) : ds.cols;
      const seen = new Set(); const mask = [];
      for (let i = 0; i < ds.n; i++) {
        const key = cols.map((c) => { const v = c.values[i]; return p.fuzzy && typeof v === 'string' ? v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') : v; }).join('\u0001');
        if (seen.has(key)) mask.push(false); else { seen.add(key); mask.push(true); }
      }
      const removed = mask.filter((m) => !m).length;
      E.keepRows(ds, mask);
      const sub = p.cols && p.cols.length ? `subset=[${p.cols.map(E.pyStr).join(', ')}]` : '';
      return { label: `Removed ${removed.toLocaleString()} ${p.fuzzy ? 'near-' : ''}duplicate rows${p.cols && p.cols.length ? ' (by ' + p.cols.join(', ') + ')' : ''}`, py: `df = df.drop_duplicates(${sub})`, r: p.cols && p.cols.length ? `df <- df %>% distinct(${p.cols.map(E.rName).join(', ')}, .keep_all = TRUE)` : `df <- df %>% distinct()` };
    },
    convert_type(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found');
      const from = c.type;
      c.invalid = 0; c.invalidExamples = [];
      if (p.to === 'number') {
        c.values = c.values.map((v) => { if (v == null) return null; const n = E.parseNum(v); if (E.isNum(n)) return n; c.invalid++; if (c.invalidExamples.length < 5) c.invalidExamples.push(String(v)); return null; });
      } else if (p.to === 'date') {
        c.values = c.values.map((v) => { if (v == null) return null; const d = typeof v === 'number' && from === 'number' ? (v > 20000 && v < 80000 ? Date.UTC(1899, 11, 30) + v * 864e5 : NaN) : E.parseDate(v, p.order || 'dmy'); if (E.isNum(d)) return d; c.invalid++; if (c.invalidExamples.length < 5) c.invalidExamples.push(String(v)); return null; });
      } else {
        c.values = c.values.map((v) => (v == null ? null : from === 'date' ? E.fmt.date(v, c.hasTime ? 'datetime' : 'day') : String(v)));
      }
      c.type = p.to === 'text' ? 'text' : p.to;
      if (p.to !== 'category') { c.ordinal = false; c.order = undefined; c.likert = false; }
      const col = E.pyStr(p.col), rc = E.rName(p.col);
      const py = { number: `df[${col}] = pd.to_numeric(df[${col}], errors="coerce")`, date: `df[${col}] = pd.to_datetime(df[${col}], errors="coerce", dayfirst=${p.order === 'mdy' ? 'False' : 'True'})`, category: `df[${col}] = df[${col}].astype("category")`, text: `df[${col}] = df[${col}].astype(str)` }[p.to];
      const r = { number: `df <- df %>% mutate(${rc} = parse_number(as.character(${rc})))`, date: `df <- df %>% mutate(${rc} = lubridate::parse_date_time(${rc}, orders = c("${p.order === 'mdy' ? 'mdy' : 'dmy'}", "ymd")))`, category: `df <- df %>% mutate(${rc} = as.factor(${rc}))`, text: `df <- df %>% mutate(${rc} = as.character(${rc}))` }[p.to];
      return { label: `Converted ${p.col} from ${from} to ${p.to}${c.invalid ? ` (${c.invalid} values could not be read)` : ''}`, py, r };
    },
    text_clean(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found');
      let changed = 0;
      const f = {
        trim: (s) => s.trim().replace(/\s+/g, ' '),
        lower: (s) => s.toLowerCase(),
        upper: (s) => s.toUpperCase(),
        title: (s) => titleCase(s),
        remove_special: (s) => s.replace(/[^\p{L}\p{N}\s.\-]/gu, ''),
      }[p.fn];
      if (p.fn === 'standardize') {
        // merge variants that differ only by case/whitespace/punctuation to the most frequent spelling
        const groups = new Map();
        for (const v of c.values) { if (v == null) continue; const k = String(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); if (!groups.has(k)) groups.set(k, new Map()); const g = groups.get(k); g.set(v, (g.get(v) || 0) + 1); }
        const canon = new Map();
        for (const g of groups.values()) { let best = null, bc = -1; for (const [v, cnt] of g) if (cnt > bc) { bc = cnt; best = v; } for (const v of g.keys()) canon.set(v, String(best).trim()); }
        c.values = c.values.map((v) => { if (v == null) return v; const nv = canon.get(v); if (nv !== v) changed++; return nv; });
        if (c.order) c.order = [...new Set(c.order.map((o) => canon.get(o) || o))];
        const col = E.pyStr(p.col), rc = E.rName(p.col);
        const mapping = [...canon.entries()].filter(([a, b]) => a !== b).slice(0, 8);
        return { label: `Standardised ${changed.toLocaleString()} inconsistent labels in ${p.col}`, py: `df[${col}] = df[${col}].str.strip().replace({${mapping.map(([a, b]) => E.pyStr(a) + ': ' + E.pyStr(b)).join(', ')}})`, r: `df <- df %>% mutate(${rc} = recode(str_trim(${rc}), ${mapping.map(([a, b]) => JSON.stringify(a.trim()) + ' = ' + JSON.stringify(b)).join(', ')}))` };
      }
      c.values = c.values.map((v) => { if (v == null || typeof v !== 'string') return v; const nv = f(v); if (nv !== v) changed++; return nv; });
      const col = E.pyStr(p.col), rc = E.rName(p.col);
      const py = { trim: `df[${col}] = df[${col}].str.strip().str.replace(r"\\s+", " ", regex=True)`, lower: `df[${col}] = df[${col}].str.lower()`, upper: `df[${col}] = df[${col}].str.upper()`, title: `df[${col}] = df[${col}].str.title()`, remove_special: `df[${col}] = df[${col}].str.replace(r"[^\\w\\s.-]", "", regex=True)` }[p.fn];
      const r = { trim: `df <- df %>% mutate(${rc} = str_squish(${rc}))`, lower: `df <- df %>% mutate(${rc} = str_to_lower(${rc}))`, upper: `df <- df %>% mutate(${rc} = str_to_upper(${rc}))`, title: `df <- df %>% mutate(${rc} = str_to_title(${rc}))`, remove_special: `df <- df %>% mutate(${rc} = str_remove_all(${rc}, "[^[:alnum:][:space:].-]"))` }[p.fn];
      const names = { trim: 'Trimmed spaces in', lower: 'Lower-cased', upper: 'Upper-cased', title: 'Title-cased', remove_special: 'Removed special characters from' };
      return { label: `${names[p.fn]} ${p.col} (${changed.toLocaleString()} values changed)`, py, r };
    },
    outliers(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found');
      const nums = numericVals(c).sort((a, b) => a - b);
      let lo, hi;
      if (p.method === 'zscore') {
        const m = nums.reduce((a, b) => a + b, 0) / nums.length; const sd = Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1));
        const k = p.k || 3; lo = m - k * sd; hi = m + k * sd;
      } else {
        const q = (pp) => { const pos = (nums.length - 1) * pp, b = Math.floor(pos); return nums[b] + (nums[Math.min(b + 1, nums.length - 1)] - nums[b]) * (pos - b); };
        const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1, k = p.k || 1.5; lo = q1 - k * iqr; hi = q3 + k * iqr;
      }
      let count = 0;
      const col = E.pyStr(p.col), rc = E.rName(p.col);
      const bounds = p.method === 'zscore' ? `m, s = df[${col}].mean(), df[${col}].std()\nlo, hi = m - ${p.k || 3}*s, m + ${p.k || 3}*s` : `q1, q3 = df[${col}].quantile([.25, .75])\nlo, hi = q1 - ${p.k || 1.5}*(q3-q1), q3 + ${p.k || 1.5}*(q3-q1)`;
      const rb = p.method === 'zscore' ? `lo <- mean(df$${rc}, na.rm=TRUE) - ${p.k || 3}*sd(df$${rc}, na.rm=TRUE); hi <- mean(df$${rc}, na.rm=TRUE) + ${p.k || 3}*sd(df$${rc}, na.rm=TRUE)` : `q <- quantile(df$${rc}, c(.25,.75), na.rm=TRUE); lo <- q[1] - ${p.k || 1.5}*diff(q); hi <- q[2] + ${p.k || 1.5}*diff(q)`;
      if (p.action === 'cap') {
        c.values = c.values.map((v) => { if (!E.isNum(v)) return v; if (v < lo) { count++; return lo; } if (v > hi) { count++; return hi; } return v; });
        return { label: `Capped ${count} outliers in ${p.col} to [${E.fmt.num(lo)}, ${E.fmt.num(hi)}] (${p.method === 'zscore' ? 'z-score' : 'IQR'})`, py: `${bounds}\ndf[${col}] = df[${col}].clip(lo, hi)`, r: `${rb}\ndf <- df %>% mutate(${rc} = pmin(pmax(${rc}, lo), hi))` };
      }
      const mask = c.values.map((v) => { const out = E.isNum(v) && (v < lo || v > hi); if (out) count++; return !out; });
      E.keepRows(ds, mask);
      return { label: `Removed ${count} outlier rows in ${p.col} (${p.method === 'zscore' ? 'z-score' : 'IQR'})`, py: `${bounds}\ndf = df[df[${col}].between(lo, hi) | df[${col}].isna()]`, r: `${rb}\ndf <- df %>% filter(is.na(${rc}) | between(${rc}, lo, hi))` };
    },
    extract_date(ds, p) {
      const c = E.col(ds, p.col); if (!c || c.type !== 'date') throw new Error('Pick a date column');
      const name = p.name || p.col + '_' + p.part;
      const vals = c.values.map((v) => {
        if (!E.isNum(v)) return null; const d = new Date(v);
        switch (p.part) {
          case 'year': return d.getUTCFullYear();
          case 'month': return MONTHS[d.getUTCMonth()];
          case 'quarter': return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
          case 'weekday': return DAYS[d.getUTCDay()];
          case 'hour': return d.getUTCHours();
          case 'yearmonth': return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
          case 'week': { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - ys) / 864e5 + 1) / 7); }
        }
      });
      const type = ['year', 'hour', 'week'].includes(p.part) ? 'number' : 'category';
      const newCol = { name, type, values: vals, invalid: 0, invalidExamples: [] };
      if (p.part === 'month') { newCol.ordinal = true; newCol.order = MONTHS.slice(); }
      if (p.part === 'weekday') { newCol.ordinal = true; newCol.order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; }
      if (p.part === 'quarter') { newCol.ordinal = true; newCol.order = ['Q1', 'Q2', 'Q3', 'Q4']; }
      const idx = ds.cols.findIndex((x) => x.name === name);
      if (idx >= 0) ds.cols[idx] = newCol; else ds.cols.splice(ds.cols.indexOf(c) + 1, 0, newCol);
      const col = E.pyStr(p.col);
      const pyPart = { year: '.dt.year', month: '.dt.strftime("%b")', quarter: '.dt.quarter.map(lambda q: f"Q{q}")', weekday: '.dt.strftime("%a")', hour: '.dt.hour', yearmonth: '.dt.strftime("%Y-%m")', week: '.dt.isocalendar().week' }[p.part];
      const rPart = { year: 'year', month: 'month(%s, label = TRUE)', quarter: 'paste0("Q", quarter(%s))', weekday: 'wday(%s, label = TRUE)', hour: 'hour', yearmonth: 'format(%s, "%Y-%m")', week: 'isoweek' }[p.part];
      const rc = E.rName(p.col);
      const rExpr = rPart.includes('%s') ? rPart.replace('%s', rc) : `${rPart}(${rc})`;
      return { label: `Extracted ${p.part} from ${p.col} into ${name}`, py: `df[${E.pyStr(name)}] = df[${col}]${pyPart}`, r: `df <- df %>% mutate(${E.rName(name)} = ${rExpr})` };
    },
    rename(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found');
      if (E.col(ds, p.to)) throw new Error('A column called ' + p.to + ' already exists');
      c.name = p.to;
      return { label: `Renamed ${p.col} to ${p.to}`, py: `df = df.rename(columns={${E.pyStr(p.col)}: ${E.pyStr(p.to)}})`, r: `df <- df %>% rename(${E.rName(p.to)} = ${E.rName(p.col)})` };
    },
    drop_column(ds, p) {
      ds.cols = ds.cols.filter((c) => c.name !== p.col);
      return { label: `Removed column ${p.col}`, py: `df = df.drop(columns=[${E.pyStr(p.col)}])`, r: `df <- df %>% select(-${E.rName(p.col)})` };
    },
    derive(ds, p) {
      const a = E.col(ds, p.a), b = p.bIsConst ? null : E.col(ds, p.b);
      if (!a) throw new Error('Column not found');
      const bv = (i) => (p.bIsConst ? +p.b : b.values[i]);
      const f = { '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => (y === 0 ? null : x / y) }[p.op];
      const vals = a.values.map((x, i) => { const y = bv(i); return E.isNum(x) && E.isNum(y) ? f(x, y) : null; });
      const newCol = { name: p.name, type: 'number', values: vals, invalid: 0, invalidExamples: [], unit: a.unit === '$' && (p.op === '+' || p.op === '-' || (p.op === '*' && p.bIsConst)) ? '$' : undefined };
      const idx = ds.cols.findIndex((x) => x.name === p.name);
      if (idx >= 0) ds.cols[idx] = newCol; else ds.cols.push(newCol);
      const bpy = p.bIsConst ? p.b : `df[${E.pyStr(p.b)}]`, br = p.bIsConst ? p.b : E.rName(p.b);
      return { label: `Created ${p.name} = ${p.a} ${p.op} ${p.b}`, py: `df[${E.pyStr(p.name)}] = df[${E.pyStr(p.a)}] ${p.op} ${bpy}`, r: `df <- df %>% mutate(${E.rName(p.name)} = ${E.rName(p.a)} ${p.op} ${br})` };
    },
    filter(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found');
      const test = E.makeTest(c, p.op, p.value);
      const mask = c.values.map((v) => test(v));
      const before = ds.n;
      E.keepRows(ds, mask);
      const pv = c.type === 'number' ? p.value : E.pyStr(p.value);
      const opPy = { '=': '==', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' }[p.op];
      const py = p.op === 'contains' ? `df = df[df[${E.pyStr(p.col)}].str.contains(${E.pyStr(p.value)}, case=False, na=False)]` : `df = df[df[${E.pyStr(p.col)}] ${opPy} ${c.type === 'date' ? `pd.Timestamp(${E.pyStr(p.value)})` : pv}]`;
      const r = p.op === 'contains' ? `df <- df %>% filter(str_detect(str_to_lower(${E.rName(p.col)}), ${JSON.stringify(String(p.value).toLowerCase())}))` : `df <- df %>% filter(${E.rName(p.col)} ${opPy} ${c.type === 'date' ? `as.Date(${JSON.stringify(p.value)})` : c.type === 'number' ? p.value : JSON.stringify(p.value)})`;
      return { label: `Kept rows where ${p.col} ${p.op} ${p.value} (${(before - ds.n).toLocaleString()} removed)`, py, r };
    },
    replace_value(ds, p) {
      const c = E.col(ds, p.col); if (!c) throw new Error('Column not found');
      let k = 0;
      c.values = c.values.map((v) => (String(v) === String(p.from) ? (k++, c.type === 'number' ? E.parseNum(p.to) : p.to) : v));
      if (c.order) c.order = c.order.map((o) => (o === p.from ? p.to : o));
      return { label: `Replaced "${p.from}" with "${p.to}" in ${p.col} (${k} values)`, py: `df[${E.pyStr(p.col)}] = df[${E.pyStr(p.col)}].replace(${E.pyStr(p.from)}, ${E.pyStr(p.to)})`, r: `df <- df %>% mutate(${E.rName(p.col)} = replace(${E.rName(p.col)}, ${E.rName(p.col)} == ${JSON.stringify(p.from)}, ${JSON.stringify(p.to)}))` };
    },
    likert_score(ds, p) {
      const c = E.col(ds, p.col); if (!c || !c.order) throw new Error('Pick an ordered (Likert) column');
      const name = p.name || p.col + ' (score)';
      const map = new Map(c.order.map((o, i) => [o, i + 1]));
      const newCol = { name, type: 'number', values: c.values.map((v) => (v == null ? null : map.get(v) ?? null)), invalid: 0, invalidExamples: [] };
      const idx = ds.cols.findIndex((x) => x.name === name);
      if (idx >= 0) ds.cols[idx] = newCol; else ds.cols.splice(ds.cols.indexOf(c) + 1, 0, newCol);
      const mapping = c.order.map((o, i) => E.pyStr(o) + ': ' + (i + 1)).join(', ');
      return { label: `Scored ${p.col} as 1–${c.order.length} in "${name}"`, py: `df[${E.pyStr(name)}] = df[${E.pyStr(p.col)}].map({${mapping}})`, r: `df <- df %>% mutate(${E.rName(name)} = as.integer(factor(${E.rName(p.col)}, levels = c(${c.order.map((o) => JSON.stringify(o)).join(', ')}))))` };
    },
  };
  E.OPS = OPS;

  E.makeTest = function (c, op, value) {
    let tv = value;
    if (c.type === 'number') tv = E.parseNum(value);
    if (c.type === 'date') tv = E.parseDate(value, 'dmy');
    const lower = String(value).toLowerCase();
    return (v) => {
      if (v == null) return false;
      switch (op) {
        case '=': return c.type === 'number' || c.type === 'date' ? v === tv : String(v).toLowerCase() === lower;
        case '!=': return c.type === 'number' || c.type === 'date' ? v !== tv : String(v).toLowerCase() !== lower;
        case '>': return v > tv;
        case '<': return v < tv;
        case '>=': return v >= tv;
        case '<=': return v <= tv;
        case 'in': return Array.isArray(value) && value.map(String).includes(String(v));
        case 'contains': return String(v).toLowerCase().includes(lower);
        default: return true;
      }
    };
  };

  E.replay = function (ds) {
    ds.cols = cloneCols(ds.original);
    ds.n = ds.cols.length ? ds.cols[0].values.length : 0;
    for (const s of ds.steps) {
      try { const out = OPS[s.op](ds, s.params); Object.assign(s, out); s.error = null; } catch (e) { s.error = e.message; }
    }
    ds.rev++;
    ds._profile = null;
  };

  E.applyStep = function (ds, op, params) {
    const out = OPS[op](ds, params); // throws on error
    ds.steps.push(Object.assign({ id: E.uid(), op, params, at: Date.now() }, out));
    ds.redo = [];
    ds.rev++;
    ds._profile = null;
    return out;
  };
  E.previewStep = function (ds, op, params) {
    const tmp = { cols: cloneCols(ds.cols), n: ds.n };
    const out = OPS[op](tmp, params);
    return { out, tmp };
  };
  E.undo = function (ds) { if (!ds.steps.length) return false; ds.redo.push(ds.steps.pop()); E.replay(ds); return true; };
  E.redo = function (ds) { if (!ds.redo.length) return false; const s = ds.redo.pop(); ds.steps.push(s); E.replay(ds); return true; };
  E.revertTo = function (ds, idx) { ds.redo = ds.steps.slice(idx).reverse().concat(ds.redo); ds.steps = ds.steps.slice(0, idx); E.replay(ds); };

  /* ---------- aggregation ---------- */
  E.bucket = function (ts, grain) {
    const d = new Date(ts);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    switch (grain) {
      case 'year': return Date.UTC(y, 0, 1);
      case 'quarter': return Date.UTC(y, Math.floor(m / 3) * 3, 1);
      case 'month': return Date.UTC(y, m, 1);
      case 'week': { const day = (d.getUTCDay() + 6) % 7; return Date.UTC(y, m, d.getUTCDate() - day); }
      default: return Date.UTC(y, m, d.getUTCDate());
    }
  };
  E.autoGrain = function (col) {
    const v = col.values.filter(E.isNum);
    if (!v.length) return 'month';
    let mn = Infinity, mx = -Infinity; for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; }
    const days = (mx - mn) / 864e5;
    if (days > 365 * 6) return 'year';
    if (days > 365 * 2.5) return 'quarter';
    if (days > 75) return 'month';
    if (days > 20) return 'week';
    return 'day';
  };

  const AGG = {
    sum: (a) => a.reduce((s, v) => s + v, 0),
    mean: (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null),
    median: (a) => median(a),
    min: (a) => (a.length ? Math.min(...a) : null),
    max: (a) => (a.length ? Math.max(...a) : null),
    std: (a) => { if (a.length < 2) return null; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); },
  };
  E.AGG_LABEL = { sum: 'Total', mean: 'Average', median: 'Median', min: 'Minimum', max: 'Maximum', count: 'Count', count_distinct: 'Distinct', std: 'Std dev', share: 'Share' };

  /* spec: {by:[col], metrics:[{col, agg}], filters:[{col,op,value}], timeGrain, sort:{by, dir}, limit} */
  E.aggregate = function (ds, spec) {
    const by = (spec.by || []).map((n) => E.col(ds, n)).filter(Boolean);
    const metrics = (spec.metrics && spec.metrics.length ? spec.metrics : [{ col: null, agg: 'count' }]).map((m) => ({ ...m, c: m.col ? E.col(ds, m.col) : null, agg: m.agg || (m.col ? 'sum' : 'count') }));
    const tests = (spec.filters || []).map((f) => { const c = E.col(ds, f.col); return c ? [c, E.makeTest(c, f.op, f.value)] : null; }).filter(Boolean);
    const grain = spec.timeGrain || null;
    const groups = new Map();
    for (let i = 0; i < ds.n; i++) {
      let ok = true;
      for (const [c, t] of tests) if (!t(c.values[i])) { ok = false; break; }
      if (!ok) continue;
      const keyParts = [];
      let skip = false;
      for (const c of by) {
        let v = c.values[i];
        if (v == null) { if (spec.dropNull !== false) { skip = true; break; } v = '(missing)'; }
        if (c.type === 'date') v = E.bucket(v, grain || E.autoGrain(c));
        keyParts.push(v);
      }
      if (skip) continue;
      const key = keyParts.join('\u0001');
      let g = groups.get(key);
      if (!g) { g = { keys: keyParts, vals: metrics.map(() => []), n: 0 }; groups.set(key, g); }
      g.n++;
      metrics.forEach((m, j) => { if (m.c) { const v = m.c.values[i]; if (v != null) g.vals[j].push(v); } });
    }
    const rows = [];
    for (const g of groups.values()) {
      const row = g.keys.slice();
      metrics.forEach((m, j) => {
        const a = g.vals[j];
        if (m.agg === 'count') row.push(m.c ? a.length : g.n);
        else if (m.agg === 'count_distinct') row.push(new Set(a).size);
        else row.push(AGG[m.agg] ? AGG[m.agg](a.filter(E.isNum)) : null);
      });
      rows.push(row);
    }
    const columns = by.map((c) => c.name).concat(metrics.map((m) => (m.c ? (m.agg === 'count' ? 'count' : m.agg + '_' + m.c.name) : 'count')));
    const colTypes = by.map((c) => c.type).concat(metrics.map(() => 'number'));
    // sort
    const k = by.length;
    const byDate = by.length && by[0].type === 'date';
    const ord = by.length && by[0].order ? by[0].order : null;
    if (spec.sort && spec.sort.by != null) {
      const idx = typeof spec.sort.by === 'number' ? spec.sort.by : columns.indexOf(spec.sort.by);
      const dir = spec.sort.dir === 'asc' ? 1 : -1;
      if (idx >= 0) rows.sort((a, b) => ((a[idx] ?? -Infinity) > (b[idx] ?? -Infinity) ? dir : (a[idx] ?? -Infinity) < (b[idx] ?? -Infinity) ? -dir : 0));
    } else if (byDate) rows.sort((a, b) => a[0] - b[0]);
    else if (ord) rows.sort((a, b) => ord.indexOf(a[0]) - ord.indexOf(b[0]));
    else if (by.length && by[0].type === 'number') rows.sort((a, b) => a[0] - b[0]);
    else if (k) rows.sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0));
    const limited = spec.limit ? rows.slice(0, spec.limit) : rows;
    return { columns, colTypes, rows: limited, totalGroups: rows.length, grain: byDate ? grain || E.autoGrain(by[0]) : null, metricsMeta: metrics.map((m) => ({ col: m.col, agg: m.agg, unit: m.c && m.c.unit })) };
  };

  E.aggCode = function (spec) {
    const by = spec.by || [];
    const ms = spec.metrics && spec.metrics.length ? spec.metrics : [{ col: null, agg: 'count' }];
    const fpy = (spec.filters || []).map((f) => `df[${E.pyStr(f.col)}] ${f.op === '=' ? '==' : f.op} ${JSON.stringify(f.value)}`);
    let py = 'd = df' + (fpy.length ? `[${fpy.map((x) => '(' + x + ')').join(' & ')}]` : '') + '\n';
    if (spec.timeGrain && by.length) py += `d = d.assign(**{${E.pyStr(by[0])}: d[${E.pyStr(by[0])}].dt.to_period("${{ day: 'D', week: 'W', month: 'M', quarter: 'Q', year: 'Y' }[spec.timeGrain]}").dt.to_timestamp()})\n`;
    const aggPy = ms.map((m) => (m.col ? `${m.agg === 'count' ? 'count' : m.agg + '_' + m.col}=(${E.pyStr(m.col)}, "${m.agg === 'count_distinct' ? 'nunique' : m.agg}")` : `count=(${E.pyStr(by[0] || df0)}, "size")`)).join(', ');
    py += by.length ? `result = d.groupby([${by.map(E.pyStr).join(', ')}]).agg(${aggPy}).reset_index()` : `result = d.agg(${aggPy})`;
    if (spec.sort) py += `.sort_values(${E.pyStr(spec.sort.by)}, ascending=${spec.sort.dir === 'asc' ? 'True' : 'False'})`;
    if (spec.limit) py += `.head(${spec.limit})`;
    const fr = (spec.filters || []).map((f) => `${E.rName(f.col)} ${f.op === '=' ? '==' : f.op} ${JSON.stringify(f.value)}`);
    let r = 'result <- df' + (fr.length ? ` %>%\n  filter(${fr.join(', ')})` : '');
    if (spec.timeGrain && by.length) r += ` %>%\n  mutate(${E.rName(by[0])} = floor_date(${E.rName(by[0])}, "${spec.timeGrain}"))`;
    if (by.length) r += ` %>%\n  group_by(${by.map(E.rName).join(', ')})`;
    r += ` %>%\n  summarise(${ms.map((m) => (m.col ? `${m.agg === 'count' ? 'count' : m.agg + '_' + m.col.replace(/\W+/g, '_')} = ${{ sum: 'sum', mean: 'mean', median: 'median', min: 'min', max: 'max', std: 'sd', count: 'n', count_distinct: 'n_distinct' }[m.agg]}(${m.agg === 'count' ? '' : E.rName(m.col) + (m.agg === 'count_distinct' ? '' : ', na.rm = TRUE')})` : 'count = n()')).join(', ')}, .groups = "drop")`;
    if (spec.sort) r += ` %>%\n  arrange(${spec.sort.dir === 'asc' ? '' : 'desc('}${(spec.sort.by || 'count').replace(/\W+/g, '_')}${spec.sort.dir === 'asc' ? '' : ')'})`;
    if (spec.limit) r += ` %>%\n  head(${spec.limit})`;
    return { py, r };
  };
  const df0 = 'index';

  /* rows for export */
  E.toMatrix = function (ds, raw) {
    const header = ds.cols.map((c) => c.name);
    const rows = [];
    for (let i = 0; i < ds.n; i++) rows.push(ds.cols.map((c) => { const v = c.values[i]; if (v == null) return ''; if (c.type === 'date') return raw ? new Date(v).toISOString().slice(0, c.hasTime ? 19 : 10).replace('T', ' ') : E.fmtVal(c, v); return v; }));
    return { header, rows };
  };
  E.toCSV = function (ds) {
    const { header, rows } = E.toMatrix(ds, true);
    const q = (v) => { const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    // protect against spreadsheet formula injection
    const safe = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) && !/^-?\d/.test(v) ? "'" + v : v);
    return [header.map(q).join(',')].concat(rows.map((r) => r.map((v) => q(safe(v))).join(','))).join('\n');
  };

  /* pipeline scripts */
  E.pipelineScript = function (ds, lang) {
    const file = ds.file || 'data.csv';
    if (lang === 'r') {
      const read = /\.xlsx?$/i.test(file) ? `df <- readxl::read_excel(${JSON.stringify(file)})` : `df <- readr::read_csv(${JSON.stringify(file)})`;
      return ['# Explain Your Data — cleaning pipeline for ' + ds.name, 'library(tidyverse)', 'library(lubridate)', '', read, '']
        .concat(ds.steps.flatMap((s) => ['# ' + s.label, s.r, '']))
        .concat(['write_csv(df, "' + ds.name.replace(/\.\w+$/, '') + '_clean.csv")'])
        .join('\n');
    }
    const read = /\.xlsx?$/i.test(file) ? `df = pd.read_excel(${E.pyStr(file)})` : `df = pd.read_csv(${E.pyStr(file)})`;
    return ['# Explain Your Data — cleaning pipeline for ' + ds.name, 'import pandas as pd', '', read, '']
      .concat(ds.steps.flatMap((s) => ['# ' + s.label, s.py, '']))
      .concat(['df.to_csv("' + ds.name.replace(/\.\w+$/, '') + '_clean.csv", index=False)'])
      .join('\n');
  };

  /* ---------- joins between datasets ---------- */
  E.findRelationships = function (datasets) {
    const tables = datasets.filter((d) => d.kind === 'table');
    const rels = [];
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < tables.length; i++)
      for (let j = i + 1; j < tables.length; j++) {
        const A = tables[i], B = tables[j];
        for (const ca of A.cols) for (const cb of B.cols) {
          if (norm(ca.name) !== norm(cb.name) && !(norm(ca.name).endsWith('id') && norm(cb.name) === norm(ca.name).replace(/id$/, ''))) continue;
          if (!['id', 'category', 'number'].includes(ca.type) || !['id', 'category', 'number'].includes(cb.type)) continue;
          const sa = new Set(ca.values.filter((v) => v != null).map(String)), sb = new Set(cb.values.filter((v) => v != null).map(String));
          if (!sa.size || !sb.size) continue;
          let inter = 0; for (const v of sa) if (sb.has(v)) inter++;
          const overlap = inter / Math.min(sa.size, sb.size);
          if (overlap >= 0.3) {
            const uniqA = sa.size / A.n, uniqB = sb.size / B.n;
            rels.push({ a: A.id, b: B.id, aName: A.name, bName: B.name, colA: ca.name, colB: cb.name, overlap, kind: uniqA > 0.95 && uniqB < 0.95 ? 'one-to-many' : uniqB > 0.95 && uniqA < 0.95 ? 'many-to-one' : uniqA > 0.95 && uniqB > 0.95 ? 'one-to-one' : 'many-to-many' });
          }
        }
      }
    return rels.sort((x, y) => y.overlap - x.overlap);
  };

  E.joinDatasets = function (A, B, colA, colB, how) {
    const ia = A.cols.findIndex((c) => c.name === colA), ib = B.cols.findIndex((c) => c.name === colB);
    const idx = new Map();
    B.cols[ib].values.forEach((v, i) => { if (v == null) return; const k = String(v); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(i); });
    const outRows = [];
    const bKeep = B.cols.filter((_, j) => j !== ib);
    const matrix = E.toMatrix(A, true), bm = E.toMatrix(B, true);
    for (let i = 0; i < A.n; i++) {
      const k = A.cols[ia].values[i];
      const hits = k == null ? null : idx.get(String(k));
      if (hits && hits.length) for (const h of hits) outRows.push(matrix.rows[i].concat(bm.rows[h].filter((_, j) => j !== ib)));
      else if (how === 'left') outRows.push(matrix.rows[i].concat(bKeep.map(() => '')));
    }
    const headers = A.cols.map((c) => c.name).concat(bKeep.map((c) => (A.cols.some((x) => x.name === c.name) ? c.name + '_' + B.name.replace(/\.\w+$/, '') : c.name)));
    const ds = E.makeDataset({ name: A.name.replace(/\.\w+$/, '') + ' + ' + B.name.replace(/\.\w+$/, ''), file: 'merged.csv', headers, rows: outRows, source: 'join' });
    ds.joinInfo = { a: A.name, b: B.name, colA, colB, how, py: `df = ${how === 'left' ? '' : ''}a.merge(b, left_on=${E.pyStr(colA)}, right_on=${E.pyStr(colB)}, how="${how}")`, r: `df <- ${how === 'left' ? 'left_join' : 'inner_join'}(a, b, by = c(${JSON.stringify(colA)} = ${JSON.stringify(colB)}))` };
    return ds;
  };
})();
