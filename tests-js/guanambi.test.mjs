import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGuanambi, normalizeCensoEscolar, previousValue, censoEscolarToCsv, formatInteger } from '../public/guanambi-data.js';
import { niceScale } from '../public/chart.js';
import { fixture, series } from './guanambi-fixture.mjs';


test('agrupa o Censo Escolar por ano e indicador, preservando símbolos e valores ausentes', () => {
  const { years, records } = normalizeCensoEscolar(fixture().censoEscolar);
  assert.deepEqual(years, ['2023', '2024', '2025']);
  const matriculas2024 = records.find(r => r.year === '2024' && r.measure === 'matriculas');
  assert.equal(matriculas2024.values.fundamental, 11552);
  assert.equal(matriculas2024.values.medio, null);
  assert.equal(matriculas2024.raws.medio, '-');
  const escolas2025 = records.find(r => r.year === '2025' && r.measure === 'escolas');
  assert.equal(escolas2025.values.fundamental, null);
  assert.equal(escolas2025.raws.fundamental, null);
});

test('encontra o último ano anterior com valor numérico para a etapa', () => {
  const records = normalizeCensoEscolar(fixture().censoEscolar).records.filter(r => r.measure === 'matriculas');
  assert.equal(previousValue(records, 'fundamental', '2025').year, '2024');
  assert.equal(previousValue(records, 'medio', '2025').year, '2023');
  assert.equal(previousValue(records, 'medio', '2023'), null);
});

test('rejeita indicadores, municípios e séries inesperados no Censo Escolar', () => {
  assert.throws(() => normalizeCensoEscolar({}), /Formato/);
  assert.throws(() => normalizeCensoEscolar([{ id: 99999, res: series({ 2025: '1' }) }]), /Indicador/);
  assert.throws(() => normalizeCensoEscolar([{ id: 5908, res: series({ 2025: '1' }, '292740') }]), /Resultado/);
  assert.throws(() => normalizeCensoEscolar([{ id: 5908, res: series({ ano: '1' }) }]), /Série/);
  assert.throws(() => normalizeCensoEscolar([{ id: 5908, res: series({ 2025: 12 }) }]), /Série/);
});

test('monta comparações Guanambi × Bahia do Censo 2022 sem misturar recortes', () => {
  const model = normalizeGuanambi(fixture());
  assert.equal(model.literacy.total.guanambi.value, 88.16);
  assert.equal(model.literacy.total.bahia.value, 87.4);
  assert.deepEqual(model.literacy.sex.map(r => r.label), ['Homens', 'Mulheres']);
  // "Homens pretos" não entra no recorte por sexo nem no recorte por cor ou raça.
  assert.deepEqual(model.literacy.race.map(r => [r.label, r.guanambi.value]), [['Preta', 82.19]]);
  assert.deepEqual(model.attendance.map(r => r.label), ['6 a 14 anos', '15 a 17 anos']);
  assert.equal(model.attendance[1].guanambi.value, null);
  assert.equal(model.attendance[1].guanambi.raw, '...');
});

test('rejeita unidade ou recorte inesperado no Censo 2022', () => {
  const units = fixture();
  units.alfabetizacao[0].unidade = 'Pessoas';
  assert.throws(() => normalizeGuanambi(units), /Unidade/);
  const missing = fixture();
  missing.frequenciaEscolar[0].resultados[0].classificacoes = missing.frequenciaEscolar[0].resultados[0].classificacoes.filter(item => item.id !== '86');
  assert.throws(() => normalizeGuanambi(missing), /Recorte/);
  assert.throws(() => normalizeGuanambi(null), /Formato/);
});

test('exporta o Censo Escolar em CSV com etapas em colunas', () => {
  const records = normalizeCensoEscolar(fixture().censoEscolar).records.filter(r => r.measure === 'matriculas');
  const csv = censoEscolarToCsv(records, 'matriculas');
  assert.ok(csv.startsWith('﻿"Ano";"Município";"Indicador";"Educação infantil";"Ensino fundamental";"Ensino médio";"Fonte"'));
  assert.ok(csv.includes('"2024";"Guanambi (BA)";"Matrículas";"";"11552";"-";'));
});

test('formata contagens e gera escalas inteiras para o gráfico', () => {
  assert.equal(formatInteger(11515), '11.515');
  assert.equal(formatInteger(null), '—');
  assert.deepEqual(niceScale(13451), { max: 16000, ticks: [0, 4000, 8000, 12000, 16000] });
  assert.deepEqual(niceScale(11), { max: 16, ticks: [0, 4, 8, 12, 16] });
  assert.deepEqual(niceScale(3800), { max: 5000, ticks: [0, 1000, 2000, 3000, 4000, 5000] });
  assert.deepEqual(niceScale(2), { max: 4, ticks: [0, 1, 2, 3, 4] });
  assert.deepEqual(niceScale(0), { max: 4, ticks: [0, 1, 2, 3, 4] });
});
