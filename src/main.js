import './style.css';

function $(sel) { return document.querySelector(sel); }

const fmtUSD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const fmtPct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function sumSeries(node, year) {
  if (node.series && node.series[String(year)] != null) return Number(node.series[String(year)]) || 0;
  if (!node.children?.length) return 0;
  return node.children.reduce((acc, c) => acc + sumSeries(c, year), 0);
}

function buildPath(node) {
  const out = [];
  let cur = node;
  while (cur) {
    out.push(cur.name);
    cur = cur.__parent || null;
  }
  return out.reverse();
}

function attachParents(node, parent=null) {
  node.__parent = parent;
  (node.children || []).forEach(c => attachParents(c, node));
}

function sortChildrenByYear(node, year) {
  if (!node.children?.length) return;
  node.children.sort((a,b) => sumSeries(b, year) - sumSeries(a, year));
  node.children.forEach(c => sortChildrenByYear(c, year));
}

function valuesByYear(node, years) {
  return years.map(y => ({ year: y, value: sumSeries(node, y) }));
}

function renderSparkline(points) {
  const w = 360;
  const h = 70;
  const padX = 6;
  const padY = 8;

  const xs = points.map((_, i) => i);
  const ys = points.map(p => p.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const x = (i) => {
    if (points.length === 1) return w / 2;
    return padX + (i / (points.length - 1)) * (w - padX*2);
  };
  const y = (v) => {
    if (maxY === minY) return h/2;
    const t = (v - minY) / (maxY - minY);
    return (h - padY) - t * (h - padY*2);
  };

  const d = points.map((p,i) => `${i===0?'M':'L'} ${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.classList.add('sparkSvg');

  // baseline
  const axis = document.createElementNS(svg.namespaceURI,'line');
  axis.setAttribute('x1','0');
  axis.setAttribute('x2', String(w));
  axis.setAttribute('y1', String(h - padY));
  axis.setAttribute('y2', String(h - padY));
  axis.classList.add('sparkAxis');
  svg.appendChild(axis);

  const path = document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d', d);
  path.classList.add('sparkLine');
  svg.appendChild(path);

  // last point dot
  const lastIdx = points.length - 1;
  const dot = document.createElementNS(svg.namespaceURI,'circle');
  dot.setAttribute('cx', x(lastIdx));
  dot.setAttribute('cy', y(points[lastIdx].value));
  dot.setAttribute('r', '3');
  dot.classList.add('sparkDot');
  svg.appendChild(dot);

  return svg;
}

function renderTree(root, year, { onSelect, selected }) {
  const ul = document.createElement('ul');
  ul.className = 'tree card';

  const kids = root.children || [];
  if (!kids.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'No subcategories.';
    ul.appendChild(div);
    return ul;
  }

  for (const child of kids) {
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'node';

    const left = document.createElement('div');
    left.className = 'left';

    const hasKids = (child.children || []).length > 0;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = hasKids ? 'Explore' : 'View';
    btn.addEventListener('click', () => onSelect(child));

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = child.name;

    if (selected && selected === child) {
      name.style.color = 'var(--accent)';
      name.style.fontWeight = '700';
    }

    left.appendChild(btn);
    left.appendChild(name);

    const amount = document.createElement('div');
    amount.className = 'amount';
    amount.textContent = fmtUSD.format(sumSeries(child, year));

    row.appendChild(left);
    row.appendChild(amount);

    li.appendChild(row);
    ul.appendChild(li);
  }

  return ul;
}

async function boot() {
  const data = await fetch('/south-bend-budget.sample.json').then(r => r.json());
  attachParents(data.root, null);

  const hasBreakdown = (node, y) => (node.children || []).some(c => sumSeries(c, y) > 0);

  // Default to the most recent year that actually has a breakdown (2024 is currently top-line only).
  let year = [...data.years].reverse().find(y => hasBreakdown(data.root, y)) ?? data.years[data.years.length - 1];
  let focus = data.root;

  function setFocus(node) {
    focus = node;
    rerender();
  }

  function setYear(y) {
    year = y;
    rerender();
  }

  function rerender() {
    sortChildrenByYear(data.root, year);

    const app = $('#app');
    app.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    const header = document.createElement('div');
    header.className = 'header';

    const hg = document.createElement('div');
    hg.className = 'hgroup';
    const h1 = document.createElement('h1');
    h1.textContent = `cityBudget — ${data.city}`;
    const p = document.createElement('p');
    p.textContent = 'Browse a hierarchical budget by year. (2022–2023 pulled from South Bend budget books; 2024 is a headline total until we extract the full book.)';
    hg.appendChild(h1);
    hg.appendChild(p);

    const controls = document.createElement('div');
    controls.className = 'controls';

    const yearCard = document.createElement('div');
    yearCard.className = 'card year';

    const yl = document.createElement('div');
    yl.className = 'pill';
    yl.textContent = `Year: ${year}`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(data.years.length - 1);
    slider.step = '1';
    slider.value = String(data.years.indexOf(year));
    slider.addEventListener('input', (e) => {
      const idx = Number(e.target.value);
      setYear(data.years[idx]);
    });

    yearCard.appendChild(yl);
    yearCard.appendChild(slider);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn';
    backBtn.textContent = 'Back';
    backBtn.disabled = focus === data.root;
    backBtn.addEventListener('click', () => {
      if (focus.__parent) setFocus(focus.__parent);
    });

    controls.appendChild(yearCard);
    controls.appendChild(backBtn);

    header.appendChild(hg);
    header.appendChild(controls);

    const kpis = document.createElement('div');
    kpis.className = 'kpis';

    const total = sumSeries(data.root, year);
    const focusTotal = sumSeries(focus, year);

    const k1 = document.createElement('div');
    k1.className = 'card kpi';
    k1.innerHTML = `<div class="label">Total budget (${year})</div><div class="value">${fmtUSD.format(total)}</div>`;

    const k2 = document.createElement('div');
    k2.className = 'card kpi';
    k2.innerHTML = `<div class="label">Current view</div><div class="value">${fmtUSD.format(focusTotal)}</div>`;

    kpis.appendChild(k1);
    kpis.appendChild(k2);

    const grid = document.createElement('div');
    grid.className = 'grid';

    const left = document.createElement('div');
    const title1 = document.createElement('div');
    title1.className = 'small';
    title1.textContent = 'Breakdown';
    left.appendChild(title1);

    if (!hasBreakdown(focus, year)) {
      const note = document.createElement('div');
      note.className = 'card';
      note.innerHTML = `<div class="small">No breakdown available for ${year} at this level yet.</div><div class="small">Try selecting an earlier year (or go Back).</div>`;
      left.appendChild(note);
    }

    left.appendChild(renderTree(focus, year, { onSelect: setFocus, selected: null }));

    const right = document.createElement('div');
    const title2 = document.createElement('div');
    title2.className = 'small';
    title2.textContent = 'Details';

    const det = document.createElement('div');
    det.className = 'card';
    const path = buildPath(focus).join(' → ');
    const pct = total ? (focusTotal / total) : 0;
    det.innerHTML = `
      <div class="small">Path</div>
      <div class="path">${path}</div>

      <div style="height:10px"></div>
      <div class="small">Value (${year})</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px">${fmtUSD.format(focusTotal)} <span style="font-size:12px;color:var(--muted);font-weight:600">(${fmtPct.format(pct)} of total)</span></div>

      <div class="sparkWrap" id="spark"></div>

      <div style="height:12px"></div>
      <div class="small">Source</div>
      <div class="small">${data.source?.name || '—'}</div>
      <div class="small">${data.source?.notes || ''}</div>
      <div style="height:8px"></div>
      <div class="small" id="sources"></div>
    `;

    const spark = det.querySelector('#spark');
    const pts = valuesByYear(focus, data.years);
    spark.appendChild(renderSparkline(pts));
    const cap = document.createElement('div');
    cap.className = 'small';
    cap.style.marginTop = '6px';
    cap.textContent = pts.map(p => `${p.year}: ${fmtUSD.format(p.value)}`).join(' · ');
    spark.appendChild(cap);

    const sources = det.querySelector('#sources');
    const urls = data.source?.urls || [];
    if (urls.length) {
      const ul = document.createElement('ul');
      ul.style.margin = '8px 0 0 16px';
      ul.style.padding = '0';
      ul.style.color = 'var(--muted)';
      ul.style.fontSize = '12px';
      for (const u of urls) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = u;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.textContent = u.replace(/^https?:\/\//,'');
        li.appendChild(a);
        ul.appendChild(li);
      }
      sources.appendChild(ul);
    }

    right.appendChild(title2);
    right.appendChild(det);

    grid.appendChild(left);
    grid.appendChild(right);

    wrap.appendChild(header);
    wrap.appendChild(kpis);
    wrap.appendChild(grid);

    app.appendChild(wrap);
  }

  rerender();
}

boot();
