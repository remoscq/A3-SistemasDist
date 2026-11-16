import { normalizeVariables, TOTAL_AGE, TOTAL_RACE, selectRecords, previousObservation, formatNumber, formatRaw, recordsToCsv } from './data.js';

const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['period', 'age', 'race', 'refresh', 'export', 'reset', 'feedback', 'dashboard', 'error-panel', 'empty-panel'].map(id => [id, $(id)]));
let model = null;
let loading = false;
let currentRows = [];
let failedRefresh = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setOptions(select, options, selected) {
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  select.value = options.some(([value]) => value === selected) ? selected : options[0]?.[0] ?? '';
}

function metric(id, value, unit) {
  const target = $(id);
  target.replaceChildren(document.createTextNode(value));
  if (value !== '—') target.append(node('span', 'unit', unit));
}

function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderChart(records) {
  const observations = records.filter(row => row.rate !== null);
  const target = $('chart');
  if (!observations.length) {
    target.replaceChildren(node('p', 'chart-placeholder', 'Não há valores numéricos para desenhar o gráfico deste recorte.'));
    return;
  }
  const firstYear = Number(records[0].year), lastYear = Number(records.at(-1).year);
  const width = Math.max(280, target.clientWidth), height = 250;
  const plot = { left: 35, right: width - 25, top: 30, bottom: 212 };
  const x = year => firstYear === lastYear ? (plot.left + plot.right) / 2 : plot.left + (Number(year) - firstYear) / (lastYear - firstYear) * (plot.right - plot.left);
  const y = value => plot.bottom - value / 100 * (plot.bottom - plot.top);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-labelledby': 'chart-svg-title chart-svg-description' });
  svg.append(svgNode('title', { id: 'chart-svg-title' }, 'Evolução da taxa de escolarização na Bahia'));
  svg.append(svgNode('desc', { id: 'chart-svg-description' }, 'Escala de zero a cem por cento. ' + observations.map(row => `${row.year}: ${formatNumber(row.rate)}%`).join('; ') + '. Valores completos na tabela abaixo.'));
  for (const value of [0, 25, 50, 75, 100]) {
    svg.append(svgNode('line', { x1: plot.left, x2: plot.right, y1: y(value), y2: y(value), class: 'chart-grid' }));
    svg.append(svgNode('text', { x: plot.left - 13, y: y(value) + 3, 'text-anchor': 'end', class: 'chart-axis' }, `${value}`));
  }
  const last = observations.at(-1);
  svg.append(svgNode('line', { x1: x(last.year), x2: x(last.year), y1: plot.top, y2: plot.bottom, class: 'chart-highlight' }));
  // Não conecta nem interpola anos não disponíveis ou valores não numéricos.
  let previous = null;
  for (const record of records) {
    if (record.rate !== null && previous?.rate !== null && previous && Number(record.year) - Number(previous.year) === 1) {
      svg.append(svgNode('line', { x1: x(previous.year), y1: y(previous.rate), x2: x(record.year), y2: y(record.rate), class: 'chart-line' }));
    }
    previous = record;
  }
  const labelStep = Math.max(1, Math.ceil(42 / ((plot.right - plot.left) / Math.max(1, lastYear - firstYear))));
  for (let year = firstYear; year <= lastYear; year++) {
    if (year === firstYear || year === lastYear || ((year - firstYear) % labelStep === 0 && lastYear - year >= labelStep)) {
      svg.append(svgNode('text', { x: x(year), y: plot.bottom + 23, 'text-anchor': 'middle', class: 'chart-axis' }, `${year}`));
    }
  }
  for (const record of observations) {
    const circle = svgNode('circle', { cx: x(record.year), cy: y(record.rate), r: record === last ? 5.5 : 3.5, class: record === last ? 'chart-dot-latest' : 'chart-dot' });
    circle.append(svgNode('title', {}, `${record.year}: ${formatNumber(record.rate)}%`));
    svg.append(circle);
  }
  svg.append(svgNode('text', { x: x(last.year), y: y(last.rate) - 14, 'text-anchor': 'middle', class: 'chart-value' }, `${formatNumber(last.rate)}%`));
  target.replaceChildren(svg);
}

