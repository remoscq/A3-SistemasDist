import { node, svgNode } from './dom.js';

/**
 * Escala "redonda" a partir de zero para contagens: a menor combinação de 4 ou 5 divisões
 * com passo inteiro de 1, 2, 2,5, 4 ou 5 × 10ⁿ que comporte o maior valor com 10% de folga.
 */
export function niceScale(maxValue) {
  const target = maxValue > 0 ? maxValue * 1.1 : 4;
  const magnitude = 10 ** Math.floor(Math.log10(target / 5));
  const best = [1, 2, 2.5, 4, 5, 10]
    .flatMap(factor => [4, 5].map(steps => ({ step: Math.max(1, factor * magnitude), steps })))
    .filter(({ step, steps }) => Number.isInteger(step) && step * steps >= target)
    .sort((a, b) => a.step * a.steps - b.step * b.steps || a.steps - b.steps)[0];
  return { max: best.step * best.steps, ticks: Array.from({ length: best.steps + 1 }, (_, i) => i * best.step) };
}

/**
 * Desenha uma série anual em SVG. `points` deve estar ordenado por ano e pode conter `value: null`;
 * anos sem valor numérico aparecem como lacunas e nunca são interpolados.
 */
export function renderLineChart(target, points, { max, ticks, axisFormat, valueFormat, title, scaleDescription, emptyMessage }) {
  const observations = points.filter(point => point.value !== null);
  if (!observations.length) {
    target.replaceChildren(node('p', 'chart-placeholder', emptyMessage));
    return;
  }
  const idPrefix = `${target.id}-svg`;
  const firstYear = Number(points[0].year), lastYear = Number(points.at(-1).year);
  const longestTick = Math.max(...ticks.map(value => axisFormat(value).length));
  const width = Math.max(280, target.clientWidth), height = 250;
  const plot = { left: Math.max(35, 13 + longestTick * 7), right: width - 25, top: 30, bottom: 212 };
  const x = year => firstYear === lastYear ? (plot.left + plot.right) / 2 : plot.left + (Number(year) - firstYear) / (lastYear - firstYear) * (plot.right - plot.left);
  const y = value => plot.bottom - value / max * (plot.bottom - plot.top);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-labelledby': `${idPrefix}-title ${idPrefix}-description` });
  svg.append(svgNode('title', { id: `${idPrefix}-title` }, title));
  svg.append(svgNode('desc', { id: `${idPrefix}-description` }, `${scaleDescription} ` + observations.map(point => `${point.year}: ${valueFormat(point.value)}`).join('; ') + '. Valores completos na tabela.'));
  for (const value of ticks) {
    svg.append(svgNode('line', { x1: plot.left, x2: plot.right, y1: y(value), y2: y(value), class: 'chart-grid' }));
    svg.append(svgNode('text', { x: plot.left - 13, y: y(value) + 3, 'text-anchor': 'end', class: 'chart-axis' }, axisFormat(value)));
  }
  const last = observations.at(-1);
  svg.append(svgNode('line', { x1: x(last.year), x2: x(last.year), y1: plot.top, y2: plot.bottom, class: 'chart-highlight' }));
  // Conecta apenas anos consecutivos com valores numéricos.
  let previous = null;
  for (const point of points) {
    if (point.value !== null && previous && previous.value !== null && Number(point.year) - Number(previous.year) === 1) {
      svg.append(svgNode('line', { x1: x(previous.year), y1: y(previous.value), x2: x(point.year), y2: y(point.value), class: 'chart-line' }));
    }
    previous = point;
  }
  const labelStep = Math.max(1, Math.ceil(42 / ((plot.right - plot.left) / Math.max(1, lastYear - firstYear))));
  for (let year = firstYear; year <= lastYear; year++) {
    if (year === firstYear || year === lastYear || ((year - firstYear) % labelStep === 0 && lastYear - year >= labelStep)) {
      svg.append(svgNode('text', { x: x(year), y: plot.bottom + 23, 'text-anchor': 'middle', class: 'chart-axis' }, `${year}`));
    }
  }
  for (const point of observations) {
    const circle = svgNode('circle', { cx: x(point.year), cy: y(point.value), r: point === last ? 5.5 : 3.5, class: point === last ? 'chart-dot-latest' : 'chart-dot' });
    circle.append(svgNode('title', {}, `${point.year}: ${valueFormat(point.value)}`));
    svg.append(circle);
  }
  svg.append(svgNode('text', { x: x(last.year), y: y(last.value) - 14, 'text-anchor': 'middle', class: 'chart-value' }, valueFormat(last.value)));
  target.replaceChildren(svg);
}
