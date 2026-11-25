/** Resposta de exemplo de GET /api/guanambi, com valores reais de Guanambi e da Bahia. */
export const series = (values, localidade = '291170') => [{ localidade, res: values, notas: {} }];

function percentVariable(id, rows) {
  return [{ id, variavel: 'Taxa', unidade: '%', resultados: rows.map(([classificacoes, guanambi, bahia]) => ({
    classificacoes: Object.entries(classificacoes).map(([classId, [catId, name]]) => ({ id: classId, nome: classId, categoria: { [catId]: name } })),
    series: [
      { localidade: { id: '2911709', nome: 'Guanambi (BA)' }, serie: { 2022: guanambi } },
      { localidade: { id: '29', nome: 'Bahia' }, serie: { 2022: bahia } }
    ]
  })) }];
}

export function fixture() {
  const total = ['6794', 'Total'], allRaces = ['95251', 'Total'], allAges = ['100362', 'Total'];
  return {
    municipalityId: '2911709',
    provider: 'swift',
    fetchedAt: '2026-11-25T14:00:00Z',
    sourceUrls: { censoEscolar: 'https://servicodados.ibge.gov.br/api/v1/pesquisas/13' },
    censoEscolar: [
      { id: 5908, res: series({ 2023: '11734', 2024: '11552', 2025: '11515' }) },
      { id: 5913, res: series({ 2023: '3680', 2024: '-', 2025: '3546' }) },
      { id: 5950, res: series({ 2023: '37', 2024: '37', 2025: null }) }
    ],
    alfabetizacao: percentVariable('2513', [
      [{ 2: total, 86: allRaces, 287: allAges }, '88.16', '87.40'],
      [{ 2: ['4', 'Homens'], 86: allRaces, 287: allAges }, '87.28', '86.23'],
      [{ 2: ['5', 'Mulheres'], 86: allRaces, 287: allAges }, '88.96', '88.47'],
      [{ 2: total, 86: ['2777', 'Preta'], 287: allAges }, '82.19', '86.67'],
      [{ 2: ['4', 'Homens'], 86: ['2777', 'Preta'], 287: allAges }, '81.07', '85.56']
    ]),
    frequenciaEscolar: percentVariable('3795', [
      [{ 58: ['95253', 'Total'], 2: total, 86: allRaces }, '24.77', '26.38'],
      [{ 58: ['31615', '6 a 14 anos'], 2: total, 86: allRaces }, '98.93', '98.43'],
      [{ 58: ['2792', '15 a 17 anos'], 2: total, 86: allRaces }, '...', '85.77']
    ])
  };
}