function renderBreakdown(year, raceId, ageId) {
  const fragment = document.createDocumentFragment();
  for (const [id, label] of model.ages) {
    if (id === TOTAL_AGE) continue;
    const record = model.records.find(row => row.year === year && row.raceId === raceId && row.ageId === id);
    const button = node('button', 'breakdown-item');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === ageId));
    const value = record ? formatRaw(record.rate, record.rateRaw) : '—';
    button.setAttribute('aria-label', `${label}: ${value}${record?.rate !== null && record ? '%' : ''}. Filtrar por este grupo.`);
    button.append(node('span', 'breakdown-label', label));
    const track = node('span', 'bar-track');
    const bar = svgNode('svg', { viewBox: '0 0 100 6', preserveAspectRatio: 'none', class: 'bar-svg', 'aria-hidden': 'true' });
    bar.append(svgNode('rect', { x: 0, y: 0, width: Math.max(0, Math.min(100, record?.rate ?? 0)), height: 6, rx: 3, class: 'bar-fill' }));
    track.append(bar);
    button.append(track, node('span', 'breakdown-value', `${value}${record && record.rate !== null ? '%' : ''}`));
    button.addEventListener('click', () => { elements.age.value = id; render(); });
    fragment.append(button);
  }
  if (!fragment.childNodes.length) fragment.append(node('p', 'chart-placeholder', 'Sem recortes por idade disponíveis.'));
  $('breakdown').replaceChildren(fragment);
}

function renderTable(records, year) {
  const fragment = document.createDocumentFragment();
  for (const record of [...records].reverse()) {
    const tr = node('tr', record.year === year ? 'latest-row' : '');
    const periodCell = node('td');
    const period = node('span', 'table-period', record.year);
    if (record.year === year) period.append(node('span', 'latest-label', 'SELECIONADO'));
    periodCell.append(period);
    tr.append(periodCell, node('td', '', record.location), node('td', '', record.ageName), node('td', '', record.raceName),
      node('td', 'numeric rate-cell', formatRaw(record.rate, record.rateRaw)), node('td', 'numeric', formatRaw(record.cv, record.cvRaw)));
    fragment.append(tr);
  }
  if (!records.length) {
    const row = node('tr');
    const cell = node('td', '', 'Nenhum registro para este recorte.');
    cell.colSpan = 6;
    row.append(cell);
    fragment.append(row);
  }
  $('table-body').replaceChildren(fragment);
  $('row-count').textContent = `${records.length} ${records.length === 1 ? 'registro' : 'registros'}`;
}

function render() {
  if (!model) return;
  const year = elements.period.value, ageId = elements.age.value, raceId = elements.race.value;
  const ageName = model.ages.find(([id]) => id === ageId)?.[1] ?? '';
  const raceName = model.races.find(([id]) => id === raceId)?.[1] ?? '';
  const records = selectRecords(model, ageId, raceId, year);
  currentRows = records;
  const current = records.find(record => record.year === year);
  const previous = previousObservation(records, year);
  metric('rate-value', formatNumber(current?.rate), '%');
  $('rate-note').textContent = `${ageName === 'Total' ? 'Todas as idades' : ageName} · ${year}`;
  metric('cv-value', formatNumber(current?.cv), '%');
  const change = current?.rate !== null && current?.rate !== undefined && previous ? current.rate - previous.rate : null;
  metric('change-value', formatNumber(change, true), 'p.p.');
  $('change-note').textContent = change === null ? 'Sem observação anterior para comparar' : `${previous.year} → ${year} · diferença em pontos percentuais`;
  $('chart-context').textContent = `${ageName === 'Total' ? 'Todas as idades' : ageName} · Cor ou raça: ${raceName.toLowerCase()} · Bahia`;
  $('chart-period').textContent = records.length ? `${records[0].year}–${year}` : year;
  $('breakdown-context').textContent = `${year} · Cor ou raça: ${raceName.toLowerCase()} · em %`;
  $('table-context').textContent = `${ageName === 'Total' ? 'Todas as idades' : ageName} · Cor ou raça: ${raceName.toLowerCase()} · até ${year}`;
  renderChart(records);
  renderBreakdown(year, raceId, ageId);
  renderTable(records, year);
  elements.export.disabled = loading || !records.length;
  elements.feedback.dataset.state = failedRefresh ? 'error' : 'success';
  elements.feedback.textContent = failedRefresh
    ? 'A atualização falhou. Exibindo a última consulta carregada; tente atualizar novamente.'
    : current?.rate === null || !current ? 'O IBGE não disponibilizou um valor numérico para o período e recorte selecionados.'
      : `Consulta disponível · período ${year} · Bahia · filtros aplicados aos indicadores e à série histórica.`;
}

