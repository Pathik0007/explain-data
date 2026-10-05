/* Explain Your Data — app shell, landing, workspace, overview, discover */
(function () {
  const E = window.EYD, fmt = E.fmt, esc = E.esc, S = E.S;
  const U = (E.UI = {});
  const store = {
    get(k, d) { try { const v = localStorage.getItem('eyd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('eyd.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const st = (U.st = {
    view: 'home', datasets: [], activeId: null, panel: 'overview', pro: store.get('pro', false),
    report: { title: '', style: 'executive', items: [], narrative: null, writing: false },
    chat: {}, results: {}, viz: {}, dash: {}, explored: {}, clean: { op: 'fill_missing', params: {} }, analyze: { id: 'describe', params: {} },
    preview: null, discoverFilter: 'All', openInsights: new Set(), claude: null, useClaude: true,
  });
  U.store = store;

  /* ---------- registry for DOM ↔ objects ---------- */
  const REG = new Map(); let regN = 0;
  const reg = (o) => { const k = 'k' + ++regN; REG.set(k, o); return k; };
  U.reg = reg; U.REG = REG;

  /* ---------- icons ---------- */
  const P = {
    upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
    overview: 'M4 5h16M4 12h10M4 19h7',
    discover: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    clean: 'M3 21l7-7m0 0l3-7 4 4-7 3zm3-7l5-5 3 3',
    analyze: 'M9 3v6L4 18a2 2 0 001.8 3h12.4a2 2 0 001.8-3L15 9V3M8 3h8M7 14h10',
    visualize: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
    ask: 'M21 12a8 8 0 01-11.6 7.1L4 20l1.1-4.3A8 8 0 1121 12z',
    dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
    report: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    plus: 'M12 5v14M5 12h14', search: 'M11 18a7 7 0 100-14 7 7 0 000 14zm5-2l4 4', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7',
    arrow: 'M5 12h14m-5-5l5 5-5 5', code: 'M9 8l-4 4 4 4m6-8l4 4-4 4', download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14', trash: 'M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', redo: 'M15 14l5-5-5-5m5 5H9a5 5 0 000 10h3', shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
    file: 'M7 3h7l5 5v13H7z M14 3v5h5', table: 'M4 5h16v14H4zM4 10h16M10 5v14', up: 'M12 19V5m-6 6l6-6 6 6', down: 'M12 5v14m6-6l-6 6-6-6', play: 'M7 5l12 7-12 7z',
    wand: 'M4 20L15 9m2-6v3m0 6v3m-6-6h3m6 0h3M18.5 5.5l-2 2m0 3l2 2', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 100-6 3 3 0 000 6z',
    doc: 'M6 3h9l4 4v14H6z M9 9h6M9 13h6M9 17h4', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5', stop: 'M7 7h10v10H7z', copy: 'M9 9h10v10H9zM5 15V5h10',
  };
  const ic = (n) => `<svg class="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.file}"/></svg>`;
  U.ic = ic;
  const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="24" rx="6" fill="var(--ink)"/><path d="M9 30l4-4h-6z" fill="var(--ink)"/><rect x="8" y="15" width="3.2" height="6" rx="1" fill="var(--accent-soft)"/><rect x="14.4" y="11" width="3.2" height="10" rx="1" fill="var(--accent-soft)"/><rect x="20.8" y="7" width="3.2" height="14" rx="1" fill="var(--accent)"/></svg>`;

  /* ---------- helpers ---------- */
  U.ds = () => st.datasets.find((d) => d.id === st.activeId);
  U.getDs = (id) => st.datasets.find((d) => d.id === id) || st.datasets[0];
  U.aiName = () => st.aiName || 'Claude';
  U.toast = function (msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5200 : 2600); };
  U.markExplored = (key) => { const ds = U.ds(); if (!ds) return; (st.explored[ds.id] = st.explored[ds.id] || new Set()).add(key); };
  const EXPLORE = [['overview', 'Overview'], ['quality', 'Data quality'], ['discover', 'Discoveries'], ['distribution', 'Distributions'], ['relationships', 'Relationships'], ['trends', 'Trends'], ['segments', 'Segments'], ['visualize', 'Custom charts'], ['ask', 'Questions'], ['report', 'Report']];

  U.fmtCell = function (v, col, isPct) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '<span class="muted">—</span>';
    if (typeof v === 'number') {
      if (isPct) return fmt.pct(v);
      if (/(^p$|p-value|p value|\bp\b)/i.test(col || '') ) return v < 0.001 ? '&lt;0.001' : v.toFixed(3);
      const a = Math.abs(v); return fmt.num(v, Number.isInteger(v) ? 0 : a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 4);
    }
    return esc(v);
  };
  U.tableHTML = function (t, max = 12) {
    if (!t || !t.columns) return '';
    const pc = new Set(t.pctCols || []); const isNumCol = t.columns.map((_, j) => t.rows.some((r) => typeof r[j] === 'number'));
    const row = (r) => `<tr>${r.map((v, j) => `<td class="${isNumCol[j] ? 'n' : ''}">${U.fmtCell(v, t.columns[j], t.pct ? j > 0 : pc.has(j))}</td>`).join('')}</tr>`;
    const head = `<thead><tr>${t.columns.map((c, j) => `<th class="${isNumCol[j] ? 'n' : ''}" title="${esc(c)}">${esc(E.short(c, 30))}</th>`).join('')}</tr></thead>`;
    const main = `<div class="tbl-wrap"><table class="tbl">${head}<tbody>${t.rows.slice(0, max).map(row).join('')}</tbody></table></div>`;
    if (t.rows.length <= max) return main;
    return main + `<details class="more"><summary>Show all ${t.rows.length.toLocaleString()} rows</summary><div class="tbl-wrap"><table class="tbl">${head}<tbody>${t.rows.slice(0, 500).map(row).join('')}</tbody></table></div></details>`;
  };
  U.codeHTML = function (code) {
    if (!code || !st.pro) return '';
    const id = E.uid();
    return `<details class="more code"><summary>${ic('code')} Show code</summary><div><div class="tabs"><button class="on" data-act="codeTab" data-id="${id}" data-lang="py">Python</button><button data-act="codeTab" data-id="${id}" data-lang="r">R</button><button class="btn ghost sm" style="margin-left:auto" data-act="copyCode" data-id="${id}">${ic('copy')} Copy</button></div><pre id="${id}-py">${esc(code.py || '')}</pre><pre id="${id}-r" hidden>${esc(code.r || '')}</pre></div></details>`;
  };
  U.plotHTML = function (ds, spec, cls = '') { if (!spec) return ''; return `<div class="plot js-plot ${cls}" role="img" aria-label="${esc(spec.title || 'Chart')}" data-ck="${reg({ ds, spec })}"></div>`; };
  U.statsHTML = (stats) => (stats && stats.length ? `<div class="stats">${stats.map((s) => `<div class="stat"><small>${esc(s.label)}</small><b>${esc(s.value)}</b></div>`).join('')}</div>` : '');

  U.blockHTML = function (b, ds, o = {}) {
    b._id = b._id || E.uid();
    const key = reg({ block: b, ds });
    const explainBtns = st.claude ? `<div class="row"><span class="muted" style="font-size:12px">Explain</span>${E.EXPLAIN_STYLES.map((s) => `<button class="chip" style="padding:3px 9px;font-size:12px" data-act="explain" data-k="${key}" data-style="${s.id}">${s.label}</button>`).join('')}</div>` : '';
    return `<article class="block" id="b-${b._id}">
      <div class="bh"><h3>${esc(b.title || '')}</h3>${o.close ? `<button class="btn ghost sm" data-act="closeResult" data-id="${b._id}" aria-label="Remove result">${ic('x')}</button>` : ''}</div>
      ${b.summary ? `<p class="sum">${esc(b.summary)}</p>` : ''}
      ${U.statsHTML(b.stats)}
      ${b.chart ? U.plotHTML(ds, b.chart, o.small ? 'sm' : '') : ''}
      ${b.table ? (o.collapseTable ? `<details class="more"><summary>${ic('table')} Data table (${b.table.rows.length} rows)</summary><div>${U.tableHTML(b.table, o.maxRows || 12)}</div></details>` : U.tableHTML(b.table, o.maxRows || 12)) : ''}
      ${b.table2 && st.pro ? U.tableHTML(b.table2, 10) : ''}
      ${b._explain ? `<div class="explain-out" id="ex-${b._id}">${esc(b._explain)}</div>` : `<div class="explain-out" id="ex-${b._id}" hidden></div>`}
      ${b.plan && b.plan.length ? `<details class="more"><summary>How this was calculated</summary><div><ol class="evidence">${b.plan.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div></details>` : ''}
      ${U.codeHTML(b.code)}
      <div class="actions">
        <button class="btn sm" data-act="toReport" data-k="${key}">${ic('report')} Add to report</button>
        ${b.chart && b.chart.type !== 'custom' ? `<button class="btn sm" data-act="toBuilder" data-k="${key}">${ic('visualize')} Edit chart</button><button class="btn sm" data-act="toDash" data-k="${key}">${ic('dashboard')} Pin to dashboard</button>` : ''}
        ${b.fix ? `<button class="btn sm" data-act="applyOp" data-op="${b.fix.op}" data-params='${esc(JSON.stringify(b.fix.params))}'>${ic('clean')} ${esc(b.fix.label)}</button>` : ''}
        ${b.action === 'clean' ? `<button class="btn sm" data-act="panel" data-p="clean">${ic('clean')} Open Clean</button>` : ''}
        ${b.clusterParams ? `<button class="btn sm" data-act="applyOp" data-op="add_clusters" data-params='${esc(JSON.stringify(b.clusterParams))}'>${ic('plus')} Add segment column</button>` : ''}
      </div>
      ${explainBtns}
    </article>`;
  };

  U.sparkSVG = function (vals, color = 'var(--accent)') {
    const v = vals.filter(E.isNum); if (v.length < 2) return '';
    const mn = Math.min(...v), mx = Math.max(...v), w = 200, h = 30;
    const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 3 - ((x - mn) / (mx - mn || 1)) * (h - 6)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h}Z" fill="${color}" opacity=".10"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`;
  };
  U.histSVG = function (hist) {
    if (!hist || !hist.length) return '';
    const mx = Math.max(...hist.map((b) => b.n)) || 1; const w = 110, h = 26, bw = w / hist.length;
    return `<svg class="hist" viewBox="0 0 ${w} ${h}" aria-hidden="true">${hist.map((b, i) => { const bh = Math.max(b.n ? 1.5 : 0, (b.n / mx) * (h - 2)); return `<rect x="${(i * bw + 0.5).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${Math.max(0.5, bw - 1).toFixed(2)}" height="${bh.toFixed(2)}" rx="1" fill="var(--s1)"/>`; }).join('')}</svg>`;
  };

  /* ---------- render ---------- */
  const PANELS = [['overview', 'Overview'], ['discover', 'Discover'], ['clean', 'Clean'], ['analyze', 'Analyze'], ['visualize', 'Visualize'], ['ask', 'Ask'], ['dashboard', 'Dashboard'], ['report', 'Report']];
  U.PANELS = PANELS;
  U.render = function () {
    REG.clear();
    const app = document.getElementById('app');
    const prevPanel = app.dataset.panel, prevScroll = window.scrollY;
    const ds = U.ds();
    let html = topHTML();
    if (st.view === 'home' || !ds) html += landingHTML();
    else html += wsHTML(ds);
    app.innerHTML = html;
    app.dataset.panel = st.view + ':' + st.panel + ':' + (ds ? ds.id : '');
    if (prevPanel === app.dataset.panel) window.scrollTo(0, prevScroll); else window.scrollTo(0, 0);
    U.mountCharts();
    if (st.view === 'ws' && st.panel === 'ask') { const c = document.getElementById('chatEnd'); if (c && U._scrollChat) { c.scrollIntoView({ block: 'end' }); U._scrollChat = false; } }
  };
  U.mountCharts = function (root = document) {
    root.querySelectorAll('.js-plot[data-ck]').forEach((el) => {
      if (el.__mounted) return; el.__mounted = true;
      const o = REG.get(el.dataset.ck); if (!o) return;
      E.renderChart(el, o.ds, o.spec).catch((e) => { el.innerHTML = `<div class="warn error" style="margin:12px">${esc(e.message || 'This chart could not be drawn.')}</div>`; el.style.height = 'auto'; });
    });
  };

  function topHTML() {
    const ws = st.view === 'ws' && U.ds();
    return `<header class="top">
      <button class="brand" data-act="home" aria-label="Explain Your Data home">${LOGO}<span>Explain Your Data</span></button>
      ${ws ? `<button class="search" data-act="palette" aria-label="Open command palette">${ic('search')}<span>Search actions, columns, analyses…</span><kbd>⌘K</kbd></button>` : ''}
      <div class="spacer"></div>
      ${ws ? `<div class="seg modeseg" role="group" aria-label="Interface mode"><button class="${st.pro ? '' : 'on'}" data-act="mode" data-v="0">Beginner</button><button class="${st.pro ? 'on' : ''}" data-act="mode" data-v="1">Pro</button></div>` : ''}
      <button class="btn sm ${ws ? '' : 'primary'}" data-act="upload">${ic(ws ? 'plus' : 'upload')} ${ws ? 'Add data' : 'Upload data'}</button>
    </header>`;
  }

  /* ---------- landing ---------- */
  let demo = null;
  function demoData() {
    if (demo) return demo;
    const ds = E.loadSample('retail'); const k = E.kpis(ds); const ins = E.discover(ds);
    const pick = (kind) => ins.find((i) => i.kind === kind);
    const orders = ds.n;
    demo = { ds, k, list: [pick('Trend'), pick('Anomaly'), pick('Segment')].filter(Boolean), orders };
    return demo;
  }
  function landingHTML() {
    const d = demoData(); const rev = d.k[0];
    const formats = ['CSV', 'XLSX', 'XLS', 'ODS', 'JSON', 'TSV', 'TXT', 'ZIP', 'DOCX', 'PDF', 'MD', 'HTML', 'XML', 'Google Forms', 'Images*'];
    return `<main class="land">
      <section class="hero">
        <div>
          <div class="eyebrow">Upload · Understand · Explain</div>
          <h1 style="margin-top:14px">Your data has answers. <em>Ask it anything.</em></h1>
          <p class="lede">Drop in a spreadsheet, survey export, research dataset or document. Explain Your Data profiles it, cleans it with you, runs the right statistics, draws the charts and writes up what it means.</p>
          <label class="drop" id="drop" for="fileIn">
            <h3>Drop your data here</h3>
            <div class="formats">${formats.map((f) => `<span>${f}</span>`).join('')}</div>
            <span class="btn primary lg">${ic('upload')} Browse files</span>
          </label>
          <div class="eyebrow" style="margin-top:22px">Or start from a sample</div>
          <div class="samples">${E.SAMPLE_META.map((s) => `<button class="sample" data-act="sample" data-k="${s.key}"><span class="kind">${s.kind}</span><b>${s.title}</b><small>${s.sub}</small></button>`).join('')}</div>
          <p class="privacy">${ic('shield')}<span>Files are read and analysed in your browser; nothing is uploaded to a server. When AI answers a question, it receives your column summary and computed results, not your rows. *Reading images needs AI.</span></p>
        </div>
        <aside class="preview" aria-label="Live example on the retail sample">
          <div class="bar"><span class="dots"><i></i><i></i><i></i></span><span class="mono">retail_sales_2025-26.csv</span><span class="muted" style="margin-left:auto">${d.orders.toLocaleString()} rows · 13 columns</span></div>
          <div class="body">
            <div class="mini-kpis">
              <div><small>Total revenue</small><b>${rev.value}</b>${rev.delta != null ? `<em>${fmt.signedPct(rev.delta)}</em>` : ''}</div>
              <div><small>Orders</small><b>${d.orders.toLocaleString()}</b></div>
              <div><small>Dataset health</small><b>${d.k[3].value}</b></div>
            </div>
            <div>${U.sparkSVG(rev.spark || [], 'var(--s1)').replace('class="spark"', 'class="spark" style="width:100%;height:64px"')}</div>
            <div class="ai-bubble">${ic('discover')}<span><b>I found ${E.discover(d.ds).length} things worth looking at.</b> Here are three.</span></div>
            <ul class="noticed" style="padding:0;margin:0;display:flex;flex-direction:column;gap:7px">${d.list.map((i) => `<li><span class="kind ${i.kind}">${i.kind}</span><span>${esc(i.title)}</span></li>`).join('')}</ul>
            <button class="btn" data-act="sample" data-k="retail">Open this example ${ic('arrow')}</button>
          </div>
        </aside>
      </section>
      <section class="steps" aria-label="How it works">
        ${[['Clean', 'Fix missing values, duplicates and messy labels, with every step reversible.'], ['Understand', 'Instant profile: types, health score, what stands out.'], ['Analyze', 'Tests, regression, forecasts, segments and survey scales.'], ['Visualize', 'Describe a chart or build one; bad choices are flagged.'], ['Explain', 'Plain-language answers, for a CEO, a professor or a 12-year-old.'], ['Report', 'Collect findings and export HTML, PDF, Markdown, Python and R.']].map((s, i) => `<div><span class="n">0${i + 1}</span><b>${s[0]}</b><small>${s[1]}</small></div>`).join('')}
      </section>
      <section class="caps">
        <div class="cap"><h3>Any data you have</h3><ul><li>Spreadsheets: CSV, Excel (every sheet), ODS, TSV</li><li>Survey and form exports, including Google Forms</li><li>Research datasets and field trials</li><li>JSON, XML, ZIP archives of many files</li><li>Documents and notes: DOCX, PDF, TXT, Markdown, with tables pulled out</li></ul></div>
        <div class="cap"><h3>Real statistics, not guesses</h3><ul><li>Every number is calculated from your rows</li><li>t-tests, ANOVA, chi-square, Mann–Whitney, Kruskal–Wallis</li><li>Correlation, multiple regression, k-means segments</li><li>Forecasts with prediction intervals</li><li>Likert summaries and Cronbach's alpha</li></ul></div>
        <div class="cap"><h3>Take it anywhere</h3><ul><li>Charts as PNG or SVG</li><li>Reports as HTML, PDF or Markdown</li><li>Cleaning pipeline as Python (pandas) or R (tidyverse)</li><li>Clean CSV or Excel to open in Tableau or Power BI</li><li>Code for every analysis, in Pro mode</li></ul></div>
      </section>
      <footer class="foot"><span>Explain Your Data · runs in your browser</span><span>Press <span class="mono">⌘K</span> in the workspace for every command</span></footer>
    </main>`;
  }

  /* ---------- workspace shell ---------- */
  function wsHTML(ds) {
    const text = ds.kind === 'text';
    const p = text ? null : E.profile(ds);
    const counts = { discover: text ? null : E.discover(ds).length, clean: text ? null : p.issues.filter((i) => i.fix).length || null, report: st.report.items.length || null, ask: (st.chat[ds.id] || []).length || null };
    const panels = text ? PANELS.filter(([k]) => ['overview', 'ask', 'report'].includes(k)) : PANELS;
    if (text && !['overview', 'ask', 'report'].includes(st.panel)) st.panel = 'overview';
    const panel = U.panels[st.panel] ? U.panels[st.panel](ds) : '';
    const ex = st.explored[ds.id] || new Set();
    const done = EXPLORE.filter(([k]) => ex.has(k));
    const todo = EXPLORE.filter(([k]) => !ex.has(k)).slice(0, 2);
    return `<div class="ws">
      <aside class="side" aria-label="Workspace navigation">
        <div class="group dsgroup"><div class="eyebrow">Data</div>
          ${st.datasets.map((d) => `<button class="dsitem ${d.id === ds.id ? 'on' : ''}" data-act="switchDs" data-id="${d.id}" title="${esc(d.name)}">${ic(d.kind === 'text' ? 'doc' : 'table')}<span class="nm">${esc(d.name)}</span></button>`).join('')}
          <button class="dsitem" data-act="upload">${ic('plus')}<span class="nm">Add files</span></button>
        </div>
        <nav class="group"><div class="eyebrow">Workspace</div>
          ${panels.map(([k, l]) => `<button class="nav ${st.panel === k ? 'on' : ''}" data-act="panel" data-p="${k}" ${st.panel === k ? 'aria-current="page"' : ''}>${ic(k)}${l}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')}
        </nav>
        ${text ? '' : `<div class="meter"><b style="color:var(--ink)">Explored ${done.length} of ${EXPLORE.length}</b><div class="track"><i style="width:${(done.length / EXPLORE.length) * 100}%"></i></div>${todo.length ? `Not yet: ${todo.map(([, l]) => l.toLowerCase()).join(', ')}` : 'Every angle covered.'}</div>`}
      </aside>
      <section class="main" id="main">${st.datasets.length > 1 ? `<label class="ds-mobile"><span class="sr">Dataset</span><select class="input" data-change="switchDsSel">${st.datasets.map((d) => `<option value="${d.id}" ${d.id === ds.id ? 'selected' : ''}>${esc(E.short(d.name, 48))}</option>`).join('')}</select></label>` : ''}${panel}</section>
      ${st.panel !== 'ask' ? askBarHTML(ds) : ''}
    </div>`;
  }
  function askBarHTML(ds) {
    return `<div class="askbar"><form data-submit="ask"><label class="sr" for="askIn">Ask about your data</label><input id="askIn" name="q" autocomplete="off" placeholder="Ask anything about ${esc(E.short(ds.name, 40))}…"><button class="btn primary" type="submit">${ic('arrow')} Ask</button></form></div>`;
  }
  U.askBarHTML = askBarHTML;

  U.panels = {};

  /* ---------- overview ---------- */
  U.panels.overview = function (ds) {
    U.markExplored('overview');
    if (ds.kind === 'text') return U.textOverview(ds);
    const p = E.profile(ds), k = E.kpis(ds), ins = E.discover(ds);
    const metaParts = [`${p.n.toLocaleString()} rows`, `${p.ncols} columns`, ds.size ? fmt.bytes(ds.size) : null, ds.sheet ? 'sheet ' + ds.sheet : null, ds.steps.length ? `${ds.steps.length} cleaning step${ds.steps.length > 1 ? 's' : ''} applied` : null, ds.note || null].filter(Boolean);
    const hcol = (v) => (v >= 90 ? 'var(--good)' : v >= 75 ? 'var(--warn)' : 'var(--crit)');
    const rels = st.datasets.length > 1 ? E.findRelationships(st.datasets).filter((r) => r.a === ds.id || r.b === ds.id) : [];
    return `
      <div class="phead"><div><div class="eyebrow">${esc(ds.source || '')}</div><h2 style="margin-top:6px">${esc(ds.name)}</h2><div class="meta">${metaParts.join(' · ')}</div></div>
        <div class="row"><button class="btn" data-act="panel" data-p="clean">${ic('clean')} Clean data</button><button class="btn primary" data-act="panel" data-p="discover">${ic('discover')} Discover</button></div></div>
      <div class="kpis">${k.map((x) => `<div class="kpi"><small title="${esc(x.label)}">${esc(x.label)}</small><b class="num">${esc(x.value)}</b>${x.delta != null ? `<span class="delta ${x.delta >= 0 ? 'up' : 'down'}">${x.delta >= 0 ? '▲' : '▼'} ${fmt.signedPct(x.delta)} <span class="muted" style="font-weight:400">${esc(x.deltaLabel)}</span></span>` : x.deltaLabel ? `<span class="delta muted" style="font-weight:400">${esc(x.deltaLabel)}</span>` : ''}${x.spark ? U.sparkSVG(x.spark) : ''}${x.health != null ? `<div class="hbar"><i style="width:${x.health}%;background:${hcol(x.health)}"></i></div>` : ''}</div>`).join('')}</div>
      <div class="grid2">
        <div class="card"><h3>${ic('discover')} Things I noticed <button class="btn ghost sm right" data-act="panel" data-p="discover">See all ${ins.length} ${ic('arrow')}</button></h3>
          <div class="list-insights">${ins.slice(0, 5).map((i) => `<button class="li-ins" data-act="openInsight" data-id="${i.id}"><span class="kind ${i.kind} k">${i.kind}</span><span class="t">${esc(i.title)}</span><span class="conf">${i.confidence}</span></button>`).join('') || '<p class="muted">Nothing notable yet. Try Analyze.</p>'}</div></div>
        <div class="card"><h3>${ic('shield')} Dataset health <span class="right" style="font:650 22px var(--f-display);color:${hcol(p.health.score)}">${p.health.score}<span class="muted" style="font-size:13px">/100</span></span></h3>
          <div class="health-rows">${['completeness', 'uniqueness', 'validity', 'consistency', 'structure'].map((h) => `<div><span style="text-transform:capitalize">${h}</span><div class="hbar"><i style="width:${Math.max(0, p.health[h])}%;background:${hcol(p.health[h])}"></i></div><span class="num" style="text-align:right">${Math.round(p.health[h])}</span></div>`).join('')}</div>
          <div class="issues">${p.issues.slice(0, 4).map((i) => `<div class="issue"><div><div class="t"><span class="sev ${i.severity}"></span> ${esc(i.title)}</div></div>${i.fix ? `<button class="btn sm" data-act="applyIssue" data-id="${i.id}">${esc(i.fix.label)}</button>` : ''}</div>`).join('') || `<p class="sev good">No issues found</p>`}</div>
          ${p.issues.length > 4 ? `<button class="btn ghost sm" data-act="panel" data-p="clean">All ${p.issues.length} issues ${ic('arrow')}</button>` : ''}
        </div>
      </div>
      <div class="gap"></div>
      <div class="card"><h3>${ic('ask')} Questions you could ask</h3><div class="qchips">${E.suggestQuestions(ds).map((q) => `<button class="chip" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>
      <div class="gap"></div>
      ${rels.length ? `<div class="card"><h3>${ic('table')} Possible links between your files</h3>${rels.slice(0, 4).map((r) => `<div class="issue"><div><div class="t"><span class="mono">${esc(r.aName)}.${esc(r.colA)}</span> → <span class="mono">${esc(r.bName)}.${esc(r.colB)}</span></div><div class="d">${fmt.pct(r.overlap, 0)} of key values match · ${r.kind}</div></div><button class="btn sm" data-act="join" data-a="${r.a}" data-b="${r.b}" data-ca="${esc(r.colA)}" data-cb="${esc(r.colB)}">Combine</button></div>`).join('')}</div><div class="gap"></div>` : ''}
      <div class="card"><h3>${ic('table')} Columns <span class="muted right" style="font:400 12px var(--f-body)">Change a type to reinterpret a column</span></h3>
        <div class="tbl-wrap" style="max-height:none"><table class="tbl colprof"><thead><tr><th>Column</th><th>Type</th><th class="n">Missing</th><th class="n">Distinct</th><th>Summary</th><th>Shape</th></tr></thead><tbody>
        ${p.cols.map((c) => `<tr><td class="nm" title="${esc(c.name)}">${esc(E.short(c.name, 40))}</td>
          <td><select class="input" style="width:auto;padding:3px 26px 3px 8px;font-size:12px" data-change="convertType" data-col="${esc(c.name)}" aria-label="Type of ${esc(c.name)}">${['number', 'category', 'date', 'text', 'id'].map((t) => `<option value="${t}" ${c.type === t ? 'selected' : ''}>${t}${c.ordinal && t === 'category' ? ' (ordered)' : ''}</option>`).join('')}</select></td>
          <td class="n ${c.missing ? '' : 'muted'}">${c.missing ? `${c.missing.toLocaleString()} <span class="muted">(${fmt.pct(c.missingPct, 0)})</span>` : '0'}${c.invalid ? `<br><span class="sev warning">${c.invalid} invalid</span>` : ''}</td>
          <td class="n">${c.unique.toLocaleString()}</td>
          <td class="topvals">${colSummary(c)}</td>
          <td>${c.type === 'number' ? U.histSVG(c.hist) : c.top ? miniBars(c.top) : c.type === 'date' ? `<span class="muted">${c.grain}ly</span>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="gap"></div>
      <div class="card"><h3>${ic('eye')} Data preview <span class="muted right" style="font:400 12px var(--f-body)">First 100 of ${p.n.toLocaleString()} rows</span></h3>${previewTable(ds, 100)}</div>`;
  };
  function colSummary(c) {
    if (c.type === 'number' && c.desc && c.desc.n) return `<span class="num">${fmt.compact(c.desc.min, c.unit)} – ${fmt.compact(c.desc.max, c.unit)}</span> <span class="muted">· median ${fmt.compact(c.desc.median, c.unit)}</span>`;
    if (c.type === 'date') return `<span class="num">${fmt.date(c.min)} – ${fmt.date(c.max)}</span>`;
    if (c.type === 'text') return `<span class="muted">Free text · avg ${Math.round(c.avgLen || 0)} chars</span>`;
    if (c.top) return c.top.slice(0, 3).map(([v, n]) => `${esc(E.short(String(v), 22))} <span class="muted">${n}</span>`).join(' · ');
    return '';
  }
  function miniBars(top) {
    const t = top.slice(0, 8); const mx = Math.max(...t.map((x) => x[1])) || 1; const w = 110, h = 26, bw = w / Math.max(t.length, 1);
    return `<svg class="hist" viewBox="0 0 ${w} ${h}" aria-hidden="true">${t.map(([, n], i) => { const bh = Math.max(1.5, (n / mx) * (h - 2)); return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="var(--s7)"/>`; }).join('')}</svg>`;
  }
  function previewTable(ds, max) {
    const n = Math.min(max, ds.n);
    const head = `<thead><tr><th class="n">#</th>${ds.cols.map((c) => `<th class="${c.type === 'number' ? 'n' : ''}" title="${esc(c.name)}">${esc(E.short(c.name, 24))}</th>`).join('')}</tr></thead>`;
    let body = '';
    for (let i = 0; i < n; i++) body += `<tr><td class="n muted">${i + 1}</td>${ds.cols.map((c) => { const v = c.values[i]; return v == null ? '<td class="miss">missing</td>' : `<td class="${c.type === 'number' ? 'n' : ''}" title="${esc(E.fmtVal(c, v))}">${esc(E.short(E.fmtVal(c, v), 40))}</td>`; }).join('')}</tr>`;
    return `<div class="tbl-wrap"><table class="tbl">${head}<tbody>${body}</tbody></table></div>`;
  }
  U.previewTable = previewTable;

  /* ---------- text documents ---------- */
  U.textOverview = function (ds) {
    ds._text = ds._text || E.analyzeText(ds.text);
    const a = ds._text; const tables = st.datasets.filter((d) => ds.tables && ds.tables.includes(d.id));
    const read = a.flesch >= 60 ? 'plain' : a.flesch >= 40 ? 'fairly difficult' : 'difficult';
    const kwSpec = a.keywords.length ? { type: 'custom', title: 'Most frequent terms', custom: { traces: [{ type: 'bar', orientation: 'h', y: a.keywords.slice(0, 15).map((k) => k[0]).reverse(), x: a.keywords.slice(0, 15).map((k) => k[1]).reverse(), marker: { color: E.theme().series[0] }, hovertemplate: '%{y}: %{x}<extra></extra>' }], layout: { showlegend: false, margin: { l: 110 }, xaxis: { title: 'Mentions', dtick: a.keywords[0][1] <= 10 ? 1 : undefined } } } } : null;
    return `<div class="phead"><div><div class="eyebrow">Document · ${esc(ds.source || '')}</div><h2 style="margin-top:6px">${esc(ds.name)}</h2><div class="meta">${a.words.toLocaleString()} word${a.words === 1 ? '' : 's'} · ${a.sentences.toLocaleString()} sentence${a.sentences === 1 ? '' : 's'} · ${a.paragraphs} paragraph${a.paragraphs === 1 ? '' : 's'}${ds.note ? ' · ' + esc(ds.note) : ''}</div></div>
      ${st.claude ? `<button class="btn primary" data-act="summariseDoc">${ic('discover')} Summarise with ${U.aiName()}</button>` : ''}</div>
      <div class="kpis">
        <div class="kpi"><small>Words</small><b class="num">${a.words.toLocaleString()}</b><span class="muted" style="font-size:12px">${a.unique.toLocaleString()} distinct</span></div>
        <div class="kpi"><small>Reading time</small><b class="num">${Math.max(1, Math.round(a.readingMin))} min</b></div>
        <div class="kpi"><small>Readability (Flesch)</small><b class="num">${E.isNum(a.flesch) ? Math.round(a.flesch) : '—'}</b><span class="muted" style="font-size:12px">${read}</span></div>
        <div class="kpi"><small>Numbers mentioned</small><b class="num">${a.numbers.length}</b><span class="muted" style="font-size:12px">${tables.length} table${tables.length === 1 ? '' : 's'} found</span></div>
      </div>
      ${ds._summary ? `<div class="card"><h3>${ic('discover')} Summary</h3><div class="explain-out">${esc(ds._summary)}</div></div><div class="gap"></div>` : `<div class="card" id="docSumCard" hidden><h3>${ic('discover')} Summary</h3><div class="explain-out" id="docSum"></div></div>`}
      ${tables.length ? `<div class="card"><h3>${ic('table')} Tables found in this document</h3>${tables.map((t) => `<div class="issue"><div><div class="t">${esc(t.name)}</div><div class="d">${t.n} rows · ${t.cols.length} columns</div></div><button class="btn sm primary" data-act="switchDs" data-id="${t.id}">Analyse table</button></div>`).join('')}</div><div class="gap"></div>` : ''}
      <div class="grid2">
        <div class="card"><h3>Key sentences</h3><div class="stack">${a.topSentences.map((s) => `<p class="keysent">${esc(s.s)}</p>`).join('') || '<p class="muted">Too short to rank sentences.</p>'}</div></div>
        <div class="card"><h3>Top terms</h3>${kwSpec ? U.plotHTML(ds, kwSpec, 'sm') : '<p class="muted">No repeated terms.</p>'}${a.bigrams.length ? `<div class="qchips" style="margin-top:8px">${a.bigrams.slice(0, 10).map(([b, n]) => `<span class="pill">${esc(b)} · ${n}</span>`).join('')}</div>` : ''}</div>
      </div>
      <div class="gap"></div>
      ${a.numbers.length ? `<div class="card"><h3>Numbers in context</h3>${U.tableHTML({ columns: ['Value', 'Context'], rows: a.numbers.slice(0, 60).map((n) => [n.value, n.context]) }, 10)}</div><div class="gap"></div>` : ''}
      <div class="card"><h3>Text</h3><div class="doc-text">${esc(ds.text.slice(0, 30000))}${ds.text.length > 30000 ? '\n\n…' : ''}</div></div>`;
  };

  /* ---------- discover ---------- */
  U.panels.discover = function (ds) {
    U.markExplored('discover');
    const ins = E.discover(ds);
    const kinds = ['All', ...new Set(ins.map((i) => i.kind))];
    const f = kinds.includes(st.discoverFilter) ? st.discoverFilter : 'All';
    const list = ins.filter((i) => f === 'All' || i.kind === f);
    return `<div class="phead"><div><div class="eyebrow">Discover</div><p class="found" style="margin-top:8px">I found ${ins.length} thing${ins.length === 1 ? '' : 's'} worth looking at.</p><div class="meta">Ranked by strength of evidence. Every finding is computed from your rows; open one to see the chart and the calculation.</div></div>
      <button class="btn" data-act="allToReport">${ic('report')} Add all to report</button></div>
      <div class="qchips" style="margin-bottom:14px" role="group" aria-label="Filter findings">${kinds.map((k) => `<button class="chip ${k === f ? 'on' : ''}" data-act="dFilter" data-k="${k}">${k}${k === 'All' ? '' : ' · ' + ins.filter((i) => i.kind === k).length}</button>`).join('')}</div>
      <div class="insights">${list.map((i) => insightCard(ds, i)).join('') || '<div class="empty"><h3>No findings in this category</h3></div>'}</div>`;
  };
  function insightCard(ds, i) {
    const open = st.openInsights.has(ds.id + i.id);
    const key = reg({ insight: i, ds });
    return `<article class="ins ${open ? 'open' : ''}" id="ins-${i.id}">
      <div class="row"><span class="kind ${i.kind}">${i.kind}</span><span class="conf">Confidence <b>${i.confidence}</b></span></div>
      <h3>${esc(i.title)}</h3><p>${esc(i.body)}</p>
      ${open ? `${i.chart ? U.plotHTML(ds, i.chart) : ''}${i.evidence ? `<div><div class="eyebrow" style="margin-bottom:6px">Evidence</div><ol class="evidence">${i.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ol></div>` : ''}${U.codeHTML(i.code)}` : ''}
      <div class="foot2">
        ${i.chart ? `<button class="btn sm ${open ? '' : 'primary'}" data-act="toggleInsight" data-id="${i.id}">${ic(open ? 'x' : 'visualize')} ${open ? 'Close' : 'Explore'}</button>` : ''}
        ${i.action === 'clean' ? `<button class="btn sm primary" data-act="panel" data-p="clean">${ic('clean')} Fix issues</button>` : ''}
        <button class="btn sm" data-act="toReport" data-k="${key}">${ic('report')} Add to report</button>
        <button class="btn sm ghost" data-act="ask" data-q="${esc(whyQ(i))}">${ic('ask')} Ask why</button>
      </div></article>`;
  }
  function whyQ(i) { if (i.kind === 'Anomaly' && /jumped|dropped/.test(i.title)) return 'Why did it change in ' + i.title.split(' jumped')[0].split(' dropped')[0] + '?'; if (i.kind === 'Trend') return 'What caused the change?'; return 'Tell me more: ' + i.title; }
})();
