import { validateVariables, numericValue, csvCell, TOTAL_AGE, TOTAL_RACE } from './data.js';

export const MUNICIPALITY_ID = '2911709';
export const BAHIA_ID = '29';
export const CENSUS_YEAR = '2022';
export const LITERACY_ID = '2513';
export const ATTENDANCE_ID = '3795';
export const TOTAL_SEX = '6794';

export const STAGES = [
  ['infantil', 'Educação infantil'],
  ['fundamental', 'Ensino fundamental'],
  ['medio', 'Ensino médio']
];

/** Indicadores do Censo Escolar (INEP) na API de pesquisas do IBGE Cidades (pesquisa 13). */
export const MEASURES = {
  matriculas: { label: 'Matrículas', unit: 'matrículas', ids: { infantil: '77881', fundamental: '5908', medio: '5913' } },
  docentes: { label: 'Docentes', unit: 'docentes', ids: { infantil: '77887', fundamental: '5929', medio: '5934' } },
  escolas: { label: 'Escolas', unit: 'escolas', ids: { infantil: '77893', fundamental: '5950', medio: '5955' } }
};

const INDICATORS = new Map(Object.entries(MEASURES).flatMap(([measure, { ids }]) =>
  Object.entries(ids).map(([stage, id]) => [id, { measure, stage }])));
const LOCALITIES = ['291170', MUNICIPALITY_ID];

/** Agrupa os indicadores por ano e medida: { year, measure, values: { etapa: número|null }, raws }. */
export function normalizeCensoEscolar(indicators) {
  if (!Array.isArray(indicators) || indicators.length > INDICATORS.size) {
    throw new Error('Formato inesperado dos dados do Censo Escolar.');
  }
  const records = new Map();
  const years = new Set();
  for (const indicator of indicators) {
    const target = INDICATORS.get(String(indicator?.id));
    if (!target || !Array.isArray(indicator.res)) throw new Error('Indicador inesperado na resposta do Censo Escolar.');
    for (const result of indicator.res) {
      if (!result || !LOCALITIES.includes(result.localidade) || !result.res ||
        typeof result.res !== 'object' || Array.isArray(result.res)) {
        throw new Error('Resultado inválido na resposta do Censo Escolar.');
      }
      for (const [year, raw] of Object.entries(result.res)) {
        if (!/^\d{4}$/.test(year) || (raw !== null && (typeof raw !== 'string' || raw.length > 100))) {
          throw new Error('Série inválida na resposta do Censo Escolar.');
        }
        years.add(year);
        const key = `${year}:${target.measure}`;
        const record = records.get(key) ?? { year, measure: target.measure, values: {}, raws: {} };
        record.values[target.stage] = numericValue(raw);
        record.raws[target.stage] = raw;
        records.set(key, record);
      }
    }
  }
  return {
    years: [...years].sort(),
    records: [...records.values()].sort((a, b) => a.year.localeCompare(b.year))
  };
}

/** Último valor numérico anterior ao ano escolhido, para a etapa informada. */
export function previousValue(records, stage, year) {
  return records.filter(record => record.year < year && record.values[stage] != null).at(-1) ?? null;
}

/**
 * Monta linhas Guanambi × Bahia de uma tabela do Censo 2022, agrupadas pela classificação `groupClass`.
 * `fixed` mantém apenas resultados com as categorias indicadas, por exemplo { '86': TOTAL_RACE }.
 */
export function comparisonRows(variables, variableId, groupClass, fixed = {}) {
  validateVariables(variables);
  const rows = new Map();
  for (const variable of variables) {
    if (variable.id !== variableId) continue;
    if (variable.unidade !== '%') throw new Error('Unidade inesperada: o Censo 2022 deveria retornar percentuais.');
    for (const result of variable.resultados) {
      if (result.classificacoes.some(item => Object.keys(item.categoria).length !== 1)) {
        throw new Error('Recorte inesperado na resposta do Censo 2022.');
      }
      const categories = Object.fromEntries(result.classificacoes.map(item => [item.id, Object.entries(item.categoria)[0]]));
      if (!categories[groupClass] || Object.keys(fixed).some(classId => !categories[classId])) {
        throw new Error('Recorte inesperado na resposta do Censo 2022.');
      }
      if (Object.entries(fixed).some(([classId, categoryId]) => categories[classId]?.[0] !== categoryId)) continue;
      const [id, label] = categories[groupClass];
      const row = rows.get(id) ?? { id, label, guanambi: null, bahia: null };
      for (const series of result.series) {
        const raw = series.serie[CENSUS_YEAR] ?? null;
        const cell = { value: numericValue(raw), raw };
        if (series.localidade.id === MUNICIPALITY_ID) row.guanambi = cell;
        if (series.localidade.id === BAHIA_ID) row.bahia = cell;
      }
      rows.set(id, row);
    }
  }
  return [...rows.values()];
}

function splitTotal(rows, totalId) {
  return { total: rows.find(row => row.id === totalId) ?? null, rows: rows.filter(row => row.id !== totalId) };
}

export function normalizeGuanambi(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Formato inesperado dos dados de Guanambi.');
  }
  const bySex = splitTotal(comparisonRows(payload.alfabetizacao, LITERACY_ID, '2', { 86: TOTAL_RACE }), TOTAL_SEX);
  const byRace = splitTotal(comparisonRows(payload.alfabetizacao, LITERACY_ID, '86', { 2: TOTAL_SEX }), TOTAL_RACE);
  const attendance = splitTotal(comparisonRows(payload.frequenciaEscolar, ATTENDANCE_ID, '58', { 2: TOTAL_SEX, 86: TOTAL_RACE }), TOTAL_AGE);
  return {
    escolar: normalizeCensoEscolar(payload.censoEscolar),
    literacy: { total: bySex.total ?? byRace.total, sex: bySex.rows, race: byRace.rows },
    attendance: attendance.rows
  };
}

export function formatInteger(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

export function censoEscolarToCsv(records, measure) {
  const header = ['Ano', 'Município', 'Indicador', ...STAGES.map(([, label]) => label), 'Fonte'];
  const rows = records.map(record => [record.year, 'Guanambi (BA)', MEASURES[measure].label,
    ...STAGES.map(([stage]) => record.values[stage] ?? record.raws[stage] ?? ''),
    'INEP · Censo Escolar, via IBGE Cidades']);
  return '﻿' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
}
