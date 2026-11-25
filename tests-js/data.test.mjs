import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVariables, numericValue, selectRecords, previousObservation, recordsToCsv, formatNumber } from '../public/data.js';

function fixture() {
  return [
    { id: '10276', variavel: 'Taxa de escolarização', unidade: '%', resultados: [
      { classificacoes: [
        { id: '58', nome: 'Grupo de idade', categoria: { '95253': 'Total' } },
        { id: '86', nome: 'Cor ou raça', categoria: { '95251': 'Total' } }
      ], series: [{ localidade: { id: '29', nome: 'Bahia' }, serie: { '2019': '0.0', '2022': '20.0', '2023': '...', '2024': '25.0' } }] }
    ] },
    { id: '10277', variavel: 'Coeficiente de variação', unidade: '%', resultados: [
      { classificacoes: [
        { id: '58', nome: 'Grupo de idade', categoria: { '95253': 'Total' } },
        { id: '86', nome: 'Cor ou raça', categoria: { '95251': 'Total' } }
      ], series: [{ localidade: { id: '29', nome: 'Bahia' }, serie: { '2019': '1.0', '2022': '1.5', '2023': '...', '2024': '1.2' } }] }
    ] }
  ];
}

test('converte números e preserva zero; símbolos não viram números', () => {
  assert.equal(numericValue('0.0'), 0);
  assert.equal(numericValue('27.6'), 27.6);
  assert.equal(numericValue('27,6'), 27.6);
  for (const symbol of ['...', '..', 'X', '-', '', 'Infinity', '23abc']) assert.equal(numericValue(symbol), null);
});

test('une taxa e coeficiente por recorte e período, sem preencher anos ausentes', () => {
  const model = normalizeVariables(fixture());
  assert.deepEqual(model.years, ['2019', '2022', '2023', '2024']);
  assert.equal(model.records.length, 4);
  assert.equal(model.records[0].rate, 0);
  assert.equal(model.records.at(-1).cv, 1.2);
  assert.equal(model.records[2].rateRaw, '...');
  assert.equal(model.records[2].rate, null);
});

test('filtra o histórico até o período escolhido e encontra observação anterior válida', () => {
  const records = selectRecords(normalizeVariables(fixture()), '95253', '95251', '2024');
  assert.equal(previousObservation(records, '2024').year, '2022');
  assert.equal(previousObservation(records, '2019'), null);
  assert.equal(selectRecords(normalizeVariables(fixture()), '95253', '95251', '2022').length, 2);
  assert.equal(selectRecords(normalizeVariables(fixture()), 'outra', '95251', '2024').length, 0);
});

test('rejeita resposta malformada, recortes ausentes e unidade inesperada', () => {
  assert.throws(() => normalizeVariables({ message: 'Erro no IBGE' }));
  const missing = fixture();
  missing[0].resultados[0].classificacoes = [];
  assert.throws(() => normalizeVariables(missing), /Recorte/);
  const invalid = fixture();
  invalid[0].resultados[0].series[0].serie['2024'] = {};
  assert.throws(() => normalizeVariables(invalid), /Série/);
  const units = fixture();
  units[0].unidade = 'Pessoas';
  assert.throws(() => normalizeVariables(units), /Unidade/);
});

test('não inclui dados de outra UF', () => {
  const data = fixture();
  for (const variable of data) variable.resultados[0].series[0].localidade.id = '35';
  assert.equal(normalizeVariables(data).records.length, 0);
});

test('exporta CSV compatível com planilhas, preserva símbolos e neutraliza fórmulas', () => {
  const model = normalizeVariables(fixture());
  const csv = recordsToCsv(model.records);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"25";"1,2"'));
  assert.ok(csv.includes('"...";"..."'));
  assert.ok(csv.includes('"0";"1"'));
  const dangerous = { ...model.records[0], location: '=HYPERLINK("exemplo")' };
  assert.ok(recordsToCsv([dangerous]).includes('"\'=HYPERLINK(""exemplo"")"'));
});

test('formata valores em pt-BR e diferenças com sinal', () => {
  assert.equal(formatNumber(27.6), '27,6');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(0), '0,0');
  assert.equal(formatNumber(0.1, true), '+0,1');
});

