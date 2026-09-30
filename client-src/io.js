/* Explain Your Data — file readers (CSV, TSV, TXT, Excel, JSON, ZIP, DOCX, PDF, Markdown, HTML, XML, images via Claude) */
(function () {
  const E = window.EYD;

  const CDN = {
    papaparse: ['https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'],
    xlsx: ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
    jszip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'],
    mammoth: ['https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'],
    plotly: ['https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js'],
    pdfjs: ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
    jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'],
  };
  E.CDN = CDN;
  const loaded = {};
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src.split('/npm/')[1]));
      document.head.appendChild(s);
    });
  }
  E.need = function (name) {
    if (!loaded[name]) loaded[name] = CDN[name].reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve()).catch((e) => { loaded[name] = null; throw e; });
    return loaded[name];
  };

  const ext = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const TABLE_EXT = ['csv', 'tsv', 'tab', 'psv', 'dat'];
  const EXCEL_EXT = ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'numbers'];
  E.SUPPORTED = ['csv', 'tsv', 'txt', 'xlsx', 'xls', 'xlsm', 'ods', 'json', 'ndjson', 'geojson', 'zip', 'docx', 'pdf', 'md', 'html', 'xml', 'png', 'jpg', 'jpeg', 'webp'];

  function headerRowIndex(aoa) {
    // first row within the first 15 where most cells are non-empty strings and the next row exists
    const limit = Math.min(15, aoa.length);
    let best = 0, bestScore = -1;
    const width = Math.max(...aoa.slice(0, 50).map((r) => (r ? r.length : 0)), 1);
    for (let i = 0; i < limit; i++) {
      const r = aoa[i] || [];
      const filled = r.filter((v) => v != null && String(v).trim() !== '').length;
      const strs = r.filter((v) => typeof v === 'string' && v.trim() !== '' && isNaN(+v)).length;
      const score = filled / width + strs / width;
      if (filled >= Math.max(2, width * 0.5) && score > bestScore + 0.25) { best = i; bestScore = score; }
      if (bestScore >= 1.8) break;
    }
    return best;
  }
  function fromAOA(aoa, meta) {
    aoa = aoa.filter((r) => r && r.some((v) => v != null && String(v).trim() !== ''));
    if (aoa.length < 2) return null;
    const h = headerRowIndex(aoa);
    const width = Math.max(...aoa.map((r) => r.length));
    const headers = Array.from({ length: width }, (_, j) => aoa[h][j]);
    // drop completely empty columns
    const keep = headers.map((_, j) => aoa.slice(h).some((r) => r[j] != null && String(r[j]).trim() !== ''));
    const rows = aoa.slice(h + 1).map((r) => headers.map((_, j) => r[j]).filter((_, j) => keep[j]));
    return E.makeDataset({ ...meta, headers: headers.filter((_, j) => keep[j]), rows });
  }
  E.fromAOA = fromAOA;

  async function parseDelimited(text, meta, delimiter) {
    await E.need('papaparse');
    const res = window.Papa.parse(text.replace(/^﻿/, ''), { delimiter: delimiter || '', skipEmptyLines: 'greedy', dynamicTyping: false });
    return fromAOA(res.data, meta);
  }

  function flatten(obj, prefix, out) {
    out = out || {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length < 30) flatten(v, key, out);
      else if (Array.isArray(v)) out[key] = v.every((x) => typeof x !== 'object') ? v.join(', ') : JSON.stringify(v).slice(0, 200);
      else out[key] = v;
    }
    return out;
  }
  function jsonToDatasets(data, meta) {
    const out = [];
    const tableFrom = (arr, name) => {
      const rows = arr.map((r) => (r && typeof r === 'object' ? flatten(r.type === 'Feature' && r.properties ? r.properties : r) : { value: r }));
      const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 200);
      out.push(E.makeDataset({ ...meta, name, headers, rows: rows.map((r) => headers.map((h) => r[h])) }));
    };
    if (Array.isArray(data)) {
      if (data.length && Array.isArray(data[0])) out.push(fromAOA(data, meta));
      else tableFrom(data, meta.name);
    } else if (data && typeof data === 'object') {
      if (data.type === 'FeatureCollection' && Array.isArray(data.features)) tableFrom(data.features, meta.name);
      else {
        const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v) && v.length && typeof v[0] === 'object');
        if (arrays.length) arrays.slice(0, 10).forEach(([k, v]) => tableFrom(v, meta.name + (arrays.length > 1 ? ' › ' + k : '')));
        else tableFrom([data], meta.name);
      }
    }
    return out.filter(Boolean);
  }

  function htmlTablesToDatasets(html, meta) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    doc.querySelectorAll('table').forEach((t, i) => {
      const aoa = [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((td) => td.textContent.trim()));
      const ds = fromAOA(aoa, { ...meta, name: meta.name + ' › table ' + (i + 1), sheet: 'table ' + (i + 1) });
      if (ds && ds.n >= 2) out.push(ds);
    });
    return { tables: out, text: doc.body ? doc.body.innerText || doc.body.textContent : '' };
  }
  function markdownTables(text, meta) {
    const out = []; const lines = text.split('\n'); let i = 0, k = 0;
    while (i < lines.length) {
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const block = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { block.push(lines[i]); i++; }
        const aoa = block.filter((_, j) => j !== 1).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        const ds = fromAOA(aoa, { ...meta, name: meta.name + ' › table ' + ++k }); if (ds) out.push(ds);
      } else i++;
    }
    return out;
  }
  function xmlToDatasets(text, meta) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('This XML file could not be read.');
    // find the element name that repeats most under a common parent
    const counts = new Map();
    doc.querySelectorAll('*').forEach((el) => { if (el.children.length) { const k = el.parentNode && el.parentNode.nodeName + '>' + el.nodeName; counts.set(k, (counts.get(k) || 0) + 1); } });
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 2) return [];
    const [parent, child] = best[0].split('>');
    const els = [...doc.getElementsByTagName(child)].filter((e) => e.parentNode.nodeName === parent);
    const rows = els.map((el) => { const o = {}; [...el.attributes].forEach((a) => (o['@' + a.name] = a.value)); [...el.children].forEach((c) => (o[c.nodeName] = c.children.length ? c.textContent.trim().slice(0, 200) : c.textContent.trim())); return o; });
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return [E.makeDataset({ ...meta, headers, rows: rows.map((r) => headers.map((h) => r[h])) })];
  }

  async function readPdf(buf, meta) {
    await E.need('pdfjs');
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    let text = '';
    const pages = Math.min(pdf.numPages, 60);
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p); const tc = await page.getTextContent();
      // rebuild lines by y position
      const lines = new Map();
      for (const it of tc.items) { const y = Math.round(it.transform[5]); const arr = lines.get(y) || []; arr.push({ x: it.transform[4], s: it.str }); lines.set(y, arr); }
      const ys = [...lines.keys()].sort((a, b) => b - a);
      text += ys.map((y) => lines.get(y).sort((a, b) => a.x - b.x).map((o) => o.s).join('  ').replace(/\s{3,}/g, '\t')).join('\n') + '\n\n';
    }
    const docs = [];
    // try tab-separated blocks as tables
    const block = text.split('\n').filter((l) => (l.match(/\t/g) || []).length >= 2);
    if (block.length >= 5) { const aoa = block.map((l) => l.split('\t').map((c) => c.trim())); const w = {}; aoa.forEach((r) => (w[r.length] = (w[r.length] || 0) + 1)); const common = +Object.entries(w).sort((a, b) => b[1] - a[1])[0][0]; const rows = aoa.filter((r) => r.length === common); if (rows.length >= 5) { const ds = fromAOA(rows, { ...meta, name: meta.name + ' › extracted table' }); if (ds) docs.push(ds); } }
    docs.unshift(E.makeTextDoc({ ...meta, text, tables: docs.map((d) => d.id) }));
    if (pdf.numPages > pages) docs[0].note = `Read the first ${pages} of ${pdf.numPages} pages.`;
    return docs;
  }

  async function readOne(name, getBuf, getText, size, onStep) {
    const e = ext(name);
    const meta = { name, file: name, size };
    onStep && onStep('Reading ' + name);
    if (TABLE_EXT.includes(e)) return [await parseDelimited(await getText(), meta, e === 'tsv' || e === 'tab' ? '\t' : e === 'psv' ? '|' : '')].filter(Boolean);
    if (EXCEL_EXT.includes(e)) {
      await E.need('xlsx');
      const wb = window.XLSX.read(await getBuf(), { type: 'array', cellDates: true, dense: false });
      const out = [];
      for (const sn of wb.SheetNames) {
        const aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
        const ds = fromAOA(aoa, { ...meta, name: wb.SheetNames.length > 1 ? name + ' › ' + sn : name, sheet: sn });
        if (ds && ds.n) out.push(ds);
      }
      if (!out.length) throw new Error(name + ' has no sheets with data.');
      return out;
    }
    if (e === 'json' || e === 'geojson') { let data; const t = await getText(); try { data = JSON.parse(t); } catch (err) { throw new Error(name + ' is not valid JSON: ' + err.message); } return jsonToDatasets(data, meta); }
    if (e === 'ndjson' || e === 'jsonl') { const t = await getText(); return jsonToDatasets(t.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)), meta); }
    if (e === 'zip') {
      await E.need('jszip');
      const zip = await window.JSZip.loadAsync(await getBuf());
      const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.)/.test(f.name) && E.SUPPORTED.includes(ext(f.name)) && ext(f.name) !== 'zip');
      if (!entries.length) throw new Error(name + ' has no supported files inside.');
      let total = 0; const out = [];
      for (const f of entries.slice(0, 40)) {
        const sz = f._data && f._data.uncompressedSize; total += sz || 0;
        if (total > 400 * 1048576) throw new Error('The ZIP expands to more than 400 MB. Upload fewer files at once.');
        const base = f.name.split('/').pop();
        try { const r = await readOne(base, () => f.async('arraybuffer'), () => f.async('string'), sz || 0, onStep); r.forEach((d) => (d.source = name + ' / ' + f.name)); out.push(...r); } catch (err) { out.push({ error: err.message, name: base }); }
      }
      return out;
    }
    if (e === 'docx') {
      await E.need('mammoth');
      const buf = await getBuf();
      const [html, raw] = await Promise.all([window.mammoth.convertToHtml({ arrayBuffer: buf }), window.mammoth.extractRawText({ arrayBuffer: buf.slice(0) })]);
      const { tables } = htmlTablesToDatasets(html.value, meta);
      const doc = E.makeTextDoc({ ...meta, text: raw.value, tables: tables.map((t) => t.id) });
      return [doc, ...tables];
    }
    if (e === 'pdf') return readPdf(await getBuf(), meta);
    if (e === 'html' || e === 'htm') { const { tables, text } = htmlTablesToDatasets(await getText(), meta); return [E.makeTextDoc({ ...meta, text, tables: tables.map((t) => t.id) }), ...tables]; }
    if (e === 'xml') return xmlToDatasets(await getText(), meta);
    if (e === 'md' || e === 'markdown' || e === 'txt' || e === 'text' || e === 'log' || e === 'rtf' || e === '') {
      let t = await getText();
      if (e === 'rtf') t = t.replace(/\\par[d]?/g, '\n').replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '').trim();
      const a = E.analyzeText(t.slice(0, 20000));
      if (a.delim && e !== 'md') return [await parseDelimited(t, meta, a.delim)].filter(Boolean);
      const tables = e === 'md' || e === 'markdown' || e === 'txt' ? markdownTables(t, meta) : [];
      return [E.makeTextDoc({ ...meta, text: t, tables: tables.map((x) => x.id) }), ...tables];
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) return [{ image: true, name, getBuf }];
    if (['sav', 'dta', 'sas7bdat', 'parquet', 'feather', 'xpt'].includes(e) && E.apiBase && E.apiBase()) {
      const fd = new FormData(); fd.append('file', new Blob([await getBuf()]), name);
      const r = await fetch(E.apiBase() + '/convert', { method: 'POST', body: fd }); if (!r.ok) throw new Error(name + ': the server could not convert this file (' + (await r.text()).slice(0, 120) + ').');
      return [await parseDelimited(await r.text(), meta, ',')].filter(Boolean);
    }
    if (['sav', 'dta', 'sas7bdat', 'parquet', 'feather', 'rds', 'rdata'].includes(e)) throw new Error(`${name}: .${e} files need the server engine. Export it as CSV or Excel for now (in R: write.csv; in SPSS: File › Save As › CSV).`);
    throw new Error(`${name}: .${e || 'unknown'} files aren't supported yet. Try CSV, Excel, JSON, DOCX, PDF, TXT or ZIP.`);
  }

  E.readFiles = async function (files, onStep) {
    const out = [];
    for (const f of files) {
      if (f.size > 300 * 1048576) { out.push({ error: `${f.name} is ${E.fmt.bytes(f.size)}. The browser engine handles files up to 300 MB.`, name: f.name }); continue; }
      try {
        const r = await readOne(f.name, () => f.arrayBuffer(), () => f.text(), f.size, onStep);
        r.forEach((d) => { if (d && !d.error && !d.image) d.size = f.size; });
        out.push(...r.filter(Boolean));
      } catch (err) { out.push({ error: err.message || String(err), name: f.name }); }
    }
    return out;
  };

  /* read a table from an image through Claude (sample capability with images) */
  E.imageToDataset = async function (sample, name, blob) {
    const res = await sample.json(
      'The attached image contains a table or chart with data. Transcribe the data into JSON with this exact shape: {"headers": [string, ...], "rows": [[cell, ...], ...]}. Use numbers for numeric cells without currency symbols or thousands separators. If the image has no tabular data reply {"headers": [], "rows": []}.',
      { images: blob, modelTier: 'default' }
    );
    if (!res || !Array.isArray(res.headers) || !res.headers.length) throw new Error('No table found in ' + name + '.');
    return E.makeDataset({ name, file: name, headers: res.headers, rows: res.rows || [], source: name + ' (read by Claude)' });
  };

  /* runtime capabilities (only inside the Claude viewer) */
  const caps = {};
  E.getCap = function (name) {
    if (!caps[name]) {
      const viewer = window.claude && typeof window.claude.use === 'function' ? Promise.resolve(window.claude.use(name)).catch(() => null) : Promise.resolve(null);
      caps[name] = viewer.then((c) => (c || name !== 'sample' || !E.apiBase || !E.apiBase() ? c : E.serverSample(E.apiBase())));
    }
    return caps[name];
  };

  /* file saving: artifact downloads capability, otherwise a normal browser download */
  E.saveFile = async function (filename, data, mime) {
    let dl = null;
    try { dl = await E.getCap('downloads'); } catch (e) { dl = null; }
    if (dl) {
      const okExt = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip)$/i;
      if (!okExt.test(filename)) filename += '.txt';
      try { await dl.save({ filename, data }); return 'saved'; } catch (e) { if (e && e.code === 'declined') return 'declined'; if (e && (e.code === 'unavailable' || e.code === 'not_granted')) {} else throw new Error(e && e.message ? e.message : 'Download failed'); }
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  };
  E.dataUrlToBlob = function (url) { const [h, b] = url.split(','); const mime = h.match(/:(.*?);/)[1]; const bin = atob(b); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime }); };
})();
