import { node, svgNode, setOptions } from './dom.js';
import { renderLineChart, niceScale } from './chart.js';
import { formatNumber } from './data.js';
import { normalizeGuanambi, previousValue, formatInteger, censoEscolarToCsv, MEASURES, STAGES } from './guanambi-data.js';

const $ = id => document.getElementById(id);
const CONTROLS = ['g-measure', 'g-year', 'g-export', 'g-literacy-sex', 'g-literacy-race'];
let model = null;
let loading = false;
let failedRefresh = false;
let stage = 'fundamental';
let literacyGroup = 'sex';
let currentRecords = [];
let currentPoints = [];

function percent(cell) {
  if (!cell) return '—';
  return cell.value === null ? (cell.raw ?? '—') : `${formatNumber(cell.value)}%`;
}

function measureRecords(measure) {
  return model.escolar.records.filter(record => record.measure === measure);
}

function renderStages(records, year, measure) {
  const { unit } = MEASURES[measure];
  const current = records.find(record => record.year === year);
  const fragment = document.createDocumentFragment();
  for (const [id, label] of STAGES) {
    const value = current?.values[id] ?? null;
    const previous = previousValue(records, id, year);
    const button = node('button', 'card stage-card');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === stage));
    button.append(node('span', 'stage-label', label));
    const valueNode = node('span', 'metric-value', value === null ? (current?.raws[id] ?? '—') : formatInteger(value));
    if (value !== null) valueNode.append(node('span', 'unit', unit));
    button.append(valueNode);
    let note = 'Sem ano anterior para comparar';
    if (value !== null && previous) {
      const diff = value - previous.values[id];
      const pct = previous.values[id] === 0 ? null : diff / previous.values[id] * 100;
      const signed = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' }).format(diff);
      note = `${signed}${pct === null ? '' : ` (${formatNumber(pct, true)}%)`} em relação a ${previous.year}`;
    }
    button.append(node('span', 'metric-note', note));
    button.addEventListener('click', () => { stage = id; render(); });
    fragment.append(button);
  }
  $('g-stages').replaceChildren(fragment);
}

function renderChart() {
  const measure = $('g-measure').value;
  const { label, unit } = MEASURES[measure];
  const stageLabel = STAGES.find(([id]) => id === stage)[1];
  const scale = niceScale(Math.max(0, ...currentPoints.map(point => point.value ?? 0)));
  renderLineChart($('g-chart'), currentPoints, {
    max: scale.max,
    ticks: scale.ticks,
    axisFormat: formatInteger,
    valueFormat: formatInteger,
    title: `${label} na ${stageLabel.toLowerCase()} em Guanambi`,
    scaleDescription: `Escala de zero a ${formatInteger(scale.max)} ${unit}.`,
    emptyMessage: 'Não há valores numéricos para desenhar o gráfico deste recorte.'
  });
}

function renderTable(records, year) {
  const fragment = document.createDocumentFragment();
  for (const record of [...records].reverse()) {
    const tr = node('tr', record.year === year ? 'latest-row' : '');
    const periodCell = node('td');
    const period = node('span', 'table-period', record.year);
    if (record.year === year) period.append(node('span', 'latest-label', 'SELECIONADO'));
    periodCell.append(period);
    tr.append(periodCell);
    for (const [id] of STAGES) {
      const value = record.values[id];
      tr.append(node('td', `numeric${id === stage ? ' rate-cell' : ''}`, value == null ? (record.raws[id] ?? '—') : formatInteger(value)));
    }
    fragment.append(tr);
  }
  if (!records.length) {
    const row = node('tr');
    const cell = node('td', '', 'Nenhum registro para este recorte.');
    cell.colSpan = STAGES.length + 1;
    row.append(cell);
    fragment.append(row);
  }
  $('g-table-body').replaceChildren(fragment);
  $('g-row-count').textContent = `${records.length} ${records.length === 1 ? 'ano' : 'anos'}`;
}

/** Barras pareadas Guanambi × Bahia em escala de 0 a 100%. */
function renderPairs(target, rows) {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const item = node('div', 'pair-row');
    item.append(node('span', 'pair-label', row.label));
    const bars = node('div', 'pair-bars');
    const values = node('div', 'pair-values');
    for (const [key, name] of [['guanambi', 'Guanambi'], ['bahia', 'Bahia']]) {
      const track = node('span', 'bar-track');
      const bar = svgNode('svg', { viewBox: '0 0 100 6', preserveAspectRatio: 'none', class: 'bar-svg', 'aria-hidden': 'true' });
      bar.append(svgNode('rect', { x: 0, y: 0, width: Math.max(0, Math.min(100, row[key]?.value ?? 0)), height: 6, rx: 3, class: `pair-fill-${key}` }));
      track.append(bar);
      bars.append(track);
      const value = node('span', `pair-value-${key}`);
      value.append(node('span', 'sr-only', `${name}: `), document.createTextNode(percent(row[key])));
      values.append(value);
    }
    item.append(bars, values);
    fragment.append(item);
  }
  if (!rows.length) fragment.append(node('p', 'chart-placeholder', 'O IBGE não retornou dados para este recorte.'));
  target.replaceChildren(fragment);
}

