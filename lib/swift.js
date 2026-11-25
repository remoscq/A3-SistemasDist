import { normalizeVariables } from '../public/data.js';
import { normalizeGuanambi, MUNICIPALITY_ID } from '../public/guanambi-data.js';

function vaporBase(origin) {
  const base = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) ||
      base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Configure VAPOR_API_ORIGIN com a origem HTTPS do servidor Vapor.');
  }
  return base;
}

/** Consulta uma rota fixa do Vapor e valida o contrato antes de repassar a resposta. */
async function fetchSwift(origin, path, validate, fetcher) {
  const response = await fetcher(new URL(path, vaporBase(origin)).href, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
    redirect: 'error'
  });
  if (!response.ok) {
    const error = new Error('A API Swift está indisponível.');
    error.status = response.status === 504 ? 504 : 502;
    throw error;
  }
  const payload = await response.json();
  validate(payload);
  if (payload.provider !== 'swift' || !Number.isFinite(Date.parse(payload.fetchedAt))) {
    throw new Error('Resposta inválida da API Swift.');
  }
  return payload;
}

export function fetchSwiftIndicators(origin, fetcher = fetch) {
  return fetchSwift(origin, '/api/indicadores', payload => {
    normalizeVariables(payload.variables);
    if (typeof payload.sourceUrl !== 'string') throw new Error('Resposta inválida da API Swift.');
  }, fetcher);
}

export function fetchSwiftGuanambi(origin, fetcher = fetch) {
  return fetchSwift(origin, '/api/guanambi', payload => {
    normalizeGuanambi(payload);
    if (payload.municipalityId !== MUNICIPALITY_ID || !payload.sourceUrls || typeof payload.sourceUrls !== 'object' ||
        !Object.values(payload.sourceUrls).every(url => typeof url === 'string')) {
      throw new Error('Resposta inválida da API Swift.');
    }
  }, fetcher);
}
