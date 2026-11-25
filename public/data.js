export const RATE_ID = '10276';
export const CV_ID = '10277';
export const TOTAL_AGE = '95253';
export const TOTAL_RACE = '95251';
const AGE_ORDER = ['95253', '41126', '99749', '47813', '31615', '2792', '100052', '108866'];

export function numericValue(raw) {
  if (typeof raw !== 'string' || !/^-?\d+(?:[.,]\d+)?$/.test(raw.trim())) return null;
  const number = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function validString(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1000;
}

export function validateVariables(payload) {
  if (!Array.isArray(payload) || payload.length > 100) throw new Error('Formato inesperado dos dados do IBGE.');
  for (const variable of payload) {
    if (!variable || !validString(variable.id) || !validString(variable.variavel) ||
      typeof variable.unidade !== 'string' || !Array.isArray(variable.resultados)) {
      throw new Error('Indicador inválido na resposta do IBGE.');
    }
    for (const result of variable.resultados) {
      if (!result || !Array.isArray(result.classificacoes) || !Array.isArray(result.series)) {
        throw new Error('Resultado inválido na resposta do IBGE.');
      }
      for (const classification of result.classificacoes) {
        if (!classification || !validString(classification.id) || !validString(classification.nome) ||
          !classification.categoria || typeof classification.categoria !== 'object' ||
          Array.isArray(classification.categoria) ||
          !Object.entries(classification.categoria).every(([id, name]) => validString(id) && validString(name))) {
          throw new Error('Classificação inválida na resposta do IBGE.');
        }
      }
      for (const series of result.series) {
        if (!series || !series.localidade || !validString(series.localidade.id) ||
          !validString(series.localidade.nome) || !series.serie || typeof series.serie !== 'object' ||
          Array.isArray(series.serie) ||
          !Object.entries(series.serie).every(([year, value]) => /^\d{4}$/.test(year) && typeof value === 'string' && value.length <= 100)) {
          throw new Error('Série inválida na resposta do IBGE.');
        }
      }
    }
  }
  return payload;
}

export function normalizeVariables(payload) {
  validateVariables(payload);
  const merged = new Map();
  const ages = new Map();
  const races = new Map();
  const years = new Set();
  for (const variable of payload) {
    if (![RATE_ID, CV_ID].includes(variable.id)) continue;
    if (variable.unidade !== '%') throw new Error('Unidade inesperada: esta tela espera indicadores percentuais.');
    for (const result of variable.resultados) {
      const age = result.classificacoes.find(item => item.id === '58');
      const race = result.classificacoes.find(item => item.id === '86');
      if (!age || !race || Object.keys(age.categoria).length !== 1 || Object.keys(race.categoria).length !== 1) {
        throw new Error('Recorte de população inesperado na resposta do IBGE.');
      }
      const [ageId, ageName] = Object.entries(age.categoria)[0];
      const [raceId, raceName] = Object.entries(race.categoria)[0];
      for (const series of result.series) {
        if (series.localidade.id !== '29') continue;
        ages.set(ageId, ageName);
        races.set(raceId, raceName);
        for (const [year, raw] of Object.entries(series.serie)) {
          years.add(year);
          const key = `${year}:${ageId}:${raceId}`;
          const record = merged.get(key) ?? { year, ageId, ageName, raceId, raceName, location: series.localidade.nome, rate: null, cv: null, rateRaw: null, cvRaw: null };
          if (variable.id === RATE_ID) Object.assign(record, { rateRaw: raw, rate: numericValue(raw) });
          if (variable.id === CV_ID) Object.assign(record, { cvRaw: raw, cv: numericValue(raw) });
          merged.set(key, record);
        }
      }
    }
  }
  return {
    records: [...merged.values()],
    ages: [...ages].sort(([a], [b]) => {
      const ai = AGE_ORDER.indexOf(a), bi = AGE_ORDER.indexOf(b);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
    }),
    races: [...races].sort(([a, an], [b, bn]) => a === TOTAL_RACE ? -1 : b === TOTAL_RACE ? 1 : an.localeCompare(bn, 'pt-BR')),
    years: [...years].sort()
  };
}

export function selectRecords(model, ageId, raceId, throughYear) {
  return model.records.filter(record => record.ageId === ageId && record.raceId === raceId && record.year <= throughYear)
    .sort((a, b) => a.year.localeCompare(b.year));
}

export function previousObservation(records, year) {
  return records.filter(record => record.year < year && record.rate !== null).at(-1) ?? null;
}

export function formatNumber(value, signed = false) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto'
  }).format(value);
}

export function formatRaw(value, raw) {
  return value === null || value === undefined ? (raw ?? '—') : formatNumber(value);
}

export function csvCell(value) {
  let text = String(value ?? '');
  // Impede que campos textuais sejam interpretados como fórmulas por planilhas.
  // O símbolo "-" do IBGE (valor nulo) sozinho não é fórmula e é preservado.
  if (/^[=+@\-\t\r]/.test(text) && text !== '-' && !/^-?\d+(?:[.,]\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records) {
  const header = ['Período', 'Localidade', 'Grupo de idade', 'Cor ou raça', 'Taxa de escolarização (%)', 'Coeficiente de variação (%)', 'Fonte'];
  const rows = records.map(r => [r.year, r.location, r.ageName, r.raceName,
    r.rate === null ? r.rateRaw : String(r.rate).replace('.', ','),
    r.cv === null ? r.cvRaw : String(r.cv).replace('.', ','), 'IBGE / SIDRA 7139']);
  return '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
}
