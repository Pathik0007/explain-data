/* Explain Your Data — sample datasets (seeded, realistic, with deliberate data-quality issues) */
(function () {
  const E = window.EYD;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function normal(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const pick = (r, arr, w) => { if (!w) return arr[Math.floor(r() * arr.length)]; const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x <= 0) return arr[i]; } return arr[arr.length - 1]; };
  const iso = (ts) => new Date(ts).toISOString().slice(0, 10);

  function retail() {
    const r = rng(2026);
    const products = [['Aurora Lamp', 'Lighting', 89], ['Birch Desk', 'Furniture', 420], ['Cedar Chair', 'Furniture', 185], ['Dune Sofa', 'Furniture', 1290], ['Echo Speaker', 'Electronics', 149], ['Fjord Shelf', 'Furniture', 240], ['Glow Strip', 'Lighting', 39], ['Halo Headphones', 'Electronics', 229]];
    const regions = ['North', 'South', 'East', 'West'];
    const channels = ['Online', 'Store', 'Partner'];
    const rows = [];
    const start = Date.UTC(2025, 0, 1), months = 21; // Jan 2025 – Sep 2026
    let id = 10001;
    for (let mo = 0; mo < months; mo++) {
      const growth = 1 + mo * 0.028;
      const seasonal = [0.9, 0.85, 1.35, 0.95, 1.0, 0.98, 0.95, 1.0, 1.05, 1.1, 1.3, 1.45][(mo) % 12];
      const orders = Math.round(125 * growth * seasonal * (0.95 + r() * 0.1));
      for (let k = 0; k < orders; k++) {
        const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + mo); d.setUTCDate(1 + Math.floor(r() * 28));
        const [prod, cat, price] = pick(r, products, [16, 9, 12, 4, 13, 8, 18, 10]);
        const region = pick(r, regions, [34, 22, 24, 20]);
        const channel = pick(r, channels, [52, 36, 12]);
        let units = Math.max(1, Math.round(1 + Math.abs(normal(r)) * (cat === 'Lighting' ? 2.2 : 1)));
        if (r() < 0.004) units = 40 + Math.floor(r() * 60); // bulk outliers
        const discount = pick(r, [0, 0, 0, 0.05, 0.1, 0.15, 0.2], null);
        const unitPrice = Math.round(price * (0.95 + r() * 0.1) * 100) / 100;
        const revenue = Math.round(units * unitPrice * (1 - discount) * 100) / 100;
        const age = Math.round(38 + normal(r) * 11 + (channel === 'Online' ? -6 : 4));
        let returnP = 0.05 + (prod === 'Cedar Chair' && region === 'West' ? 0.24 : 0) + (discount >= 0.15 ? 0.03 : 0);
        const returned = r() < returnP ? 'Yes' : 'No';
        let rating = returned === 'Yes' ? Math.max(1, Math.round(2.2 + normal(r) * 0.9)) : Math.min(5, Math.max(1, Math.round(4.1 + normal(r) * 0.7)));
        let regionLabel = region;
        if (r() < 0.012) regionLabel = region.toLowerCase();
        else if (r() < 0.01) regionLabel = region + ' ';
        rows.push([`ORD-${id++}`, iso(d.getTime()), regionLabel, channel, prod, cat, r() < 0.03 ? '' : Math.min(79, Math.max(18, age)), units, unitPrice, discount, revenue, returned, r() < 0.05 ? '' : rating]);
      }
    }
    // duplicates and a few bad dates
    for (let k = 0; k < 42; k++) rows.splice(Math.floor(r() * rows.length), 0, rows[Math.floor(r() * rows.length)].slice());
    for (let k = 0; k < 9; k++) rows[Math.floor(r() * rows.length)][1] = pick(r, ['N/A', '2025-13-04', 'TBC', '31/02/2026']);
    return { name: 'retail_sales_2025-26.csv', headers: ['order_id', 'order_date', 'region', 'channel', 'product', 'category', 'customer_age', 'units', 'unit_price', 'discount', 'revenue', 'returned', 'rating'], rows, blurb: 'Retail orders, Jan 2025 – Sep 2026' };
  }

  function survey() {
    const r = rng(77);
    const scale = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
    const faculties = ['Science & Engineering', 'Business', 'Arts', 'Medicine & Health', 'Law'];
    const years = ['1st year', '2nd year', '3rd year', '4th year', 'Postgraduate'];
    const items = ['I feel supported by teaching staff', 'My workload is manageable', 'I have a good balance between study and life', 'I know where to get help for my wellbeing', 'I feel part of a community at university'];
    const comments = ['More flexible deadlines would help a lot.', 'The library study spaces are always full during exams.', 'Tutors are helpful but it is hard to get appointments.', 'Would like more social events for postgrads.', 'Workload spikes in week 6 and week 12 are brutal.', 'Great support from my faculty.', '', '', '', 'Counselling wait times are too long.', 'Online lectures make it easier to work part time.', ''];
    const rows = [];
    const start = Date.UTC(2026, 2, 2, 8);
    for (let i = 0; i < 426; i++) {
      const fac = pick(r, faculties, [30, 22, 18, 20, 10]); const yr = pick(r, years, [26, 22, 20, 12, 20]);
      const sleep = Math.round((6.9 + normal(r) * 1.0 - (fac === 'Medicine & Health' ? 0.5 : 0)) * 2) / 2;
      const study = Math.max(2, Math.round(22 + normal(r) * 8 + (fac === 'Medicine & Health' ? 8 : 0) + (fac === 'Law' ? 5 : 0)));
      const work = Math.max(0, Math.round(pick(r, [0, 0, 8, 12, 16, 20, 25]) + normal(r) * 2));
      const latent = normal(r) * 0.9 + (sleep - 7) * 0.35 - (study - 22) * 0.03 - work * 0.02;
      const answers = items.map((_, j) => { const bias = [0.5, -0.5, -0.3, 0.1, -0.1][j]; const v = Math.round(3 + latent + bias + normal(r) * 0.7); return scale[Math.min(4, Math.max(0, v - 1))]; });
      const sat = Math.min(10, Math.max(1, Math.round(6.4 + latent * 1.2 + normal(r) * 1.1)));
      const ts = new Date(start + Math.floor(r() * 18 * 864e5) + Math.floor(r() * 12 * 36e5));
      const h = ts.getUTCHours(); const stamp = `${ts.getUTCFullYear()}/${String(ts.getUTCMonth() + 1).padStart(2, '0')}/${String(ts.getUTCDate()).padStart(2, '0')} ${h % 12 || 12}:${String(ts.getUTCMinutes()).padStart(2, '0')}:${String(ts.getUTCSeconds()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} GMT+11`;
      rows.push([stamp, yr, fac, r() < 0.04 ? '' : sleep, study, work, ...answers.map((a) => (r() < 0.02 ? '' : a)), sat, pick(r, comments)]);
    }
    return { name: 'student_wellbeing_survey (Google Forms).csv', headers: ['Timestamp', 'What is your year of study?', 'Faculty', 'Hours of sleep on a typical night', 'Hours of study per week', 'Hours of paid work per week', ...items, 'Overall, how satisfied are you with your university experience? (1-10)', 'Any other comments?'], rows, blurb: 'Google Forms export, 426 responses' };
  }

  function trial() {
    const r = rng(314);
    const treatments = [['Control', 0], ['Nitrogen low', 0.45], ['Nitrogen high', 0.85], ['Biochar', 0.6]];
    const rows = []; let plot = 1;
    for (let block = 1; block <= 6; block++) for (const site of ['Wagga Wagga', 'Dubbo']) for (const [t, eff] of treatments) for (const variety of ['Scepter', 'Rockstar']) for (let rep = 0; rep < 2; rep++) {
      const rain = Math.round((site === 'Dubbo' ? 410 : 520) + normal(r) * 45);
      const ph = Math.round((6.1 + normal(r) * 0.35) * 100) / 100;
      const yieldT = Math.round((2.6 + eff + (variety === 'Rockstar' ? 0.3 : 0) + (rain - 460) * 0.0035 + (block - 3.5) * 0.04 - Math.abs(ph - 6.3) * 0.4 + normal(r) * 0.32) * 100) / 100;
      const protein = Math.round((10.8 + eff * 1.3 - (yieldT - 3) * 0.4 + normal(r) * 0.5) * 10) / 10;
      rows.push([`P${String(plot++).padStart(3, '0')}`, site, block, t, variety, rain, ph, r() < 0.02 ? '' : yieldT, protein]);
    }
    return { name: 'wheat_field_trial_2025.xlsx', headers: ['plot_id', 'site', 'block', 'treatment', 'variety', 'rainfall_mm', 'soil_ph', 'yield_t_ha', 'protein_pct'], rows, blurb: 'Randomised field trial, 192 plots' };
  }

  E.SAMPLES = { retail, survey, trial };
  E.SAMPLE_META = [
    { key: 'retail', title: 'Retail sales', sub: '3,532 orders · 13 columns', kind: 'Business' },
    { key: 'survey', title: 'Student wellbeing survey', sub: 'Google Forms · 426 responses', kind: 'Survey' },
    { key: 'trial', title: 'Wheat field trial', sub: 'Research · 192 plots', kind: 'Research' },
  ];
  E.loadSample = function (key) {
    const s = E.SAMPLES[key]();
    const ds = E.makeDataset({ name: s.name, file: s.name, headers: s.headers, rows: s.rows, source: 'Sample: ' + s.blurb });
    ds.sample = true;
    ds.size = s.rows.reduce((a, r) => a + r.join(',').length + 1, 0);
    return ds;
  };
})();