function renderCensus() {
  const { total, sex, race } = model.literacy;
  $('g-literacy-guanambi').textContent = percent(total?.guanambi);
  $('g-literacy-bahia').textContent = percent(total?.bahia);
  $('g-literacy-sex').setAttribute('aria-pressed', String(literacyGroup === 'sex'));
  $('g-literacy-race').setAttribute('aria-pressed', String(literacyGroup === 'race'));
  renderPairs($('g-literacy-bars'), literacyGroup === 'sex' ? sex : race);
  renderPairs($('g-attendance-bars'), model.attendance);
}

function render() {
  if (!model) return;
  const measure = $('g-measure').value, year = $('g-year').value;
  const { label } = MEASURES[measure];
  const stageLabel = STAGES.find(([id]) => id === stage)[1];
  const records = measureRecords(measure);
  currentRecords = records.filter(record => record.year <= year);
  currentPoints = currentRecords.map(record => ({ year: record.year, value: record.values[stage] ?? null }));
  renderStages(records, year, measure);
  $('g-chart-context').textContent = `${label} · ${stageLabel} · Guanambi`;
  $('g-chart-period').textContent = currentRecords.length ? `${currentRecords[0].year}–${year}` : year;
  $('g-table-context').textContent = `${label} por etapa · até ${year}`;
  renderChart();
  renderTable(currentRecords, year);
  renderCensus();
  $('g-export').disabled = loading || !currentRecords.length;
  const feedback = $('g-feedback');
  feedback.dataset.state = failedRefresh ? 'error' : 'success';
  feedback.textContent = failedRefresh
    ? 'A atualização falhou. Exibindo a última consulta carregada; tente atualizar novamente.'
    : `Consulta disponível · Censo Escolar ${year} · ${label.toLowerCase()} · Guanambi.`;
}

function setDisabled(disabled) {
  for (const id of CONTROLS) $(id).disabled = disabled;
}

export async function loadGuanambi() {
  if (loading) return;
  loading = true;
  failedRefresh = false;
  setDisabled(true);
  $('g-retry').disabled = true;
  $('g-error-panel').hidden = true;
  $('g-dashboard').hidden = false;
  $('g-dashboard').setAttribute('aria-busy', 'true');
  const feedback = $('g-feedback');
  feedback.dataset.state = 'loading';
  feedback.textContent = 'Consultando os dados de Guanambi…';
  try {
    const response = await fetch('/api/guanambi', { cache: 'no-cache', signal: AbortSignal.timeout(27000) });
    if (!response.ok) throw new Error('Não foi possível consultar os dados de Guanambi agora. Confira sua conexão e tente novamente em instantes.');
    const payload = await response.json();
    model = normalizeGuanambi(payload);
    const years = model.escolar.years;
    const latest = years.at(-1);
    setOptions($('g-year'), [...years].reverse().map(year => [year, year === latest ? `${year} · mais recente` : year]), $('g-year').value || latest);
    const fetchedAt = new Date(payload.fetchedAt);
    $('g-timestamp').textContent = Number.isFinite(fetchedAt.getTime())
      ? `Consulta às fontes: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(fetchedAt)} · cache de até 15 min.` : '';
  } catch (error) {
    if (!model) {
      $('g-dashboard').hidden = true;
      $('g-error-panel').hidden = false;
      $('g-error-message').textContent = error.name === 'TimeoutError' ? 'A consulta demorou mais que o esperado. Tente novamente em instantes.' : error.message;
    } else {
      failedRefresh = true;
    }
    feedback.dataset.state = 'error';
    feedback.textContent = 'Consulta de Guanambi indisponível no momento.';
  } finally {
    loading = false;
    $('g-retry').disabled = false;
    $('g-dashboard').setAttribute('aria-busy', 'false');
    setDisabled(!model);
    if (model) render();
  }
}

export function initGuanambi() {
  setOptions($('g-measure'), Object.entries(MEASURES).map(([id, { label }]) => [id, label]), 'matriculas');
  $('g-filters').addEventListener('submit', event => event.preventDefault());
  $('g-filters').addEventListener('change', render);
  $('g-retry').addEventListener('click', loadGuanambi);
  for (const group of ['sex', 'race']) {
    $(`g-literacy-${group}`).addEventListener('click', () => { literacyGroup = group; renderCensus(); });
  }
  $('g-export').addEventListener('click', () => {
    if (!currentRecords.length) return;
    const measure = $('g-measure').value;
    const blob = new Blob([censoEscolarToCsv([...currentRecords].reverse(), measure)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url;
    link.download = `guanambi-censo-escolar-${measure}-${$('g-year').value}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let chartWidth = 0;
  new ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    if (model && !$('g-dashboard').hidden && width > 0 && width !== chartWidth) {
      chartWidth = width;
      renderChart();
    }
  }).observe($('g-chart'));
  loadGuanambi();
}
