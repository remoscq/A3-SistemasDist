import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.js';
import { SECURITY_HEADERS } from '../lib/headers.js';
const env = { VAPOR_API_ORIGIN: 'https://swift.example.com' };
const payload = { variables: [], provider: 'swift', fetchedAt: '2026-11-16T14:00:00Z', sourceUrl: 'https://servicodados.ibge.gov.br/' };

const request = (path, method = 'GET') => new Request(`https://example.com${path}`, { method });

function assertSecured(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value);
  }
}

test('Worker consulta somente o servidor Vapor configurado e preserva o contrato Swift', async () => {
  let calls = 0;
  const worker = createWorker(async url => {
    assert.equal(url, 'https://swift.example.com/api/indicadores');
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return Response.json(payload);
  });
  const responses = await Promise.all([
    worker.fetch(request('/api/indicadores'), env),
    worker.fetch(request('/api/indicadores?atualizar=1'), env)
  ]);
  responses.push(await worker.fetch(request('/api/indicadores'), env));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assertSecured(response);
    const payload = await response.json();
    assert.deepEqual(payload.variables, []);
    assert.equal(payload.provider, 'swift');
    assert.equal(payload.sourceUrl, 'https://servicodados.ibge.gov.br/');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 3);
});

test('Worker rejeita métodos diferentes de GET sem consultar o Vapor', async () => {
  const worker = createWorker(() => assert.fail('Não deveria consultar o Vapor.'));
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
    const response = await worker.fetch(request('/api/indicadores', method), {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertSecured(response);
  }
});

test('Worker retorna falhas sem cache e permite tentar novamente', async () => {
  let fail = true;
  const worker = createWorker(async () => {
    if (fail) return Response.json({ error: 'indisponível' }, { status: 503 });
    return Response.json(payload);
  });
  const failed = await worker.fetch(request('/api/indicadores'), env);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assertSecured(failed);
  fail = false;
  assert.equal((await worker.fetch(request('/api/indicadores'), env)).status, 200);
  const timeout = createWorker(async () => { throw new DOMException('Demorou', 'TimeoutError'); });
  assert.equal((await timeout.fetch(request('/api/indicadores'), env)).status, 504);
});

test('Worker encaminha arquivos ao binding ASSETS e preserva status e cabeçalhos', async () => {
  const worker = createWorker(() => assert.fail('Não deveria consultar o Vapor.'));
  for (const [path, status] of [['/', 200], ['/styles.css', 200], ['/inexistente', 404]]) {
    const response = await worker.fetch(request(path), {
      ASSETS: { async fetch(received) {
        assert.equal(new URL(received.url).pathname, path);
        return new Response('arquivo', { status, headers: { ETag: 'original' } });
      } }
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('etag'), 'original');
    assert.equal(await response.text(), 'arquivo');
    assertSecured(response);
  }
});

test('rotas desconhecidas da API retornam 404 sem servir HTML', async () => {
  const worker = createWorker(() => assert.fail('Não deveria consultar o Vapor.'));
  for (const path of ['/api', '/api/inexistente']) {
    const response = await worker.fetch(request(path), {});
    assert.equal(response.status, 404);
    assertSecured(response);
  }
});


test('Worker exige a origem Vapor e nunca consulta o IBGE diretamente', async () => {
  const worker = createWorker(() => assert.fail('Não deve haver consulta sem configuração.'));
  const response = await worker.fetch(request('/api/indicadores'), {});
  assert.equal(response.status, 503);
  assertSecured(response);
});