async function load() {
  if (loading) return;
  loading = true;
  failedRefresh = false;
  elements.refresh.disabled = true;
  elements.refresh.classList.add('loading');
  elements.export.disabled = true;
  for (const id of ['period', 'age', 'race', 'reset']) elements[id].disabled = true;
  $('retry').disabled = true;
  elements['error-panel'].hidden = true;
  elements['empty-panel'].hidden = true;
  elements.dashboard.hidden = false;
  elements.dashboard.setAttribute('aria-busy', 'true');
  elements.feedback.dataset.state = 'loading';
  elements.feedback.textContent = 'Consultando os dados do IBGE…';
  try {
    const response = await fetch('/api/indicadores', { cache: 'no-cache', signal: AbortSignal.timeout(27000) });
    if (!response.ok) throw new Error('Não foi possível consultar o IBGE agora. Confira sua conexão e tente novamente em instantes.');
    const payload = await response.json();
    const nextModel = normalizeVariables(payload.variables);
    if (!nextModel.records.length) {
      model = null;
      currentRows = [];
      elements.dashboard.hidden = true;
      elements['empty-panel'].hidden = false;
      elements.feedback.textContent = 'Consulta concluída sem observações disponíveis.';
      elements.feedback.dataset.state = 'success';
      return;
    }
    model = nextModel;
    const latestYear = model.years.at(-1);
    setOptions(elements.period, [...model.years].reverse().map(year => [year, year === latestYear ? `${year} · mais recente` : year]), elements.period.value || latestYear);
    setOptions(elements.age, model.ages.map(([id, name]) => [id, id === TOTAL_AGE ? 'Todas as idades' : name]), elements.age.value || TOTAL_AGE);
    setOptions(elements.race, model.races.map(([id, name]) => [id, id === TOTAL_RACE ? 'Todas as cores ou raças' : name]), elements.race.value || TOTAL_RACE);
    const fetchedAt = new Date(payload.fetchedAt);
    $('timestamp').textContent = Number.isFinite(fetchedAt.getTime())
      ? `Consulta à fonte: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(fetchedAt)} · cache de até 15 min.` : '';
  } catch (error) {
    if (!model) {
      elements.dashboard.hidden = true;
      elements['error-panel'].hidden = false;
      $('error-message').textContent = error.name === 'TimeoutError' ? 'A consulta demorou mais que o esperado. Tente novamente em instantes.' : error.message;
    } else {
      failedRefresh = true;
    }
    elements.feedback.dataset.state = 'error';
    elements.feedback.textContent = 'Consulta indisponível no momento.';
  } finally {
    loading = false;
    elements.refresh.disabled = false;
    elements.refresh.classList.remove('loading');
    $('retry').disabled = false;
    elements.dashboard.setAttribute('aria-busy', 'false');
    for (const id of ['period', 'age', 'race', 'reset']) elements[id].disabled = !model;
    if (model) render();
  }
}

$('filters').addEventListener('submit', event => event.preventDefault());
$('filters').addEventListener('change', render);
$('filters').addEventListener('reset', event => {
  event.preventDefault();
  if (!model) return;
  elements.period.value = model.years.at(-1);
  elements.age.value = model.ages.some(([id]) => id === TOTAL_AGE) ? TOTAL_AGE : model.ages[0][0];
  elements.race.value = model.races.some(([id]) => id === TOTAL_RACE) ? TOTAL_RACE : model.races[0][0];
  render();
});
elements.refresh.addEventListener('click', load);
$('retry').addEventListener('click', load);
elements.export.addEventListener('click', () => {
  if (!currentRows.length) return;
  const blob = new Blob([recordsToCsv([...currentRows].reverse())], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = node('a');
  link.href = url;
  link.download = `bahia-educacao-${elements.period.value}-${elements.age.value}-${elements.race.value}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

let chartWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width);
  if (model && !elements.dashboard.hidden && width > 0 && width !== chartWidth) {
    chartWidth = width;
    renderChart(currentRows);
  }
}).observe($('chart'));

load();
