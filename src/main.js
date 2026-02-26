import './style.css';

function $(sel) { return document.querySelector(sel); }

const fmtUSD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
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

  let year = data.years[data.years.length - 1];
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
    p.textContent = 'First draft: browse a hierarchical budget by year. (Sample data for UI.)';
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
    left.appendChild(renderTree(focus, year, { onSelect: setFocus, selected: null }));

    const right = document.createElement('div');
    const title2 = document.createElement('div');
    title2.className = 'small';
    title2.textContent = 'Details';

    const det = document.createElement('div');
    det.className = 'card';
    const path = buildPath(focus).join(' → ');
    det.innerHTML = `
      <div class="small">Path</div>
      <div class="path">${path}</div>
      <div style="height:10px"></div>
      <div class="small">Value (${year})</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px">${fmtUSD.format(focusTotal)}</div>
      <div style="height:12px"></div>
      <div class="small">Source</div>
      <div class="small">${data.source?.name || '—'} — ${data.source?.notes || ''}</div>
    `;

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
