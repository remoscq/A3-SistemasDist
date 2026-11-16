import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSwiftIndicators } from '../lib/swift.js';

const payload = { variables: [], fetchedAt: '2026-11-16T14:00:00Z', sourceUrl: 'https://servicodados.ibge.gov.br/', provider: 'swift' };

test('adaptador consulta a rota fixa Vapor sem comandos ou parâmetros do navegador', async () => {
  const result = await fetchSwiftIndicators('https://api.example.com', async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/indicadores');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(payload);
  });
  assert.deepEqual(result, payload);
});

test('origens inválidas são rejeitadas antes de fazer uma consulta', async () => {
  for (const origin of ['', 'http://api.example.com', 'https://user:pass@example.com', 'https://api.example.com/rota', 'https://api.example.com/?url=outra', 'https://api.example.com/#fragmento']) {
    await assert.rejects(fetchSwiftIndicators(origin, () => assert.fail('Não deveria consultar.')));
  }
  await fetchSwiftIndicators('http://127.0.0.1:3000', async () => Response.json(payload));
});

test('respostas inválidas ou de outro provedor não substituem a API Swift', async () => {
  for (const invalid of [{}, { ...payload, variables: {} }, { ...payload, provider: 'ibge' }, { ...payload, fetchedAt: 'inválido' }]) {
    await assert.rejects(fetchSwiftIndicators('https://api.example.com', async () => Response.json(invalid)));
  }
  await assert.rejects(fetchSwiftIndicators('https://api.example.com', async () => new Response('', { status: 504 })), error => error.status === 504);
});
